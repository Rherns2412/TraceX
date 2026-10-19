import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, TimelineEvent, Detection } from '../types/index.ts';
import { findDetectionsForFrame, getObjectContainRect, normalizePixelBox } from '../lib/overlay.ts';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Maximize2,
  Volume2,
  VolumeX,
  PlayCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Sliders,
} from 'lucide-react';

interface CctvPlayerProps {
  activeCamera: Camera;
  targetEvent?: TimelineEvent | null;
  currentTimeSec: number;
  onTimeUpdate: (timeSec: number) => void;
  detections: Detection[];
  confidenceThreshold: number;
  onConfidenceChange: (val: number) => void;
  onRunDetection?: () => void;
  onCancelDetection?: () => void;
  isDetectionRunning?: boolean;
  detectionProgress?: string;
}

export const CctvPlayer: React.FC<CctvPlayerProps> = ({
  activeCamera,
  targetEvent,
  currentTimeSec,
  onTimeUpdate,
  detections,
  confidenceThreshold,
  onConfidenceChange,
  onRunDetection,
  onCancelDetection,
  isDetectionRunning,
  detectionProgress,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [showThresholdSlider, setShowThresholdSlider] = useState<boolean>(false);
  const [showBoxes, setShowBoxes] = useState<boolean>(true);
  const [showTrackIds, setShowTrackIds] = useState<boolean>(true);
  const [videoDuration, setVideoDuration] = useState<number>(activeCamera.durationSec || 30);
  const [videoGeometry, setVideoGeometry] = useState<{
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  }>({ width: 0, height: 0, offsetX: 0, offsetY: 0 });

  // Synchronize playback if targetEvent changes
  useEffect(() => {
    if (targetEvent && targetEvent.cameraId === activeCamera.id) {
      if (videoRef.current) {
        videoRef.current.currentTime = targetEvent.timestampSec;
      }
      onTimeUpdate(targetEvent.timestampSec);
    }
  }, [targetEvent, onTimeUpdate]);

  // Recalculate video layout geometry for bounding box overlay alignment
  const updateGeometry = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;

    if (vWidth === 0 || vHeight === 0 || cWidth === 0 || cHeight === 0) return;

    setVideoGeometry(getObjectContainRect(vWidth, vHeight, cWidth, cHeight));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(container);
    video.addEventListener('loadedmetadata', updateGeometry);
    return () => {
      observer.disconnect();
      video.removeEventListener('loadedmetadata', updateGeometry);
    };
  }, [activeCamera.id, updateGeometry]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    const initialTime = targetEvent?.cameraId === activeCamera.id ? targetEvent.timestampSec : 0;
    videoRef.current.currentTime = initialTime;
    setIsPlaying(false);
    onTimeUpdate(initialTime);
    setVideoGeometry({ width: 0, height: 0, offsetX: 0, offsetY: 0 });
  }, [activeCamera.id, onTimeUpdate, targetEvent]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !('requestVideoFrameCallback' in video)) return;
    let callbackId: number | undefined;
    let cancelled = false;
    const onVideoFrame: VideoFrameRequestCallback = (_now, metadata) => {
      onTimeUpdate(metadata.mediaTime);
      if (!cancelled) callbackId = video.requestVideoFrameCallback(onVideoFrame);
    };
    callbackId = video.requestVideoFrameCallback(onVideoFrame);
    return () => {
      cancelled = true;
      if (callbackId !== undefined) video.cancelVideoFrameCallback(callbackId);
    };
  }, [activeCamera.id, onTimeUpdate]);

  const currentDetections = findDetectionsForFrame(
    detections,
    videoRef.current?.currentTime ?? currentTimeSec,
    activeCamera.fps
  ).filter(detection => detection.confidence >= confidenceThreshold);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      onTimeUpdate(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      if (dur && !isNaN(dur) && isFinite(dur)) {
        setVideoDuration(dur);
      }
      updateGeometry();
    }
  };

  const getNormalizedBox = (detection: Detection) => {
    if (detection.bboxPixels && detection.frameWidth && detection.frameHeight) {
      return normalizePixelBox(detection.bboxPixels, detection.frameWidth, detection.frameHeight);
    }
    const box = detection.bbox;
    if (
      ![box.x1, box.y1, box.x2, box.y2].every(Number.isFinite) ||
      box.x1 < 0 || box.y1 < 0 || box.x2 > 1 || box.y2 > 1 ||
      box.x2 <= box.x1 || box.y2 <= box.y1
    ) return null;
    return box;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
    onTimeUpdate(newTime);
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleStep = (stepSec: number) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(videoDuration, videoRef.current.currentTime + stepSec));
    videoRef.current.currentTime = newTime;
    onTimeUpdate(newTime);
  };

  const handleSpeedChange = (spd: number) => {
    setPlaybackSpeed(spd);
    if (videoRef.current) {
      videoRef.current.playbackRate = spd;
    }
  };

  const formatTimecode = (sec: number) => {
    if (isNaN(sec) || !isFinite(sec)) return '00:00.0';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const tenths = Math.floor((sec % 1) * 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
  };

  return (
    <div className="flex flex-col bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-lg select-none">
      {/* Top CCTV Info Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-neutral-950 border-b border-neutral-800 text-xs font-mono">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="font-semibold text-neutral-100">{activeCamera.name}</span>
          <span className="text-neutral-500">·</span>
          <span className="text-neutral-400">{activeCamera.location}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Detection Status */}
          <span className="text-neutral-400 flex items-center gap-1.5">
            <span>{activeCamera.detectionRun ? 'YOLO + ByteTrack' : 'Person analysis'}</span>
            <span className="text-neutral-600">·</span>
            <span className="text-neutral-300 font-semibold">{detections.length.toLocaleString()} boxes</span>
          </span>
          {isDetectionRunning ? (
            <div className="flex items-center gap-2">
              <span className="max-w-40 truncate text-purple-300" title={detectionProgress}>{detectionProgress || 'Processing…'}</span>
              {onCancelDetection && (
                <button onClick={onCancelDetection} className="px-2 py-0.5 border border-red-900 text-red-300 rounded text-[11px]">
                  Cancel
                </button>
              )}
            </div>
          ) : (
            onRunDetection && (
              <button
                onClick={onRunDetection}
                className="px-2.5 py-0.5 bg-purple-700 hover:bg-purple-600 text-white rounded text-[11px] font-medium transition-colors"
              >
                {activeCamera.detectionRun ? 'Run again' : 'Run analysis'}
              </button>
            )
          )}

          <button
            onClick={() => setShowBoxes(value => !value)}
            aria-pressed={showBoxes}
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-neutral-800 text-[11px] text-neutral-300 hover:bg-neutral-800"
          >
            {showBoxes ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Boxes
          </button>
          <button
            onClick={() => setShowTrackIds(value => !value)}
            aria-pressed={showTrackIds}
            className="px-2 py-0.5 rounded border border-neutral-800 text-[11px] text-neutral-300 hover:bg-neutral-800"
          >
            Track IDs
          </button>

          <button
            onClick={() => setShowThresholdSlider(!showThresholdSlider)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] transition-colors ${
              showThresholdSlider
                ? 'bg-neutral-800 text-purple-300 border-purple-600'
                : 'text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            <Sliders className="w-3 h-3" />
            <span>Thresh: {(confidenceThreshold * 100).toFixed(0)}%</span>
          </button>
        </div>
      </div>

      {/* Threshold Slider Drawer */}
      {showThresholdSlider && (
        <div className="flex items-center justify-between px-4 py-2 bg-neutral-950/80 border-b border-neutral-800 text-xs font-mono text-neutral-300">
          <div className="flex items-center gap-3 w-full max-w-md">
            <span className="text-neutral-400 shrink-0">Person Confidence Filter:</span>
            <input
              type="range"
              min="0.20"
              max="0.90"
              step="0.05"
              value={confidenceThreshold}
              onChange={e => onConfidenceChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-neutral-800 rounded appearance-none cursor-pointer accent-purple-600"
            />
            <span className="text-purple-400 font-semibold w-12 text-right tabular-nums">
              {(confidenceThreshold * 100).toFixed(0)}%
            </span>
          </div>
          <span className="text-[11px] text-neutral-500">
            Detections below threshold are discarded
          </span>
        </div>
      )}

      {/* Video Viewport Container */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden"
      >
        {activeCamera.videoUrl ? (
          <video
            ref={videoRef}
            src={activeCamera.videoUrl}
            className="w-full h-full object-contain"
            muted={isMuted}
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onSeeked={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-neutral-500 font-mono text-xs gap-2 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-neutral-600" />
            <span>No video file uploaded for {activeCamera.name}</span>
            <span className="text-neutral-600 text-[11px]">
              Upload an MP4/WebM video via the top menu to view real footage and run detection.
            </span>
          </div>
        )}

        {/* Real Bounding Boxes Overlay (Aligned precisely to video geometry) */}
        {showBoxes && videoGeometry.width > 0 && currentDetections.length > 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${videoGeometry.offsetX}px`,
              top: `${videoGeometry.offsetY}px`,
              width: `${videoGeometry.width}px`,
              height: `${videoGeometry.height}px`,
            }}
          >
            {currentDetections.map((det, index) => {
              const b = getNormalizedBox(det);
              if (!b) return null;
              const left = b.x1 * videoGeometry.width;
              const top = b.y1 * videoGeometry.height;
              const width = (b.x2 - b.x1) * videoGeometry.width;
              const height = (b.y2 - b.y1) * videoGeometry.height;

              return (
                <div
                  key={det.id || index}
                  className="absolute border border-purple-500 bg-purple-950/20"
                  style={{
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${width}px`,
                    height: `${height}px`,
                  }}
                >
                  {showTrackIds && (
                    <div className="absolute -top-5 left-0 px-1.5 py-0.5 bg-neutral-950 border border-purple-500 text-[10px] font-mono text-neutral-100 whitespace-nowrap shadow-sm">
                      <span>Track {det.localTrackId || 'unassigned'}</span>
                      {det.globalPersonId && <span className="text-emerald-300 ml-1.5">{det.globalPersonId}</span>}
                      <span className="text-purple-400 ml-1.5 font-semibold">
                        {(det.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State Overlay Indicator when no person is detected in current frame */}
        {showBoxes && activeCamera.detectionRun && currentDetections.length === 0 && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-neutral-950/80 border border-neutral-800 rounded text-[11px] font-mono text-neutral-400">
            <Eye className="w-3 h-3 text-neutral-500" />
            <span>No people detected in this frame</span>
          </div>
        )}

        {/* If detection is unavailable or not run */}
        {!activeCamera.detectionRun && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-neutral-950/85 border border-neutral-800 rounded text-[11px] font-mono text-amber-400">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            <span>Detection not run on this footage</span>
          </div>
        )}

        {/* OSD Timecode in corner */}
        <div className="absolute top-3 right-3 px-2 py-0.5 bg-black/75 border border-neutral-800 rounded text-xs font-mono tabular-nums text-neutral-200">
          {formatTimecode(currentTimeSec)} / {formatTimecode(videoDuration)}
        </div>
      </div>

      {/* Scrub Bar & Controls */}
      <div className="px-3.5 py-2.5 bg-neutral-950 border-t border-neutral-800 flex flex-col gap-2">
        {/* Scrubber */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono tabular-nums text-neutral-400 w-14 text-right">
            {formatTimecode(currentTimeSec)}
          </span>
          <input
            type="range"
            min="0"
            max={videoDuration || 30}
            step="0.05"
            value={currentTimeSec}
            onChange={handleSeek}
            className="flex-1 h-1.5 bg-neutral-800 rounded appearance-none cursor-pointer accent-purple-600 hover:accent-purple-500"
          />
          <span className="text-xs font-mono tabular-nums text-neutral-500 w-14">
            {formatTimecode(videoDuration)}
          </span>
        </div>

        {/* Transport Toolbar */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-[10px] font-mono tabular-nums text-neutral-500">
              Frame {Math.round(currentTimeSec * Math.max(activeCamera.fps, 1))}
            </span>
            <button
              onClick={() => handleStep(-1 / Math.max(activeCamera.fps, 1))}
              className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors text-xs font-mono"
              title={`Step -1 frame (1/${activeCamera.fps} sec)`}
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleStep(-5)}
              className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors text-xs font-mono"
              title="Seek -5 seconds"
            >
              -5s
            </button>
            <button
              onClick={handlePlayPause}
              className="p-1.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded font-mono text-xs transition-colors flex items-center gap-1"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <button
              onClick={() => handleStep(5)}
              className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors text-xs font-mono"
              title="Seek +5 seconds"
            >
              +5s
            </button>
            <button
              onClick={() => handleStep(1 / Math.max(activeCamera.fps, 1))}
              className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors text-xs font-mono"
              title={`Step +1 frame (1/${activeCamera.fps} sec)`}
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime = 0;
                onTimeUpdate(0);
              }}
              className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors text-xs font-mono"
              title="Reset to 00:00"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Speed & Mute */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <div className="flex items-center gap-0.5 bg-neutral-900 border border-neutral-800 rounded p-0.5">
              {[0.5, 1, 2, 4].map(spd => (
                <button
                  key={spd}
                  onClick={() => handleSpeedChange(spd)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    playbackSpeed === spd
                      ? 'bg-purple-700 text-white font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
