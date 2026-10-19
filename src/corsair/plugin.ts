/**
 * Corsair AI Agent Integration Layer — TraceX Computer Vision Plugin
 * 
 * Defines type-safe action definitions, Zod input validation schemas,
 * and robust HTTP execution methods for integration with external vision services.
 */

import { z } from 'zod';

// ==========================================
// 1. ZOD INPUT SCHEMAS
// ==========================================

export const RegisterVideoInputSchema = z.object({
  cameraId: z.string().min(1, 'Camera ID is required'),
  cameraName: z.string().min(1, 'Camera name is required'),
  location: z.string().default('Surveillance Sector 1'),
  videoUrl: z.string().optional(),
  filename: z.string().default('cctv_feed.mp4'),
  resolution: z.string().default('1080p'),
  fps: z.number().positive().default(30),
  isSyntheticDemo: z.boolean().default(false),
});

export type RegisterVideoInput = z.infer<typeof RegisterVideoInputSchema>;

export const GetJobStatusInputSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
});

export type GetJobStatusInput = z.infer<typeof GetJobStatusInputSchema>;

export const GetDetectionsInputSchema = z.object({
  videoId: z.string().min(1, 'Video ID is required'),
  minConfidence: z.number().min(0).max(1).default(0.5),
  localTrackId: z.string().optional(),
  globalPersonId: z.string().optional(),
});

export type GetDetectionsInput = z.infer<typeof GetDetectionsInputSchema>;

export const ComputeReidMatchInputSchema = z.object({
  sourceTrackId: z.string().min(1),
  sourceEmbedding: z.array(z.number()).min(8),
  candidateTrackId: z.string().min(1),
  candidateEmbedding: z.array(z.number()).min(8),
  confidenceThreshold: z.number().min(0).max(1).default(0.82),
  uncertainThreshold: z.number().min(0).max(1).default(0.65),
});

export type ComputeReidMatchInput = z.infer<typeof ComputeReidMatchInputSchema>;

export const SearchIncidentsInputSchema = z.object({
  query: z.string().min(1, 'Search query cannot be empty'),
  limit: z.number().int().positive().max(100).default(50),
  minConfidence: z.number().min(0).max(1).default(0.6),
});

export type SearchIncidentsInput = z.infer<typeof SearchIncidentsInputSchema>;

export const ExportDossierInputSchema = z.object({
  caseId: z.string().default('TRACEX-INCIDENT-8921'),
  title: z.string().default('CCTV Physical Intrusion Investigation Dossier'),
  format: z.enum(['json', 'csv', 'report_html']).default('json'),
  includeCryptographicProof: z.boolean().default(true),
});

export type ExportDossierInput = z.infer<typeof ExportDossierInputSchema>;

// ==========================================
// 2. CORSAIR ACTION DEFINITIONS & EXECUTOR
// ==========================================

export interface CorsairActionContext {
  baseUrl: string;
  authToken?: string;
  headers?: Record<string, string>;
}

export interface CorsairActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
  durationMs: number;
}

export class TraceXPluginClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(context?: Partial<CorsairActionContext>) {
    // In browser or server, default to current origin API or relative
    this.baseUrl = context?.baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
    this.authToken = context?.authToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<CorsairActionResult<T>> {
    const startTime = Date.now();
    const url = `${this.baseUrl.replace(/\/$/, '')}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      ...(options.headers as Record<string, string> || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const durationMs = Date.now() - startTime;
      const contentType = response.headers.get('content-type');
      let data: any = null;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        return {
          success: false,
          error: (typeof data === 'object' && data?.error) ? data.error : `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          durationMs,
        };
      }

      return {
        success: true,
        data,
        statusCode: response.status,
        durationMs,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network request failed',
        statusCode: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // --- Actions ---

  /**
   * Action: Register a video feed for computer-vision ingestion and tracking
   */
  async registerVideo(input: RegisterVideoInput) {
    const validated = RegisterVideoInputSchema.parse(input);
    return this.request<{ jobId: string; videoId: string; status: string }>(
      '/api/videos/upload',
      {
        method: 'POST',
        body: JSON.stringify(validated),
      }
    );
  }

  /**
   * Action: Get the real-time processing status of a computer-vision pipeline job
   */
  async getJobStatus(input: GetJobStatusInput) {
    const validated = GetJobStatusInputSchema.parse(input);
    return this.request<any>(`/api/jobs/${encodeURIComponent(validated.jobId)}`);
  }

  /**
   * Action: Retrieve object detections and tracking bounding boxes for a video
   */
  async getDetections(input: GetDetectionsInput) {
    const validated = GetDetectionsInputSchema.parse(input);
    const params = new URLSearchParams();
    params.set('minConfidence', validated.minConfidence.toString());
    if (validated.localTrackId) params.set('localTrackId', validated.localTrackId);
    if (validated.globalPersonId) params.set('globalPersonId', validated.globalPersonId);

    return this.request<any>(
      `/api/videos/${encodeURIComponent(validated.videoId)}/detections?${params.toString()}`
    );
  }

  /**
   * Action: Calculate cosine distance and match classification between two track embeddings
   */
  async computeReidMatch(input: ComputeReidMatchInput) {
    const validated = ComputeReidMatchInputSchema.parse(input);
    return this.request<any>('/api/cv/reid-match', {
      method: 'POST',
      body: JSON.stringify(validated),
    });
  }

  /**
   * Action: Execute natural language search across timeline events
   */
  async searchIncidents(input: SearchIncidentsInput) {
    const validated = SearchIncidentsInputSchema.parse(input);
    return this.request<any>('/api/events/search', {
      method: 'POST',
      body: JSON.stringify(validated),
    });
  }

  /**
   * Action: Generate an authenticated forensic investigation dossier
   */
  async exportDossier(input: ExportDossierInput) {
    const validated = ExportDossierInputSchema.parse(input);
    return this.request<any>('/api/evidence/export', {
      method: 'POST',
      body: JSON.stringify(validated),
    });
  }
}

// Default exported singleton client instance
export const traceXClient = new TraceXPluginClient();
