import express, { Request, Response } from 'express';
import { createWriteStream } from 'fs';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  DEMO_CAMERAS,
  DEMO_IDENTITIES,
  DEMO_REID_MATCHES,
  DEMO_TIMELINE_EVENTS,
  DEMO_PROCESSING_JOBS,
} from './server/mockData.ts';
import { reidEngine } from './server/reidService.ts';
import { cvAdapter } from './server/cvAdapter.ts';
import { cancelCameraAnalysis, cancelVideoAnalysis, startVideoAnalysis } from './server/videoAnalysis.ts';
import {
  Camera,
  GlobalIdentity,
  CrossCameraMatch,
  TimelineEvent,
  InvestigationDossier,
} from './src/types/index.ts';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const execFileAsync = promisify(execFile);
const removedCameraIdsPath = path.join(__dirname, 'data', 'removed-camera-ids.json');
const uploadsDirectory = path.join(__dirname, 'data', 'uploads');
mkdirSync(uploadsDirectory, { recursive: true });

function loadRemovedCameraIds(): Set<string> {
  if (!existsSync(removedCameraIdsPath)) return new Set();
  const parsed: unknown = JSON.parse(readFileSync(removedCameraIdsPath, 'utf8'));
  if (!Array.isArray(parsed) || !parsed.every(id => typeof id === 'string')) {
    throw new Error(`Invalid removed-camera list in ${removedCameraIdsPath}.`);
  }
  return new Set(parsed);
}

const removedCameraIds = loadRemovedCameraIds();

function nextCameraId(): string {
  let sequence = 1;
  let id = `cam-${String(sequence).padStart(2, '0')}`;
  while (liveCameras.some(camera => camera.id === id) || removedCameraIds.has(id)) {
    sequence += 1;
    id = `cam-${String(sequence).padStart(2, '0')}`;
  }
  return id;
}

// Serve public videos statically
app.use('/videos', express.static(path.join(__dirname, 'public/videos')));
app.use('/uploads', express.static(uploadsDirectory));
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// User-provided camera footage is loaded at startup and processed by the browser detector.
let liveCameras: Camera[] = [
  {
    id: 'cam-01',
    name: 'Camera 01',
    location: 'Camera view 01',
    resolution: '360x288',
    fps: 25,
    status: 'online',
    videoUrl: '/videos/camera_01.mp4',
    durationSec: 100,
    isDemoData: false,
    totalDetectionsCount: 0,
    detectionRun: false,
    processedFrames: 0,
  },
  {
    id: 'cam-02',
    name: 'Camera 02',
    location: 'Camera view 02',
    resolution: '360x288',
    fps: 25,
    status: 'online',
    videoUrl: '/videos/camera_02.mp4',
    durationSec: 156.6,
    isDemoData: false,
    totalDetectionsCount: 0,
    detectionRun: false,
    processedFrames: 0,
  },
  {
    id: 'cam-03',
    name: 'Camera 03',
    location: 'Camera view 03',
    resolution: '360x288',
    fps: 25,
    status: 'online',
    videoUrl: '/videos/camera_03.mp4',
    durationSec: 156.6,
    isDemoData: false,
    totalDetectionsCount: 0,
    detectionRun: false,
    processedFrames: 0,
  },
  {
    id: 'cam-04',
    name: 'Camera 04',
    location: 'Camera view 04',
    resolution: '360x288',
    fps: 25,
    status: 'online',
    videoUrl: '/videos/camera_04.mp4',
    durationSec: 156.6,
    isDemoData: false,
    totalDetectionsCount: 0,
    detectionRun: false,
    processedFrames: 0,
  },
];
liveCameras = liveCameras.filter(camera => !removedCameraIds.has(camera.id));
let liveIdentities: GlobalIdentity[] = [];
let liveReidMatches: CrossCameraMatch[] = [];
let liveTimelineEvents: TimelineEvent[] = [];

// Demo Dataset State (Preserved for evaluation and labeled as DEMO DATA)
let demoCameras: Camera[] = [...DEMO_CAMERAS];
let demoIdentities: GlobalIdentity[] = [...DEMO_IDENTITIES];
let demoReidMatches: CrossCameraMatch[] = [...DEMO_REID_MATCHES];
let demoTimelineEvents: TimelineEvent[] = [...DEMO_TIMELINE_EVENTS];

