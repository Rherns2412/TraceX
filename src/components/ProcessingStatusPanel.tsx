import React, { useEffect, useState } from 'react';
import { ProcessingJob, Camera } from '../types/index.ts';
import {
  Cpu,
  CheckCircle,
  AlertCircle,
  Loader2,
  Terminal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ProcessingStatusPanelProps {
  jobs: ProcessingJob[];
  activeCamera: Camera;
  cvServiceStatus?: any;
  onRunDetection?: () => void;
  onCancelDetection?: () => void;
  isDetectionRunning?: boolean;
}

export const ProcessingStatusPanel: React.FC<ProcessingStatusPanelProps> = ({
  jobs,
  activeCamera,
  cvServiceStatus,
  onRunDetection,
  onCancelDetection,
  isDetectionRunning,
}) => {
  const [showLogs, setShowLogs] = useState<boolean>(false);
  useEffect(() => {
    if (isDetectionRunning) setShowLogs(true);
  }, [isDetectionRunning]);

  const activeJob = jobs.find(j => j.cameraId === activeCamera.id);
  const isOnline = cvServiceStatus?.isOnline;
  const isJobProcessing = activeJob?.status === 'processing';

  return (
    <div className="flex flex-col bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-sm text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-neutral-950 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-neutral-400" />
          <h3 className="font-semibold text-neutral-200">
            Vision Pipeline Status — {activeCamera.name}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {/* External Service Status */}
          <span
            className={`px-2 py-0.5 rounded text-[10px] border ${
              isOnline
                ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/60'
                : 'bg-neutral-800 text-neutral-400 border-neutral-700'
            }`}
          >
            {isOnline ? 'Python Worker Available' : 'Python Worker Offline'}
          </span>

          {activeJob && (
            <span
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${
                activeJob.status === 'completed'
                  ? 'bg-neutral-900 text-neutral-300 border-neutral-700'
                  : activeJob.status === 'failed' || activeJob.status === 'offline'
                  ? 'bg-red-950/60 text-red-400 border-red-800/80'
                  : activeJob.status === 'cancelled'
                  ? 'bg-neutral-800 text-neutral-400 border-neutral-700'
                  : 'bg-purple-950/50 text-purple-300 border-purple-800/60'
              }`}
            >
              {activeJob.status === 'completed' ? (
                <CheckCircle className="w-3 h-3 text-emerald-400" />
              ) : activeJob.status === 'failed' || activeJob.status === 'offline' ? (
                <AlertCircle className="w-3 h-3 text-red-400" />
              ) : activeJob.status === 'cancelled' ? (
                <AlertCircle className="w-3 h-3 text-neutral-400" />
              ) : (
                <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
              )}
              <span className="uppercase">{activeJob.status.replace(/_/g, ' ')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-3.5 flex flex-col gap-3">
        {activeJob ? (
          <>
            {/* Progress Bar */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-neutral-400">
                <span>Stage: {activeJob.currentStage}</span>
                <span className="tabular-nums font-semibold text-neutral-200">
                  {activeJob.progressPercent}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
                <div
                  className="h-full bg-purple-600 transition-all duration-300"
                  style={{ width: `${activeJob.progressPercent}%` }}
                />
              </div>
            </div>

            {activeJob.modelName && (
              <div className="text-[11px] text-neutral-400">
                Detector: <span className="text-neutral-200">{activeJob.modelName}</span> · per-frame inference with ByteTrack
              </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2 bg-neutral-950 border border-neutral-800/80 rounded">
                <div className="text-neutral-500 text-[10px]">Processed Frames</div>
                <div className="text-neutral-200 font-semibold tabular-nums mt-0.5">
                  {activeJob.framesProcessed} / {activeJob.totalFrames}
                </div>
              </div>
              <div className="p-2 bg-neutral-950 border border-neutral-800/80 rounded">
                <div className="text-neutral-500 text-[10px]">Person Detections</div>
                <div className="text-neutral-200 font-semibold tabular-nums mt-0.5">
                  {activeJob.detectionsCount}
                </div>
              </div>
              <div className="p-2 bg-neutral-950 border border-neutral-800/80 rounded">
                <div className="text-neutral-500 text-[10px]">Local Track IDs</div>
                <div className="text-neutral-200 font-semibold tabular-nums mt-0.5">
                  {activeJob.identitiesDiscovered}
                </div>
              </div>
              <div className="p-2 bg-neutral-950 border border-neutral-800/80 rounded">
                <div className="text-neutral-500 text-[10px]">Media File</div>
                <div className="text-neutral-200 truncate mt-0.5" title={activeJob.filename}>
                  {activeJob.filename}
                </div>
              </div>
            </div>

            {/* Log Toggle */}
            {activeJob.logs && activeJob.logs.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1">
                <button
                  onClick={() => setShowLogs(!showLogs)}
                  className="flex items-center justify-between text-[11px] text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Terminal className="w-3 h-3 text-neutral-500" />
                    <span>Processing Logs ({activeJob.logs.length})</span>
                  </span>
                  {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showLogs && (
                  <div className="p-2.5 bg-black border border-neutral-800 rounded max-h-32 overflow-y-auto space-y-1 text-[10px] text-neutral-300">
                    {activeJob.logs.map((log, i) => (
                      <div key={i} className="leading-tight font-mono">
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between py-2 text-neutral-400">
            <span>No processing job recorded for this camera.</span>
          </div>
        )}
        <div className="flex justify-end gap-2">
          {onCancelDetection && (isDetectionRunning || isJobProcessing) && (
            <button
              onClick={onCancelDetection}
              className="px-3 py-1 border border-red-900 bg-red-950/50 hover:bg-red-900/60 text-red-300 rounded text-xs transition-colors"
            >
              Cancel analysis
            </button>
          )}
          {onRunDetection && (
            <button
              onClick={onRunDetection}
              disabled={isDetectionRunning}
              className="px-3 py-1 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded text-xs transition-colors"
            >
              {isDetectionRunning ? 'Analysis running…' : activeJob?.status === 'completed' ? 'Run again' : 'Run analysis'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
