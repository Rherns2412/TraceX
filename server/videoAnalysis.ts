import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import type { Camera, Detection, ProcessingJob, TimelineEvent } from '../src/types/index.ts';
import { cvAdapter } from './cvAdapter.ts';

const projectRoot = process.cwd();
const activeProcesses = new Map<string, ChildProcess>();
const activeJobByCamera = new Map<string, string>();
const pythonScript = path.join(projectRoot, 'python_service', 'cv_service.py');

function resolvePythonPath(): string {
  const configuredPath = process.env.TRACEX_PYTHON_PATH;
  if (configuredPath) return configuredPath;
  return path.join(
    projectRoot,
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python'
  );
}

function asDetection(value: unknown, cameraId: string): Detection | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const bbox = row.bbox as Record<string, unknown> | undefined;
  const bboxPixels = row.bboxPixels as Record<string, unknown> | undefined;
  const frameWidth = Number(row.frameWidth);
  const frameHeight = Number(row.frameHeight);
  const coordinates = bbox && [bbox.x1, bbox.y1, bbox.x2, bbox.y2].map(Number);
  const pixelCoordinates = bboxPixels && [bboxPixels.x1, bboxPixels.y1, bboxPixels.x2, bboxPixels.y2].map(Number);
  if (
    !coordinates || !pixelCoordinates || frameWidth <= 0 || frameHeight <= 0 ||
    ![...coordinates, ...pixelCoordinates].every(Number.isFinite) ||
    coordinates[0] < 0 || coordinates[1] < 0 || coordinates[2] > 1 || coordinates[3] > 1 ||
    coordinates[2] <= coordinates[0] || coordinates[3] <= coordinates[1] ||
    pixelCoordinates[0] < 0 || pixelCoordinates[1] < 0 ||
    pixelCoordinates[2] > frameWidth || pixelCoordinates[3] > frameHeight ||
    pixelCoordinates[2] <= pixelCoordinates[0] || pixelCoordinates[3] <= pixelCoordinates[1] ||
    !Number.isInteger(row.frameIdx) || Number(row.frameIdx) < 0 ||
    !Number.isFinite(Number(row.timestampSec)) || !Number.isFinite(Number(row.confidence))
  ) {
    return null;
  }

  return {
    id: String(row.id),
    frameIdx: Number(row.frameIdx),
    timestampSec: Number(row.timestampSec),
    frameWidth,
    frameHeight,
    bbox: { x1: coordinates[0], y1: coordinates[1], x2: coordinates[2], y2: coordinates[3] },
    bboxPixels: {
      x1: pixelCoordinates[0],
      y1: pixelCoordinates[1],
      x2: pixelCoordinates[2],
      y2: pixelCoordinates[3],
    },
    confidence: Number(row.confidence),
    localTrackId: String(row.localTrackId || ''),
  };
}