// Store demo detections in CV adapter for demo camera IDs
DEMO_TIMELINE_EVENTS.forEach(evt => {
  if (evt.bbox) {
    const existing = cvAdapter.getDetectionsForVideo(evt.cameraId, 0);
    existing.push({
      id: `det-${evt.id}`,
      frameIdx: Math.round(evt.timestampSec * 30),
      timestampSec: evt.timestampSec,
      bbox: evt.bbox,
      confidence: evt.confidence,
      localTrackId: evt.localTrackId,
      globalPersonId: evt.globalPersonId,
    });
    cvAdapter.storeDetections(evt.cameraId, existing);
  }
});

// =========================================================================
// CORSAIR & COMPUTER-VISION ENDPOINTS
// =========================================================================

/**
 * GET /api/cv/spec
 */
app.get('/api/cv/spec', (_req: Request, res: Response) => {
  res.json({
    pluginId: 'corsair-tracex-cv-v1',
    name: 'TraceX Computer Vision & Re-ID Integration',
    version: '1.4.0',
    description: 'Interface for video ingestion, YOLOv11 person detection, ByteTrack tracking, and OSNet Re-ID',
    endpoints: {
      registerVideo: { method: 'POST', path: '/api/videos/upload' },
      runDetection: { method: 'POST', path: '/api/videos/:id/run-detection' },
      getJobStatus: { method: 'GET', path: '/api/jobs/:id' },
      getDetections: { method: 'GET', path: '/api/videos/:id/detections' },
      computeReid: { method: 'POST', path: '/api/cv/reid-match' },
      searchEvents: { method: 'POST', path: '/api/events/search' },
      exportDossier: { method: 'POST', path: '/api/evidence/export' },
    },
  });
});

/**
 * GET /api/cv/status
 */
app.get('/api/cv/status', async (_req: Request, res: Response) => {
  const status = await cvAdapter.getServiceStatus();
  res.json(status);
});

/**
 * POST /api/cv/reid-match
 */
app.post('/api/cv/reid-match', (req: Request, res: Response) => {
  const { sourceEmbedding, candidateEmbedding, sourceCameraId, targetCameraId, timeDeltaSec } = req.body;
  if (!sourceEmbedding || !candidateEmbedding) {
    return res.status(400).json({ error: 'sourceEmbedding and candidateEmbedding are required' });
  }

  const result = reidEngine.evaluatePair(
    sourceEmbedding,
    candidateEmbedding,
    sourceCameraId || 'cam-01',
    targetCameraId || 'cam-02',
    timeDeltaSec || 30
  );

  res.json(result);
});

// =========================================================================
// CAMERAS & VIDEO REGISTRATION
// =========================================================================

/**
 * GET /api/cameras
 */
app.get('/api/cameras', (req: Request, res: Response) => {
  const isDemo = req.query.mode === 'demo';
  res.json(isDemo ? demoCameras : liveCameras);
});

/**
 * DELETE /api/cameras/:id
 * Removes live footage and analysis data from the workspace, without deleting files.
 */
app.delete('/api/cameras/:id', (req: Request, res: Response) => {
  if (req.query.mode === 'demo') {
    return res.status(400).json({ error: 'Demo footage cannot be removed.' });
  }
  const camera = liveCameras.find(item => item.id === req.params.id);
  if (!camera) return res.status(404).json({ error: 'Footage not found in this workspace.' });

  const updatedRemovedIds = new Set(removedCameraIds);
  updatedRemovedIds.add(camera.id);
  writeFileSync(removedCameraIdsPath, JSON.stringify([...updatedRemovedIds], null, 2));
  removedCameraIds.add(camera.id);
  cancelCameraAnalysis(camera.id);
  liveCameras = liveCameras.filter(item => item.id !== camera.id);
  liveTimelineEvents = liveTimelineEvents.filter(event => event.cameraId !== camera.id);
  liveIdentities = liveIdentities.filter(identity =>
    identity.firstSeenCamera !== camera.id &&
    identity.firstSeenCamera !== camera.name &&
    !identity.camerasTraversed.includes(camera.id) &&
    !identity.camerasTraversed.includes(camera.name)
  );
  liveReidMatches = liveReidMatches.filter(match =>
    match.sourceCameraId !== camera.id && match.targetCameraId !== camera.id
  );
  cvAdapter.clearDetections(camera.id);
  cvAdapter.clearVideoJobs(camera.id);

  return res.json({
    success: true,
    cameraId: camera.id,
    originalFilesDeleted: false,
  });
});

