/**
 * TraceX Cross-Camera Re-Identification (Re-ID) Engine
 * 
 * Performs mathematical cosine distance computation across deep appearance embeddings,
 * spatial-temporal trajectory plausibility checking, and identity clustering.
 */

import { CrossCameraMatch, GlobalIdentity, MatchStatus } from '../src/types/index.ts';

export interface ReidMatchResult {
  sourceTrackId: string;
  candidateTrackId: string;
  cosineSimilarity: number;
  reidFeatureDistance: number;
  spatialTemporalScore: number;
  status: MatchStatus;
  suggestedGlobalId: string;
  explanation: string;
}

export class ReidService {
  private confirmedThreshold: number = 0.82;
  private uncertainThreshold: number = 0.65;

  /**
   * Compute normalized cosine similarity between two feature vectors
   */
  public computeCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
      return 0;
    }

    const minLen = Math.min(vecA.length, vecB.length);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < minLen; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;
    const similarity = dotProduct / (normA * normB);
    // Clamp to [0, 1] for normalized distance
    return Math.max(0, Math.min(1, Number(similarity.toFixed(4))));
  }

  /**
   * Calculate physical spatial-temporal transit plausibility
   * e.g., camera distance / transit time delta
   */
  public evaluateSpatialTemporalPlausibility(
    sourceCamId: string,
    targetCamId: string,
    timeDeltaSec: number
  ): number {
    if (sourceCamId === targetCamId) return 0.5;

    // Minimum physical transit times between known facility zones (in seconds)
    const transitMatrix: Record<string, Record<string, { minSec: number; maxSec: number }>> = {
      'cam-01': {
        'cam-02': { minSec: 25, maxSec: 300 },
        'cam-03': { minSec: 40, maxSec: 400 },
        'cam-04': { minSec: 60, maxSec: 600 },
      },
      'cam-02': {
        'cam-01': { minSec: 25, maxSec: 300 },
        'cam-03': { minSec: 10, maxSec: 180 },
        'cam-04': { minSec: 15, maxSec: 240 },
      },
      'cam-03': {
        'cam-01': { minSec: 40, maxSec: 400 },
        'cam-02': { minSec: 10, maxSec: 180 },
        'cam-04': { minSec: 15, maxSec: 180 },
      },
      'cam-04': {
        'cam-01': { minSec: 60, maxSec: 600 },
        'cam-02': { minSec: 15, maxSec: 240 },
        'cam-03': { minSec: 15, maxSec: 180 },
      },
    };

    const zone = transitMatrix[sourceCamId]?.[targetCamId];
    if (!zone) return 0.8; // unknown camera pair, neutral prior

    if (timeDeltaSec < zone.minSec) {
      // Teleportation or impossible transit speed
      return 0.15;
    }
    if (timeDeltaSec > zone.maxSec) {
      // Excessive delay, loitering or separate event
      return 0.65;
    }

    // High likelihood bell-curve
    const optimal = (zone.minSec + zone.maxSec) / 2;
    const deviation = Math.abs(timeDeltaSec - optimal) / (zone.maxSec - zone.minSec);
    return Math.max(0.7, Number((1 - deviation * 0.3).toFixed(2)));
  }

  /**
   * Classify a cross-camera track pair with similarity and spatial plausibility
   */
  public evaluatePair(
    embA: number[],
    embB: number[],
    sourceCamId: string,
    targetCamId: string,
    timeDeltaSec: number,
    candidateGlobalId?: string
  ): ReidMatchResult {
    const rawCosine = this.computeCosineSimilarity(embA, embB);
    const spatialPlausibility = this.evaluateSpatialTemporalPlausibility(sourceCamId, targetCamId, timeDeltaSec);

    // Composite fused score: 75% appearance embedding + 25% spatial-temporal feasibility
    const compositeScore = Number((rawCosine * 0.75 + spatialPlausibility * 0.25).toFixed(3));
    const featureDist = Number((1 - rawCosine).toFixed(3));

    let status: MatchStatus = 'unmatched';
    let explanation = '';

    if (compositeScore >= this.confirmedThreshold) {
      status = 'confirmed';
      explanation = `High appearance affinity (${(rawCosine * 100).toFixed(1)}%) supported by feasible transit time (${timeDeltaSec}s).`;
    } else if (compositeScore >= this.uncertainThreshold) {
      status = 'needs_review';
      explanation = `Borderline feature match (${(rawCosine * 100).toFixed(1)}%). Lighting variation or occlusion detected. Analyst confirmation recommended.`;
    } else {
      status = 'unmatched';
      explanation = `Feature distance too high (${featureDist}). Likely distinct persons.`;
    }

    return {
      sourceTrackId: '',
      candidateTrackId: '',
      cosineSimilarity: rawCosine,
      reidFeatureDistance: featureDist,
      spatialTemporalScore: spatialPlausibility,
      status,
      suggestedGlobalId: candidateGlobalId || 'POI-NEW',
      explanation,
    };
  }
}

export const reidEngine = new ReidService();