function formatTime(timestampSec: number): string {
  const mins = Math.floor(timestampSec / 60);
  const secs = Math.floor(timestampSec % 60);
  const tenths = Math.floor((timestampSec % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function addTrackEvents(camera: Camera, detections: Detection[]): TimelineEvent[] {
  const firstSeenByTrack = new Map<string, Detection>();
  for (const detection of detections) {
    if (detection.localTrackId && !firstSeenByTrack.has(detection.localTrackId)) {
      firstSeenByTrack.set(detection.localTrackId, detection);
    }
  }
  return Array.from(firstSeenByTrack.entries()).map(([trackId, detection], index) => ({
    id: `event-${camera.id}-${index}-${detection.frameIdx}`,
    videoId: camera.id,
    cameraId: camera.id,
    cameraName: camera.name,
    timestampSec: detection.timestampSec,
    timestampFormatted: formatTime(detection.timestampSec),
    localTrackId: trackId,
    eventType: 'entered_frame',
    severity: 'info',
    confidence: detection.confidence,
    title: `${trackId} first detected`,
    description: `ByteTrack assigned this local track on ${camera.name}. No cross-camera identity is inferred.`,
    bbox: detection.bbox,
  }));
}

function failJob(jobId: string, camera: Camera, message: string): void {
  cvAdapter.updateJob(jobId, {
    status: 'failed',
    currentStage: 'Analysis failed',
    error: message,
    completedAt: new Date().toISOString(),
  });
  cvAdapter.appendJobLog(jobId, `Failed: ${message}`);
  camera.status = 'online';
}

export function startVideoAnalysis(
  camera: Camera,
  videoPath: string,
  confidence: number,
  onTimelineEvents: (events: TimelineEvent[]) => void
): ProcessingJob {
  if (activeJobByCamera.has(camera.id)) {
    throw new Error(`Analysis is already running for ${camera.name}.`);
  }
  const pythonPath = resolvePythonPath();
  if (!existsSync(pythonPath)) {
    throw new Error(`Python runtime not found at ${pythonPath}. Create the project .venv or set TRACEX_PYTHON_PATH.`);
  }
  if (!existsSync(pythonScript)) {
    throw new Error(`The video analysis worker is missing: ${pythonScript}`);
  }
  if (!existsSync(videoPath)) {
    throw new Error(`The video file is missing: ${videoPath}`);
  }
  if (!Number.isFinite(confidence) || confidence < 0.1 || confidence > 0.9) {
    throw new Error('Confidence threshold must be between 0.1 and 0.9.');
  }

  const modelPath = process.env.TRACEX_MODEL_PATH || path.join(projectRoot, 'data', 'models', process.env.TRACEX_MODEL || 'yolo11n.pt');
  mkdirSync(path.dirname(modelPath), { recursive: true });
  cvAdapter.clearDetections(camera.id);
  cvAdapter.clearVideoJobs(camera.id);

  const jobId = `analysis-${camera.id}-${Date.now()}`;
  const job: ProcessingJob = {
    id: jobId,
    videoId: camera.id,
    cameraId: camera.id,
    cameraName: camera.name,
    filename: path.basename(videoPath),
    status: 'processing',
    progressPercent: 0,
    currentStage: 'Starting full-frame analysis',
    fps: camera.fps,
    framesProcessed: 0,
    totalFrames: Math.max(0, Math.round(camera.durationSec * camera.fps)),
    detectionsCount: 0,
    identitiesDiscovered: 0,
    framesWithDetections: 0,
    createdAt: new Date().toISOString(),
    logs: [`[${new Date().toLocaleTimeString()}] Starting ${process.env.TRACEX_MODEL || 'YOLO11n'} person detection with persistent ByteTrack.`],
  };
  cvAdapter.createJob(job);
  camera.detectionRun = false;
  camera.totalDetectionsCount = 0;
  camera.processedFrames = 0;
  camera.status = 'processing';

  const imageSize = process.env.TRACEX_IMAGE_SIZE || '640';
  let child: ChildProcess;
  try {
    child = spawn(
      pythonPath,
      [
        '-u',
        pythonScript,
        '--video', videoPath,
        '--camera-id', camera.id,
        '--model', modelPath,
        '--confidence', String(confidence),
        '--imgsz', imageSize,
      ],
      {
        cwd: projectRoot,
        env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONUTF8: '1' },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not launch the Python analysis worker.';
    failJob(jobId, camera, message);
    throw new Error(message);
  }
  activeProcesses.set(jobId, child);
  activeJobByCamera.set(camera.id, jobId);

  let stdoutBuffer = '';
  let stderrBuffer = '';
  let workerError: string | null = null;
  const handleWorkerMessage = (line: string) => {
    if (!line.trim()) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      workerError = `Analysis worker returned invalid JSON: ${line.slice(0, 240)}`;
      child.kill();
      return;
    }

    if (event.type === 'stage') {
      const stage = String(event.stage || 'Preparing detector');
      cvAdapter.updateJob(jobId, { currentStage: stage });
      cvAdapter.appendJobLog(jobId, stage);
    } else if (event.type === 'metadata') {
      const fps = Number(event.fps);
      const totalFrames = Number(event.totalFrames);
      const frameWidth = Number(event.frameWidth);
      const frameHeight = Number(event.frameHeight);
      if (![fps, totalFrames, frameWidth, frameHeight].every(Number.isFinite) || fps <= 0 || frameWidth <= 0 || frameHeight <= 0) {
        workerError = 'Analysis worker returned invalid video metadata.';
        child.kill();
        return;
      }
      camera.fps = fps;
      camera.resolution = `${frameWidth}x${frameHeight}`;
      cvAdapter.updateJob(jobId, {
        fps,
        totalFrames: Math.max(0, totalFrames),
        modelName: String(event.model || ''),
        currentStage: `Processing every frame with ${String(event.model || 'YOLO')} + ByteTrack`,
      });
      cvAdapter.appendJobLog(jobId, `Video: ${frameWidth}x${frameHeight} at ${fps.toFixed(3)} FPS; model ${String(event.model)}; ${String(event.device)}.`);
    } else if (event.type === 'frame') {
      if (!Number.isInteger(event.frameIdx) || !Array.isArray(event.detections)) {
        workerError = 'Analysis worker returned an invalid frame result.';
        child.kill();
        return;
      }
      const detections = event.detections
        .map(row => asDetection(row, camera.id))
        .filter((row): row is Detection => row !== null);
      if (detections.length !== event.detections.length) {
        workerError = `Analysis worker produced invalid coordinates on frame ${String(event.frameIdx)}.`;
        child.kill();
        return;
      }
      cvAdapter.appendDetections(camera.id, detections);
      const framesProcessed = Number(event.frameIdx) + 1;
      const totalFrames = Number(event.totalFrames);
      const detectionCount = Number(event.totalDetections);
      const framesWithDetections = Number(event.framesWithDetections);
      cvAdapter.updateJob(jobId, {
        framesProcessed,
        totalFrames: totalFrames > 0 ? totalFrames : framesProcessed,
        progressPercent: totalFrames > 0 ? Math.min(99, Math.floor((framesProcessed / totalFrames) * 100)) : 0,
        detectionsCount: detectionCount,
        framesWithDetections,
        processingTimeSec: Number(event.elapsedSec),
        currentStage: `Processed frame ${framesProcessed}${totalFrames > 0 ? ` of ${totalFrames}` : ''}`,
      });
      camera.processedFrames = framesProcessed;
      if (framesProcessed % 100 === 0) {
        cvAdapter.appendJobLog(jobId, `Processed ${framesProcessed}/${totalFrames || '?'} frames; ${detectionCount} person boxes so far.`);
      }
    } else if (event.type === 'complete') {
      const detections = cvAdapter.getDetectionsForVideo(camera.id, 0);
      const summary = event as Record<string, number | string>;
      const events = addTrackEvents(camera, detections);
      onTimelineEvents(events);
      cvAdapter.updateJob(jobId, {
        status: 'completed',
        currentStage: `Completed ${Number(summary.framesProcessed)} frames`,
        progressPercent: 100,
        framesProcessed: Number(summary.framesProcessed),
        totalFrames: Number(summary.totalFrames),
        framesWithDetections: Number(summary.framesWithDetections),
        detectionsCount: Number(summary.totalDetections),
        identitiesDiscovered: new Set(detections.map(item => item.localTrackId).filter(Boolean)).size,
        processingTimeSec: Number(summary.processingTimeSec),
        completedAt: new Date().toISOString(),
      });
      camera.detectionRun = true;
      camera.totalDetectionsCount = Number(summary.totalDetections);
      camera.processedFrames = Number(summary.framesProcessed);
      camera.status = 'online';
      cvAdapter.appendJobLog(
        jobId,
        `Completed ${Number(summary.framesProcessed)} frames; ${Number(summary.framesWithDetections)} frames had detections; ${Number(summary.totalDetections)} boxes in ${Number(summary.processingTimeSec).toFixed(1)}s.`
      );
    } else if (event.type === 'cancelled') {
      cvAdapter.updateJob(jobId, {
        status: 'cancelled',
        currentStage: 'Analysis cancelled',
        completedAt: new Date().toISOString(),
      });
      camera.status = 'online';
    } else if (event.type === 'error') {
      workerError = String(event.message || 'Video analysis failed.');
    }
  };

  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString('utf8');
    let newline = stdoutBuffer.indexOf('\n');
    while (newline !== -1) {
      const line = stdoutBuffer.slice(0, newline);
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      handleWorkerMessage(line);
      newline = stdoutBuffer.indexOf('\n');
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuffer = (stderrBuffer + chunk.toString('utf8')).slice(-8000);
  });
  child.on('error', error => {
    workerError = `Could not start the analysis worker: ${error.message}`;
    failJob(jobId, camera, workerError);
  });
  child.on('close', code => {
    if (stdoutBuffer.trim()) handleWorkerMessage(stdoutBuffer);
    activeProcesses.delete(jobId);
    activeJobByCamera.delete(camera.id);
    const currentJob = cvAdapter.getJob(jobId);
    if (!currentJob || currentJob.status !== 'processing') return;
    if (workerError) {
      failJob(jobId, camera, `${workerError}${stderrBuffer.trim() ? ` ${stderrBuffer.trim().slice(-1200)}` : ''}`);
    } else if (code !== 0) {
      failJob(jobId, camera, stderrBuffer.trim().slice(-1200) || `Analysis worker exited with code ${String(code)}.`);
    } else {
      failJob(jobId, camera, 'Analysis worker exited without a completion summary.');
    }
  });

  return job;
}

export function cancelVideoAnalysis(jobId: string): boolean {
  const process = activeProcesses.get(jobId);
  const job = cvAdapter.getJob(jobId);
  if (!process || !job || job.status !== 'processing') return false;
  cvAdapter.updateJob(jobId, {
    status: 'cancelled',
    currentStage: 'Analysis cancelled',
    completedAt: new Date().toISOString(),
  });
  cvAdapter.appendJobLog(jobId, 'Cancellation requested; stopping the per-video worker.');
  process.kill();
  return true;
}

export function cancelCameraAnalysis(cameraId: string): void {
  const jobId = activeJobByCamera.get(cameraId);
  if (jobId) cancelVideoAnalysis(jobId);
}