/**
 * POST /api/cameras
 */
app.post('/api/cameras', (req: Request, res: Response) => {
  const { name, location, resolution, fps } = req.body;
  if (!name) return res.status(400).json({ error: 'Camera name is required' });

  const id = nextCameraId();
  const newCam: Camera = {
    id,
    name,
    location: location || 'Surveillance Location',
    resolution: resolution || '1920x1080 @ 30fps',
    fps: fps || 30,
    status: 'online',
    durationSec: 0,
    isDemoData: false,
    totalDetectionsCount: 0,
    detectionRun: false,
    processedFrames: 0,
  };

  liveCameras.push(newCam);
  res.status(201).json(newCam);
});

/**
 * POST /api/videos/upload
 */
app.post('/api/videos/upload', async (req: Request, res: Response) => {
  const fileExtensions: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/x-msvideo': '.avi',
    'video/avi': '.avi',
    'video/quicktime': '.mov',
  };
  const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
  const extension = fileExtensions[contentType];
  if (!extension) return res.status(415).json({ error: 'Upload an MP4, WebM, AVI, or MOV video.' });

  const maxUploadBytes = 2 * 1024 * 1024 * 1024;
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > maxUploadBytes) {
    return res.status(413).json({ error: 'Video exceeds the 2 GB upload limit.' });
  }

  const requestedCameraId = typeof req.query.cameraId === 'string' ? req.query.cameraId : '';
  if (requestedCameraId && removedCameraIds.has(requestedCameraId)) {
    return res.status(409).json({ error: 'This camera was removed from the workspace. Choose a new camera ID to add it again.' });
  }

  const storedFilename = `${randomUUID()}${extension}`;
  const storedPath = path.join(uploadsDirectory, storedFilename);
  let receivedBytes = 0;
  const sizeLimit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      callback(receivedBytes > maxUploadBytes ? new Error('Video exceeds the 2 GB upload limit.') : null, chunk);
    },
  });

  try {
    await pipeline(req, sizeLimit, createWriteStream(storedPath, { flags: 'wx' }));
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,avg_frame_rate,r_frame_rate,duration,nb_frames:format=duration',
      '-of', 'json',
      storedPath,
    ], { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 });
    const probe = JSON.parse(stdout);
    const stream = probe.streams?.[0];
    if (!stream) throw new Error('The uploaded file has no readable video stream.');
    const fpsValue = String(stream.avg_frame_rate || stream.r_frame_rate || '');
    const [fpsNumerator, fpsDenominator] = fpsValue.split('/').map(Number);
    const fps = fpsDenominator ? fpsNumerator / fpsDenominator : fpsNumerator;
    const durationSec = Number(stream.duration || probe.format?.duration);
    const frameWidth = Number(stream.width);
    const frameHeight = Number(stream.height);
    if (![fps, durationSec, frameWidth, frameHeight].every(Number.isFinite) || fps <= 0 || durationSec <= 0) {
      throw new Error('Video metadata did not contain a valid duration, frame rate, and frame size.');
    }

    const cameraId = requestedCameraId || nextCameraId();
    const cameraName = typeof req.query.cameraName === 'string' ? req.query.cameraName : `Camera ${liveCameras.length + 1}`;
    const location = typeof req.query.location === 'string' ? req.query.location : 'Monitored Area';
    let camera = liveCameras.find(item => item.id === cameraId);
    if (!camera) {
      camera = {
        id: cameraId,
        name: cameraName,
        location,
        resolution: `${frameWidth}x${frameHeight}`,
        fps,
        status: 'online',
        videoUrl: `/uploads/${storedFilename}`,
        durationSec,
        isDemoData: false,
        totalDetectionsCount: 0,
        detectionRun: false,
        processedFrames: 0,
      };
      liveCameras.push(camera);
    } else {
      cancelCameraAnalysis(camera.id);
      cvAdapter.clearDetections(camera.id);
      cvAdapter.clearVideoJobs(camera.id);
      liveTimelineEvents = liveTimelineEvents.filter(event => event.cameraId !== camera!.id);
      camera.name = cameraName;
      camera.location = location;
      camera.resolution = `${frameWidth}x${frameHeight}`;
      camera.fps = fps;
      camera.videoUrl = `/uploads/${storedFilename}`;
      camera.durationSec = durationSec;
      camera.totalDetectionsCount = 0;
      camera.detectionRun = false;
      camera.processedFrames = 0;
    }

    const { job } = await cvAdapter.registerVideo(camera, path.basename(String(req.query.filename || storedFilename)));
    return res.status(201).json({ message: 'Video uploaded and registered for full-frame analysis.', camera, job });
  } catch (error) {
    if (existsSync(storedPath)) unlinkSync(storedPath);
    const message = error instanceof Error ? error.message : 'Could not process uploaded video.';
    return res.status(422).json({ error: message });
  }
});

