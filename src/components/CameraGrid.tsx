import React from 'react';
import { Camera } from '../types/index.ts';
import { Camera as CameraIcon, Plus, Trash2 } from 'lucide-react';

interface CameraGridProps {
  cameras: Camera[];
  activeCameraId: string;
  onSelectCamera: (cameraId: string) => void;
  onDeleteCamera: (camera: Camera) => void;
  deletingCameraId: string | null;
  onOpenUploadModal: () => void;
}

export const CameraGrid: React.FC<CameraGridProps> = ({
  cameras,
  activeCameraId,
  onSelectCamera,
  onDeleteCamera,
  deletingCameraId,
  onOpenUploadModal,
}) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CameraIcon className="w-3.5 h-3.5 text-neutral-400" />
          <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider font-mono">
            Camera Feeds ({cameras.length})
          </h3>
        </div>
        <button
          onClick={onOpenUploadModal}
          className="flex items-center gap-1 text-[11px] font-mono text-purple-400 hover:text-purple-300 transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>Add Footage</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {cameras.map(cam => {
          const isActive = cam.id === activeCameraId;

          return (
            <div
              key={cam.id}
              className={`group flex flex-col text-left rounded-md border transition-colors p-3 ${
                isActive
                  ? 'border-purple-600 bg-neutral-900 ring-1 ring-purple-600/40'
                  : 'border-neutral-800 bg-neutral-950/70 hover:border-neutral-700 hover:bg-neutral-900/70'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <button
                  type="button"
                  onClick={() => onSelectCamera(cam.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-label={`Select ${cam.name}`}
                >
                  <span className="text-xs font-semibold text-neutral-200 truncate font-mono">
                    {cam.name}
                  </span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      cam.status === 'online'
                        ? 'bg-emerald-500'
                        : cam.status === 'processing'
                        ? 'bg-amber-400'
                        : 'bg-neutral-600'
                    }`}
                  />
                </button>
                {!cam.isDemoData && (
                  <button
                    type="button"
                    onClick={() => onDeleteCamera(cam)}
                    disabled={deletingCameraId === cam.id}
                    aria-label={`Remove ${cam.name} from workspace`}
                    title="Remove footage from workspace"
                    className="ml-2 rounded p-1 text-neutral-500 transition-colors hover:bg-red-950/70 hover:text-red-300 disabled:cursor-wait disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => onSelectCamera(cam.id)}
                className="flex flex-1 flex-col text-left"
                aria-label={`Open ${cam.name} footage`}
              >
                <span className="mb-2 w-full truncate text-[11px] text-neutral-500 font-mono">
                  {cam.location}
                </span>
                <span className="mt-auto flex w-full items-center justify-between border-t border-neutral-900 pt-1 text-[10px] text-neutral-400 font-mono">
                  <span className="truncate">{cam.resolution}</span>
                  <span className="shrink-0 tabular-nums text-neutral-300">
                    {cam.detectionRun ? `${cam.totalDetectionsCount} dets` : 'Not analyzed'}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
