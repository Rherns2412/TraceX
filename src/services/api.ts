import {
  Camera,
  ProcessingJob,
  Detection,
  GlobalIdentity,
  CrossCameraMatch,
  TimelineEvent,
  NLSearchResult,
  InvestigationDossier,
} from '../types/index.ts';

/**
 * Robust JSON fetch helper that handles HTML/non-JSON error pages safely
 */
async function safeFetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (netErr: any) {
    throw new Error(`Network request failed: ${netErr.message || 'Cannot connect to server'}`);
  }

  const contentType = res.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}: ${res.statusText || 'Error'}`);
    }
    // If somehow 200 returned HTML for an API route
    throw new Error(`API endpoint returned non-JSON response. Check route path.`);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error('Failed to parse server JSON response.');
  }

  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}: ${res.statusText}`);
  }

  return data as T;
}

export async function fetchCameras(mode: 'live' | 'demo' = 'live'): Promise<Camera[]> {
  return safeFetchJson<Camera[]>(`/api/cameras?mode=${mode}`);
}

export async function deleteCamera(cameraId: string): Promise<{ success: boolean; cameraId: string; originalFilesDeleted: boolean }> {
  return safeFetchJson(`/api/cameras/${encodeURIComponent(cameraId)}`, {
    method: 'DELETE',
  });
}

export async function createCamera(data: { name: string; location: string; resolution?: string; fps?: number }): Promise<Camera> {
  return safeFetchJson<Camera[]>('/api/cameras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }) as any;
}

export async function uploadVideo(data: {
  file: File;
  cameraId: string;
  cameraName: string;
  location?: string;
  filename: string;
}): Promise<{ jobId: string; camera: Camera; job: ProcessingJob }> {
  const extension = data.filename.split('.').pop()?.toLowerCase();
  const contentType = data.file.type || ({
    mp4: 'video/mp4',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
  }[extension || ''] ?? 'application/octet-stream');
  const query = new URLSearchParams({
    cameraId: data.cameraId,
    cameraName: data.cameraName,
    location: data.location || '',
    filename: data.filename,
  });
  const response = await safeFetchJson<{ camera: Camera; job: ProcessingJob }>(`/api/videos/upload?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: data.file,
  });
  return { ...response, jobId: response.job.id };
}

export async function runDetection(
  videoId: string,
  confidence = 0.4
): Promise<{ success: boolean; job: ProcessingJob }> {
  return safeFetchJson(`/api/videos/${encodeURIComponent(videoId)}/run-detection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confidence }),
  });
}

export async function cancelProcessingJob(jobId: string): Promise<{ success: boolean; job: ProcessingJob }> {
  return safeFetchJson(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
}

export async function fetchJobs(mode: 'live' | 'demo' = 'live'): Promise<ProcessingJob[]> {
  return safeFetchJson<ProcessingJob[]>(`/api/jobs?mode=${mode}`);
}

export async function fetchJob(id: string): Promise<ProcessingJob> {
  return safeFetchJson<ProcessingJob>(`/api/jobs/${encodeURIComponent(id)}`);
}

export async function fetchDetections(videoId: string, minConfidence: number = 0.45): Promise<{ videoId: string; count: number; detections: Detection[] }> {
  if (!videoId) return { videoId: '', count: 0, detections: [] };
  return safeFetchJson(`/api/videos/${encodeURIComponent(videoId)}/detections?minConfidence=${minConfidence}`);
}

export async function fetchIdentities(mode: 'live' | 'demo' = 'live'): Promise<GlobalIdentity[]> {
  return safeFetchJson<GlobalIdentity[]>(`/api/identities?mode=${mode}`);
}

export async function fetchReidMatches(mode: 'live' | 'demo' = 'live'): Promise<CrossCameraMatch[]> {
  return safeFetchJson<CrossCameraMatch[]>(`/api/reid/matches?mode=${mode}`);
}

export async function updateReidMatch(id: string, updates: { status: string; notes?: string }, mode: 'live' | 'demo' = 'live'): Promise<CrossCameraMatch> {
  return safeFetchJson(`/api/reid/matches/${encodeURIComponent(id)}?mode=${mode}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function fetchEvents(params?: {
  mode?: 'live' | 'demo';
  cameraId?: string;
  personId?: string;
  eventType?: string;
  minConfidence?: number;
}): Promise<TimelineEvent[]> {
  const q = new URLSearchParams();
  q.set('mode', params?.mode || 'live');
  if (params?.cameraId) q.set('cameraId', params.cameraId);
  if (params?.personId) q.set('personId', params.personId);
  if (params?.eventType) q.set('eventType', params.eventType);
  if (params?.minConfidence) q.set('minConfidence', params.minConfidence.toString());

  return safeFetchJson<TimelineEvent[]>(`/api/events?${q.toString()}`);
}

export async function searchEvents(query: string, mode: 'live' | 'demo' = 'live'): Promise<NLSearchResult> {
  return safeFetchJson<NLSearchResult>('/api/events/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, mode }),
  });
}

export async function exportDossier(data?: { caseId?: string; title?: string }, mode: 'live' | 'demo' = 'live'): Promise<InvestigationDossier> {
  return safeFetchJson<InvestigationDossier>(`/api/evidence/export?mode=${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(data || {}), mode }),
  });
}

export async function fetchCvStatus(): Promise<any> {
  return safeFetchJson('/api/cv/status');
}
