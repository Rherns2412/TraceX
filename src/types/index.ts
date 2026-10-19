/**
 * TraceX — CCTV Video Investigator Types
 * Standardized data model for CCTV video management, person detection, and cross-camera Re-ID.
 */

export type EventSeverity = 'high' | 'medium' | 'low' | 'info';

export type EventType =
  | 'person_detected'
  | 'entered_frame'
  | 'exited_frame'
  | 'door_access'
  | 'motion_detected'
  | 'stationary_presence'
  | 'cross_camera_transition';

export type MatchStatus = 'confirmed' | 'needs_review' | 'unmatched';

export type JobStatus =
  | 'not_run'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'offline';

export interface BoundingBox {
  x1: number; // 0.0 to 1.0 (normalized)
  y1: number;
  x2: number;
  y2: number;
}

export interface Detection {
  id: string;
  frameIdx: number;
  timestampSec: number;
  frameWidth?: number;
  frameHeight?: number;
  bbox: BoundingBox;
  bboxPixels?: BoundingBox;
  confidence: number;
  localTrackId: string;
  personLabel?: string; // Camera-local appearance label; not a cross-camera identity claim
  globalPersonId?: string; // Only assigned if cross-camera Re-ID matched
  reidSimilarity?: number; // Similarity score from Re-ID pipeline
  visualAttributes?: {
    upperClothing?: string;
    lowerClothing?: string;
  };
}

export interface Camera {
  id: string;
  name: string;
  location: string;
  resolution: string;
  fps: number;
  status: 'online' | 'processing' | 'offline';
  videoUrl?: string;
  durationSec: number;
  isDemoData: boolean;
  totalDetectionsCount: number;
  detectionRun: boolean;
  processedFrames?: number;
}

export interface ProcessingJob {
  id: string;
  videoId: string;
  cameraId: string;
  cameraName: string;
  filename: string;
  status: JobStatus;
  progressPercent: number;
  currentStage: string;
  fps: number;
  framesProcessed: number;
  totalFrames: number;
  detectionsCount: number;
  identitiesDiscovered: number;
  framesWithDetections?: number;
  processingTimeSec?: number;
  modelName?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  logs: string[];
}

export interface GlobalIdentity {
  id: string; // e.g. "Person 01"
  alias: string;
  firstSeenTimestamp: string;
  lastSeenTimestamp: string;
  firstSeenCamera: string;
  camerasTraversed: string[];
  totalDetections: number;
  verificationStatus: 'verified' | 'tentative' | 'unconfirmed';
  notes?: string;
}

export interface CrossCameraMatch {
  id: string;
  sourceCameraId: string;
  sourceCameraName: string;
  sourceTrackId: string;
  sourceTimestamp: string;
  targetCameraId: string;
  targetCameraName: string;
  targetTrackId: string;
  targetTimestamp: string;
  globalPersonId: string;
  cosineSimilarity: number; // 0.0 to 1.0 from Re-ID model
  matchStatus: MatchStatus;
  travelTimeSeconds: number;
  detectionConfidence: number; // Raw person detector confidence
  analystConfirmed: boolean;
  notes?: string;
}

export interface TimelineEvent {
  id: string;
  videoId: string;
  cameraId: string;
  cameraName: string;
  timestampSec: number;
  timestampFormatted: string; // e.g., "00:14.2"
  isoTimestamp?: string;
  localTrackId: string;
  globalPersonId?: string;
  eventType: EventType;
  severity: EventSeverity;
  confidence: number;
  title: string;
  description: string;
  bbox?: BoundingBox;
}

export interface NLSearchResult {
  query: string;
  parsedIntent: {
    targetPersonId?: string;
    targetCameraId?: string;
    targetEventType?: EventType;
  };
  summaryText: string;
  matchedEvents: TimelineEvent[];
  matchedIdentities: GlobalIdentity[];
}

export interface InvestigationDossier {
  caseId: string;
  title: string;
  generatedAt: string;
  analyst: string;
  status: string;
  totalCameras: number;
  totalIncidents: number;
  keyIdentities: GlobalIdentity[];
  reidMatches: CrossCameraMatch[];
  events: TimelineEvent[];
  sha256Hash: string;
}
