/**
 * TraceX External Computer-Vision Service Integration Adapter
 * 
 * Communicates with the external Python computer-vision worker (FastAPI / YOLOv11 / ByteTrack / OSNet).
 * If the external worker is unreachable, honestly reports offline status without fabricating fake detections.
 */

import { ProcessingJob, Detection, Camera } from '../src/types/index.ts';
import path from 'path';
import { existsSync } from 'fs';

export interface CVServiceStatus {
  serviceMode: 'connected' | 'disconnected';
  endpoint: string;
  isOnline: boolean;
  version?: string;
  hardware?: string;
  modelsLoaded?: {
    detector: string;
    tracker: string;
    reid: string;
  };
  message: string;
}

export class CVServiceAdapter {
  private serviceUrl: string;
  private jobs: Map<string, ProcessingJob> = new Map();
  private detectionsByVideo: Map<string, Detection[]> = new Map();

  constructor() {
    this.serviceUrl = process.env.CV_SERVICE_URL || '';
  }

  /**
   * Health check external Python CV worker
   */
  public async getServiceStatus(): Promise<CVServiceStatus> {
    if (!this.serviceUrl) {
      const pythonPath = process.env.TRACEX_PYTHON_PATH || path.join(
        process.cwd(),
        '.venv',
        process.platform === 'win32' ? 'Scripts' : 'bin',
        process.platform === 'win32' ? 'python.exe' : 'python'
      );
      const isOnline = existsSync(pythonPath);
      return {
        serviceMode: isOnline ? 'connected' : 'disconnected',
        endpoint: '',
        isOnline,
        version: 'Ultralytics backend',
        hardware: 'Auto-selected CPU/CUDA',
        modelsLoaded: {
          detector: process.env.TRACEX_MODEL || 'YOLO11n (person class only)',
          tracker: 'ByteTrack (per-video, persistent)',
          reid: 'Disabled; local track IDs only',
        },
        message: isOnline
          ? 'Local Python runtime found. YOLO and ByteTrack initialize when an analysis job starts.'
          : 'Local Python runtime not found. Configure TRACEX_PYTHON_PATH or create the project .venv before running detection.',
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const resp = await fetch(`${this.serviceUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.service && data.service.includes('TraceX Python CV Worker')) {
          return {
            serviceMode: 'connected',
            endpoint: this.serviceUrl,
            isOnline: true,
            version: data.version || '1.4.0',
            hardware: data.device || 'CPU (Multi-Threaded) / ffmpeg',
            modelsLoaded: {
              detector: data.models?.detector || 'YOLOv11x (person class only)',
              tracker: data.models?.tracker || 'ByteTrack (kalman filter, lapjv)',
              reid: data.models?.reid || 'OSNet (512-dim appearance embeddings)',
            },
            message: 'Connected to external Python computer-vision service (Port 5050)',
          };
        }
      }
    } catch {
      // Python service starting or unreachable
    }

    return {
      serviceMode: 'disconnected',
      endpoint: this.serviceUrl,
      isOnline: false,
      message: 'The Python CV worker is unavailable. Configure the local runtime before running person analysis.',
    };
  }

  /**
   * Register video and launch processing job
   */
  public async registerVideo(
    camera: Camera,
    filename: string
  ): Promise<{ job: ProcessingJob; videoId: string }> {
    const videoId = camera.id;
    const jobId = `job-${Date.now()}`;

    const initialJob: ProcessingJob = {
      id: jobId,
      videoId,
      cameraId: camera.id,
      cameraName: camera.name,
      filename,
      status: 'not_run',
      progressPercent: 0,
      currentStage: 'Ready for offline analysis',
      fps: camera.fps || 25,
      framesProcessed: 0,
      totalFrames: 0,
      detectionsCount: 0,
      identitiesDiscovered: 0,
      createdAt: new Date().toISOString(),
      logs: [
        `[${new Date().toLocaleTimeString()}] Registered video file: ${filename}`,
        `[${new Date().toLocaleTimeString()}] Video is ready for full-frame person detection and tracking.`,
      ],
    };

    this.jobs.set(jobId, initialJob);
    return { job: initialJob, videoId };
  }

  public getJob(jobId: string): ProcessingJob | undefined {
    return this.jobs.get(jobId);
  }

  public getAllJobs(): ProcessingJob[] {
    return Array.from(this.jobs.values());
  }

  public setInitialJobs(initialJobs: ProcessingJob[]) {
    for (const j of initialJobs) {
      this.jobs.set(j.id, j);
    }
  }

  /**
   * Get detections filtered strictly by confidence threshold and bounds validation
   */
  public getDetectionsForVideo(videoId: string, minConfidence: number = 0.45): Detection[] {
    const raw = this.detectionsByVideo.get(videoId) || [];
    return raw.filter(d => {
      // Must meet confidence threshold
      if (d.confidence < minConfidence) return false;

      // Reject invalid or out-of-frame coordinates
      const b = d.bbox;
      if (!b) return false;
      if (b.x1 < 0 || b.y1 < 0 || b.x2 > 1.05 || b.y2 > 1.05) return false;
      if (b.x2 <= b.x1 || b.y2 <= b.y1) return false;

      return true;
    });
  }

  public storeDetections(videoId: string, detections: Detection[]) {
    this.detectionsByVideo.set(videoId, detections);
  }

  public appendDetections(videoId: string, detections: Detection[]) {
    const stored = this.detectionsByVideo.get(videoId) || [];
    stored.push(...detections);
    this.detectionsByVideo.set(videoId, stored);
  }

  public createJob(job: ProcessingJob) {
    this.jobs.set(job.id, job);
  }

  public updateJob(jobId: string, updates: Partial<ProcessingJob>): ProcessingJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    Object.assign(job, updates);
    return job;
  }

  public appendJobLog(jobId: string, message: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const logs = job.logs || [];
    logs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
    if (logs.length > 200) logs.splice(0, logs.length - 200);
    job.logs = logs;
  }

  public clearDetections(videoId: string) {
    this.detectionsByVideo.delete(videoId);
  }

  public clearVideoJobs(videoId: string) {
    for (const [jobId, job] of this.jobs) {
      if (job.videoId === videoId || job.cameraId === videoId) {
        this.jobs.delete(jobId);
      }
    }
  }
}

export const cvAdapter = new CVServiceAdapter();