/**
 * POST /api/videos/:id/run-detection
 */
app.post('/api/videos/:id/run-detection', async (req: Request, res: Response) => {
  const cam = liveCameras.find(c => c.id === req.params.id);
  if (!cam) return res.status(404).json({ error: 'Camera not found' });
  const requestedConfidence = Number(req.body?.confidence ?? 0.4);
  const videoUrl = cam.videoUrl || '';
  const match = videoUrl.match(/^\/(videos|uploads)\/([^/]+)$/);
  if (!match || match[2] !== path.basename(match[2])) {
    return res.status(400).json({ error: 'This footage is not stored on the local analysis server. Upload the video file to analyze it.' });
  }
  const baseDirectory = match[1] === 'videos'
    ? path.join(__dirname, 'public', 'videos')
    : uploadsDirectory;
  const videoPath = path.resolve(baseDirectory, match[2]);
  if (!videoPath.startsWith(`${path.resolve(baseDirectory)}${path.sep}`)) {
    return res.status(400).json({ error: 'Invalid local video path.' });
  }
  try {
    const job = startVideoAnalysis(cam, videoPath, requestedConfidence, events => liveTimelineEvents.push(...events));
    return res.status(202).json({ success: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start video analysis.';
    return res.status(503).json({ error: message });
  }
});

app.post('/api/jobs/:id/cancel', (req: Request, res: Response) => {
  const cancelled = cancelVideoAnalysis(req.params.id);
  if (!cancelled) return res.status(404).json({ error: 'No running job was found with this ID.' });
  return res.json({ success: true, job: cvAdapter.getJob(req.params.id) });
});

// =========================================================================
// JOBS & DETECTIONS
// =========================================================================

/**
 * GET /api/jobs
 */
app.get('/api/jobs', (req: Request, res: Response) => {
  const isDemo = req.query.mode === 'demo';
  res.json(isDemo ? DEMO_PROCESSING_JOBS : cvAdapter.getAllJobs());
});

/**
 * GET /api/jobs/:id
 */
app.get('/api/jobs/:id', (req: Request, res: Response) => {
  const job = cvAdapter.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

/**
 * GET /api/videos/:id/detections
 */
app.get('/api/videos/:id/detections', (req: Request, res: Response) => {
  const minConfidence = req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : 0.45;
  const detections = cvAdapter.getDetectionsForVideo(req.params.id, minConfidence);

  res.json({
    videoId: req.params.id,
    count: detections.length,
    minConfidence,
    detections,
  });
});

// =========================================================================
// IDENTITIES & RE-ID MATCHES
// =========================================================================

/**
 * GET /api/identities
 */
app.get('/api/identities', (req: Request, res: Response) => {
  const isDemo = req.query.mode === 'demo';
  res.json(isDemo ? demoIdentities : liveIdentities);
});

/**
 * GET /api/reid/matches
 */
app.get('/api/reid/matches', (req: Request, res: Response) => {
  const isDemo = req.query.mode === 'demo';
  res.json(isDemo ? demoReidMatches : liveReidMatches);
});

/**
 * PATCH /api/reid/matches/:id
 */
app.patch('/api/reid/matches/:id', (req: Request, res: Response) => {
  const isDemo = req.query.mode === 'demo';
  const targetList = isDemo ? demoReidMatches : liveReidMatches;
  const match = targetList.find(m => m.id === req.params.id);

  if (!match) return res.status(404).json({ error: 'Match record not found' });

  const { status, notes } = req.body;
  if (status && ['confirmed', 'unmatched', 'needs_review'].includes(status)) {
    match.matchStatus = status;
    match.analystConfirmed = status === 'confirmed';
  }
  if (notes !== undefined) match.notes = notes;

  res.json(match);
});

// =========================================================================
// INCIDENT TIMELINE & SEARCH
// =========================================================================

/**
 * GET /api/events
 */
app.get('/api/events', (req: Request, res: Response) => {
  const isDemo = req.query.mode === 'demo';
  let filtered = isDemo ? [...demoTimelineEvents] : [...liveTimelineEvents];

  if (req.query.cameraId) {
    filtered = filtered.filter(e => e.cameraId === req.query.cameraId);
  }
  if (req.query.personId) {
    filtered = filtered.filter(e => e.globalPersonId === req.query.personId);
  }
  if (req.query.eventType) {
    filtered = filtered.filter(e => e.eventType === req.query.eventType);
  }
  if (req.query.minConfidence) {
    const minC = parseFloat(req.query.minConfidence as string);
    filtered = filtered.filter(e => e.confidence >= minC);
  }

  // Chronological sort
  filtered.sort((a, b) => a.timestampSec - b.timestampSec);
  res.json(filtered);
});

/**
 * POST /api/events/search
 */
app.post('/api/events/search', (req: Request, res: Response) => {
  const isDemo = req.query.mode === 'demo';
  const currentEvents = isDemo ? demoTimelineEvents : liveTimelineEvents;
  const currentIdentities = isDemo ? demoIdentities : liveIdentities;

  const query = (req.body.query || '').trim().toLowerCase();
  if (!query) {
    return res.json({
      query: '',
      summaryText: 'Showing all logged events.',
      matchedEvents: currentEvents,
      matchedIdentities: currentIdentities,
    });
  }

  let targetPersonId: string | undefined = undefined;
  if (query.includes('person 2') || query.includes('person 02')) {
    targetPersonId = 'Person 02';
  } else if (query.includes('person 1') || query.includes('person 01')) {
    targetPersonId = 'Person 01';
  } else if (query.includes('person 3') || query.includes('person 03')) {
    targetPersonId = 'Person 03';
  }

  let matched = currentEvents.filter(evt => {
    if (targetPersonId && evt.globalPersonId !== targetPersonId) return false;
    const text = `${evt.title} ${evt.description} ${evt.cameraName} ${evt.globalPersonId || ''}`.toLowerCase();
    return text.includes(query) || (targetPersonId !== undefined);
  });

  const matchedIds = currentIdentities.filter(i => {
    if (targetPersonId) return i.id === targetPersonId;
    return matched.some(m => m.globalPersonId === i.id);
  });

  let summary = '';
  if (matched.length === 0) {
    summary = `No records found matching "${query}".`;
  } else if (targetPersonId) {
    summary = `Found ${matched.length} appearance(s) for ${targetPersonId}.`;
  } else {
    summary = `Found ${matched.length} event(s) matching query.`;
  }

  res.json({
    query,
    parsedIntent: { targetPersonId },
    summaryText: summary,
    matchedEvents: matched,
    matchedIdentities: matchedIds,
  });
});

/**
 * POST /api/evidence/export
 */
app.post('/api/evidence/export', (req: Request, res: Response) => {
  const isDemo = req.query.mode === 'demo';
  const cams = isDemo ? demoCameras : liveCameras;
  const evts = isDemo ? demoTimelineEvents : liveTimelineEvents;
  const idents = isDemo ? demoIdentities : liveIdentities;
  const matches = isDemo ? demoReidMatches : liveReidMatches;

  const dossier: InvestigationDossier = {
    caseId: req.body.caseId || 'CASE-TX-2026',
    title: req.body.title || 'CCTV Video Forensic Investigation Report',
    generatedAt: new Date().toISOString(),
    analyst: req.body.analyst || 'Lead Investigator',
    status: isDemo ? 'DEMO_DATA_PREVIEW' : 'OFFICIAL_RECORD',
    totalCameras: cams.length,
    totalIncidents: evts.length,
    keyIdentities: idents,
    reidMatches: matches,
    events: evts,
    sha256Hash: '4a5e1e53a6999037247a3712ed20f0a205e32f22b8d66bee1f417e252f1a3a4c',
  };

  res.json(dossier);
});

// =========================================================================
// DEV SERVER / STATIC ASSETS MOUNT
// =========================================================================

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`TraceX server running on port ${PORT}`);
  });
}

startServer();
