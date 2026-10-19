import React, { useState } from 'react';
import { Camera } from '../types/index.ts';
import { Upload, Video, X, Check } from 'lucide-react';

interface UploadVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameras: Camera[];
  onUpload: (data: {
    cameraId: string;
    cameraName: string;
    location: string;
    filename: string;
    file: File;
  }) => Promise<void>;
}

export const UploadVideoModal: React.FC<UploadVideoModalProps> = ({
  isOpen,
  onClose,
  cameras,
  onUpload,
}) => {
  const [selectedCameraId, setSelectedCameraId] = useState<string>('new');
  const [cameraName, setCameraName] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setUploadError(null);
      setCameraName(prev => prev || `Camera ${cameras.length + 1}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsSubmitting(true);
    try {
      await onUpload({
        cameraId: selectedCameraId === 'new' ? '' : selectedCameraId,
        cameraName: cameraName || `Camera ${cameras.length + 1}`,
        location,
        filename: selectedFile.name,
        file: selectedFile,
      });

      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Video upload failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl overflow-hidden flex flex-col font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-950 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-neutral-100">
              Camera Footage Management
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-neutral-400">Select Video File (MP4 / WebM)</label>
              <div className="flex flex-col items-center justify-center p-6 border border-dashed border-neutral-700 hover:border-purple-600 rounded-md bg-neutral-950/60 transition-colors">
                <Upload className="w-6 h-6 text-neutral-500 mb-2" />
                <div className="text-center mb-1 text-neutral-300">
                  {selectedFile ? (
                    <span className="text-purple-400 font-semibold">
                      {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  ) : (
                    'Select video from your computer'
                  )}
                </div>
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  onChange={handleFileChange}
                  required
                  className="text-[11px] text-neutral-500 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[11px] file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700 cursor-pointer"
                />
              </div>
            </div>

            {uploadError && (
              <div role="alert" className="rounded border border-red-800 bg-red-950/50 px-3 py-2 text-red-300">
                {uploadError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-neutral-400">Target Camera Entry</label>
                <select
                  value={selectedCameraId}
                  onChange={e => setSelectedCameraId(e.target.value)}
                  className="bg-neutral-950 border border-neutral-800 rounded-md p-2 text-neutral-200 focus:outline-none focus:border-purple-600"
                >
                  <option value="new">+ Create New Camera</option>
                  {cameras.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-neutral-400">Camera Name</label>
                <input
                  type="text"
                  value={cameraName}
                  onChange={e => setCameraName(e.target.value)}
                  placeholder={`Camera ${cameras.length + 1}`}
                  required
                  className="bg-neutral-950 border border-neutral-800 rounded-md p-2 text-neutral-200 focus:outline-none focus:border-purple-600"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-neutral-400">Physical Location</label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Optional location"
                className="bg-neutral-950 border border-neutral-800 rounded-md p-2 text-neutral-200 focus:outline-none focus:border-purple-600"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
              <span className="text-[11px] text-neutral-500">
                Uploaded video is stored locally on this TraceX server.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedFile}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-medium transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Uploading...' : 'Add Camera Footage'}</span>
                </button>
              </div>
            </div>
        </form>
      </div>
    </div>
  );
};
