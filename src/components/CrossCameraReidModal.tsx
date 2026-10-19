import React from 'react';
import { CrossCameraMatch } from '../types/index.ts';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ShieldCheck,
  Split,
  X,
} from 'lucide-react';

interface CrossCameraReidModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: CrossCameraMatch[];
  onConfirmMatch: (id: string) => void;
  onRejectMatch: (id: string) => void;
}

export const CrossCameraReidModal: React.FC<CrossCameraReidModalProps> = ({
  isOpen,
  onClose,
  matches,
  onConfirmMatch,
  onRejectMatch,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-950 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" />
            <div>
              <h2 className="text-sm font-semibold text-neutral-100 font-mono">
                Cross-camera person review (Re-ID)
              </h2>
              <p className="text-[11px] text-neutral-400 font-mono">
                Re-identification compares appearance across different cameras; it is separate from detector confidence.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex flex-col gap-3 font-mono text-xs">
          <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded text-[11px] text-neutral-400 flex items-center justify-between">
            <span>
              Similarity scores are model comparisons, not probabilities. No cross-camera identity is assigned automatically.
            </span>
            <span className="text-neutral-300 font-semibold">{matches.length} Track Pairs Evaluated</span>
          </div>

          {matches.length === 0 ? (
            <div className="p-8 text-center text-neutral-500">
              No candidate matches are available. The current detector assigns camera-local labels only; it does not yet generate cross-camera Re-ID candidates or side-by-side evidence.
            </div>
          ) : (
            matches.map(m => {
              const isNeedsReview = m.matchStatus === 'needs_review';
              const isConfirmed = m.matchStatus === 'confirmed';

              return (
                <div
                  key={m.id}
                  className={`p-3.5 rounded border transition-all ${
                    isNeedsReview
                      ? 'bg-amber-950/20 border-amber-800/60'
                      : isConfirmed
                      ? 'bg-neutral-950/60 border-neutral-800'
                      : 'bg-neutral-950/40 border-neutral-800 opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Source -> Target */}
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-neutral-900 border border-neutral-800 rounded">
                        <div className="text-[10px] text-neutral-500">Source Feed</div>
                        <div className="font-semibold text-neutral-200">{m.sourceCameraName}</div>
                        <div className="text-neutral-400 text-[11px]">Track: {m.sourceTrackId}</div>
                      </div>

                      <div className="flex flex-col items-center px-1 text-neutral-500">
                        <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="text-[10px] tabular-nums mt-0.5">{m.travelTimeSeconds}s Δt</span>
                      </div>

                      <div className="p-2 bg-neutral-900 border border-neutral-800 rounded">
                        <div className="text-[10px] text-neutral-500">Target Feed</div>
                        <div className="font-semibold text-neutral-200">{m.targetCameraName}</div>
                        <div className="text-neutral-400 text-[11px]">Track: {m.targetTrackId}</div>
                      </div>
                    </div>

                    {/* Scores & Classification */}
                    <div className="flex flex-col sm:items-end gap-1">
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] text-neutral-500">Re-ID Similarity</div>
                          <div className="text-sm font-bold text-neutral-100 tabular-nums">
                            {(m.cosineSimilarity * 100).toFixed(1)}%
                          </div>
                        </div>

                        <div className="text-right pl-2 border-l border-neutral-800">
                          <div className="text-[10px] text-neutral-500">Det. Confidence</div>
                          <div className="text-xs text-neutral-300 tabular-nums">
                            {(m.detectionConfidence * 100).toFixed(0)}%
                          </div>
                        </div>

                        {/* Status Label */}
                        <div
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                            isConfirmed
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/80'
                              : isNeedsReview
                              ? 'bg-amber-950/60 text-amber-400 border border-amber-800/80'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {isConfirmed ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : isNeedsReview ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          <span>{isNeedsReview ? 'Needs Review' : m.matchStatus}</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-neutral-400">
                        Assigned Identity: <span className="text-neutral-100 font-semibold">{m.globalPersonId}</span>
                      </div>
                    </div>
                  </div>

                  {/* Notes / Action */}
                  {m.notes && (
                    <div className="mt-2.5 pt-2 border-t border-neutral-800/80 text-[11px] text-neutral-400 flex items-start gap-1.5">
                      <span className="text-neutral-500 shrink-0">Analysis:</span>
                      <span className="text-neutral-300">{m.notes}</span>
                    </div>
                  )}

                  {isNeedsReview && (
                    <div className="mt-2.5 pt-2 border-t border-amber-900/40 flex items-center justify-between">
                      <span className="text-[11px] text-amber-400">
                        Investigator Review: Lighting or angle variation observed
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onRejectMatch(m.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-[11px]"
                        >
                          <Split className="w-3 h-3" />
                          <span>Keep Unmatched</span>
                        </button>
                        <button
                          onClick={() => onConfirmMatch(m.id)}
                          className="flex items-center gap-1 px-3 py-1 rounded bg-purple-700 hover:bg-purple-600 text-white text-[11px] font-medium"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>Confirm Match</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-neutral-950 border-t border-neutral-800 text-xs font-mono">
          <span className="text-neutral-500">
            Re-ID = person re-identification across cameras. A match needs separate visual evidence and investigator review.
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
