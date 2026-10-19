import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera,
  ProcessingJob,
  GlobalIdentity,
  CrossCameraMatch,
  TimelineEvent,
  InvestigationDossier,
  NLSearchResult,
  Detection,
} from './types/index.ts';
import {
  fetchCameras,
  fetchJobs,
  fetchJob,
  fetchIdentities,
  fetchReidMatches,
  fetchEvents,
  fetchDetections,
  searchEvents,
  exportDossier,
  updateReidMatch,
  uploadVideo,
  deleteCamera,
  runDetection,
  cancelProcessingJob,
  fetchCvStatus,
} from './services/api.ts';
import { CctvPlayer } from './components/CctvPlayer.tsx';
import { CameraGrid } from './components/CameraGrid.tsx';
import { ProcessingStatusPanel } from './components/ProcessingStatusPanel.tsx';
import { IncidentTimeline } from './components/IncidentTimeline.tsx';
import { ForensicSearchBar } from './components/ForensicSearchBar.tsx';
import { CrossCameraReidModal } from './components/CrossCameraReidModal.tsx';
import { UploadVideoModal } from './components/UploadVideoModal.tsx';
import { DossierExportModal } from './components/DossierExportModal.tsx';
import {
  Upload,
  FileText,
  Users,
  GitBranch,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Film,
} from 'lucide-react';

export default function App() {
  // Mode: 'live' (real uploaded video) vs 'demo' (clearly marked synthetic benchmark)
  const [mode, setMode] = useState<'live' | 'demo'>('live');

  // Core Data
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string>('');
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [identities, setIdentities] = useState<GlobalIdentity[]>([]);
  const [reidMatches, setReidMatches] = useState<CrossCameraMatch[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [activeDetections, setActiveDetections] = useState<Detection[]>([]);

  // Playback & Seeking State
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.45);

  // Status & Service Info
  const [cvServiceInfo, setCvServiceInfo] = useState<any>(null);
  const [isDetectionRunning, setIsDetectionRunning] = useState<boolean>(false);
  const [detectionProgress, setDetectionProgress] = useState<string>('');
  const autoProcessingStarted = useRef(false);
  const activeDetection = useRef<{ cameraId: string; jobId: string | null } | null>(null);
  const removedCameraIds = useRef(new Set<string>());
  const cancelAutoProcessing = useRef(false);
  const cancelCurrentDetection = useRef(false);
  const [deletingCameraId, setDeletingCameraId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  // Filters & Search
  const [filterCamera, setFilterCamera] = useState<string>('all');
  const [filterPerson, setFilterPerson] = useState<string>('all');
  const [searchSummary, setSearchSummary] = useState<string | null>(null);
  const [activeQuery, setActiveQuery] = useState<string>('');

  // Modals
  const [isReidModalOpen, setIsReidModalOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isDossierModalOpen, setIsDossierModalOpen] = useState<boolean>(false);
  const [dossierData, setDossierData] = useState<InvestigationDossier | null>(null);

  // Load Data for Active Mode
  const loadModeData = useCallback(async (currentMode: 'live' | 'demo') => {
    try {
      const [camsData, jobsData, identsData, matchesData, evtsData, cvStatus] = await Promise.all([
        fetchCameras(currentMode),
        fetchJobs(currentMode),
        fetchIdentities(currentMode),
        fetchReidMatches(currentMode),
        fetchEvents({ mode: currentMode }),
        fetchCvStatus(),
      ]);

      setCameras(camsData);
      setJobs(jobsData);
      setIdentities(identsData);
      setReidMatches(matchesData);
      setTimelineEvents(evtsData);
      setCvServiceInfo(cvStatus);

      if (camsData.length > 0) {
        setActiveCameraId(prev => (camsData.some(c => c.id === prev) ? prev : camsData[0].id));
      } else {
        setActiveCameraId('');
      }
    } catch (err) {
      console.error('Failed to load mode data:', err);
    }
  }, []);

  useEffect(() => {
    loadModeData(mode);
  }, [mode, loadModeData]);

  // Load detections for active camera
  const loadCameraDetections = useCallback(async (camId: string, thresh: number) => {
    if (!camId) {
      setActiveDetections([]);
      return;
    }
    try {
      const res = await fetchDetections(camId, thresh);
      setActiveDetections(res.detections || []);
    } catch {
      setActiveDetections([]);
    }
  }, []);

  useEffect(() => {
    loadCameraDetections(activeCameraId, confidenceThreshold);
  }, [activeCameraId, confidenceThreshold, loadCameraDetections]);

  // Handle Event Selection
  const handleSelectEvent = (event: TimelineEvent) => {
    setSelectedEvent(event);
    setActiveCameraId(event.cameraId);
    setCurrentTimeSec(event.timestampSec);
  };

  const runCameraDetection = useCallback(async (camera: Camera) => {
    if (removedCameraIds.current.has(camera.id)) return;
    if (!camera.videoUrl) {
      setNotification({ message: `No video URL is available for ${camera.name}.`, type: 'error' });
      return;
    }
    activeDetection.current = { cameraId: camera.id, jobId: null };
    cancelCurrentDetection.current = false;
    setActiveCameraId(camera.id);
    setIsDetectionRunning(true);
    setDetectionProgress('Starting full-frame analysis…');
    setNotification(null);

    try {
      const { job: startedJob } = await runDetection(camera.id, confidenceThreshold);
      const jobId = startedJob.id;
      activeDetection.current = { cameraId: camera.id, jobId };
      setJobs(previous => [startedJob, ...previous.filter(item => item.cameraId !== camera.id)]);
      if (cancelCurrentDetection.current) {
        await cancelProcessingJob(jobId);
      }

      let currentJob = startedJob;
      while (
        currentJob.status === 'processing' &&
        !removedCameraIds.current.has(camera.id) &&
        !cancelCurrentDetection.current
      ) {
        setDetectionProgress(`Frame ${currentJob.framesProcessed.toLocaleString()} / ${currentJob.totalFrames.toLocaleString()}`);
        await new Promise(resolve => window.setTimeout(resolve, 900));
        currentJob = await fetchJob(jobId);
        setJobs(previous => previous.map(item => item.id === jobId ? currentJob : item));
      }

      if (cancelCurrentDetection.current && currentJob.status === 'processing') {
        currentJob = await fetchJob(jobId);
        if (currentJob.status === 'processing') currentJob = (await cancelProcessingJob(jobId)).job;
        setJobs(previous => previous.map(item => item.id === jobId ? currentJob : item));
      }
      if (removedCameraIds.current.has(camera.id) || currentJob.status === 'cancelled') return;
      if (currentJob.status === 'failed' || currentJob.status === 'offline') {
        setNotification({
          message: currentJob.error || `${camera.name} analysis failed.`,
          type: 'error',
        });
        return;
      }
      if (currentJob.status !== 'completed') {
        setNotification({ message: `${camera.name} analysis stopped with status: ${currentJob.status}.`, type: 'error' });
        return;
      }

      await loadModeData(mode);
      await loadCameraDetections(camera.id, confidenceThreshold);
      setNotification({
        message: `${camera.name}: processed ${currentJob.framesProcessed.toLocaleString()} frames; ${currentJob.framesWithDetections ?? 0} had detections, ${currentJob.detectionsCount.toLocaleString()} person boxes total in ${(currentJob.processingTimeSec ?? 0).toFixed(1)}s.`,
        type: 'success',
      });
    } catch (err) {
      if (!removedCameraIds.current.has(camera.id)) {
        const message = err instanceof Error ? err.message : 'Person detection failed.';
        setNotification({ message, type: 'error' });
        cancelAutoProcessing.current = true;
      }
    } finally {
      if (activeDetection.current?.cameraId === camera.id) {
        activeDetection.current = null;
        setIsDetectionRunning(false);
        setDetectionProgress('');
      }
    }
  }, [confidenceThreshold, loadCameraDetections, loadModeData, mode]);

  const handleRunDetection = () => {
    const currentCamera = cameras.find(camera => camera.id === activeCameraId);
    if (currentCamera) void runCameraDetection(currentCamera);
  };

  useEffect(() => {
    const providedCameraClips = cameras.filter(camera => camera.videoUrl?.includes('/videos/camera_'));
    if (autoProcessingStarted.current || providedCameraClips.length === 0 || mode !== 'live') return;

    autoProcessingStarted.current = true;
    cancelAutoProcessing.current = false;
    void (async () => {
      for (const camera of providedCameraClips) {
        if (cancelAutoProcessing.current) break;
        if (removedCameraIds.current.has(camera.id) || camera.detectionRun) continue;
        await runCameraDetection(camera);
      }
    })();
  }, [cameras, mode, runCameraDetection]);

  const handleCancelDetection = async () => {
    cancelCurrentDetection.current = true;
    cancelAutoProcessing.current = true;
    const jobId = activeDetection.current?.jobId;
    if (!jobId) return;
    try {
      const { job } = await cancelProcessingJob(jobId);
      setJobs(previous => previous.map(item => item.id === jobId ? job : item));
      setDetectionProgress('Cancellation requested…');
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : 'Could not cancel video analysis.',
        type: 'error',
      });
    }
  };

  const handleDeleteCamera = async (camera: Camera) => {
    if (mode === 'demo' || camera.isDemoData) return;
    const confirmed = window.confirm(
      `Remove ${camera.name} and its detections from this workspace? The original video files will remain on disk.`
    );
    if (!confirmed) return;

    setDeletingCameraId(camera.id);
    removedCameraIds.current.add(camera.id);
    try {
      await deleteCamera(camera.id);
      if (activeDetection.current?.cameraId === camera.id && activeDetection.current.jobId) {
        await cancelProcessingJob(activeDetection.current.jobId).catch(() => undefined);
      }
      const remainingCameras = cameras.filter(item => item.id !== camera.id);
      setCameras(remainingCameras);
      setJobs(previous => previous.filter(job => job.cameraId !== camera.id && job.videoId !== camera.id));
      setTimelineEvents(previous => previous.filter(event => event.cameraId !== camera.id));
      setIdentities(previous => previous.filter(identity =>
        identity.firstSeenCamera !== camera.id &&
        identity.firstSeenCamera !== camera.name &&
        !identity.camerasTraversed.includes(camera.id) &&
        !identity.camerasTraversed.includes(camera.name)
      ));
      setReidMatches(previous => previous.filter(match =>
        match.sourceCameraId !== camera.id && match.targetCameraId !== camera.id
      ));
      if (activeCameraId === camera.id) setActiveDetections([]);
      setSelectedEvent(null);
      setCurrentTimeSec(0);
      setFilterCamera(previous => previous === camera.id ? 'all' : previous);
      setActiveCameraId(previous => previous === camera.id ? (remainingCameras[0]?.id || '') : previous);
      setNotification({
        message: `${camera.name} was removed from the workspace. Original video files were kept.`,
        type: 'success',
      });
    } catch (error) {
      removedCameraIds.current.delete(camera.id);
      setNotification({
        message: error instanceof Error ? error.message : 'Could not remove this footage from the workspace.',
        type: 'error',
      });
    } finally {
      setDeletingCameraId(null);
    }
  };

  // Video Upload
  const handleUploadVideo = async (data: {
    cameraId: string;
    cameraName: string;
    location: string;
    filename: string;
    file: File;
  }) => {
    const res = await uploadVideo(data);
    setCameras(prev => {
      const exists = prev.find(c => c.id === res.camera.id);
      if (exists) return prev.map(c => (c.id === res.camera.id ? res.camera : c));
      return [...prev, res.camera];
    });
    setJobs(prev => [res.job, ...prev]);
    setActiveCameraId(res.camera.id);
    setCurrentTimeSec(0);
    setNotification({
      message: `Uploaded "${data.filename}". Full-frame person analysis is starting.`,
      type: 'info',
    });
    void runCameraDetection(res.camera);
  };

  // Search
  const handleSearch = async (query: string) => {
    try {
      setActiveQuery(query);
      const res: NLSearchResult = await searchEvents(query, mode);
      setTimelineEvents(res.matchedEvents);
      setSearchSummary(res.summaryText);

      if (res.matchedEvents.length > 0) {
        handleSelectEvent(res.matchedEvents[0]);
      }
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const handleClearSearch = async () => {
    setActiveQuery('');
    setSearchSummary(null);
    try {
      const allEvents = await fetchEvents({
        mode,
        cameraId: filterCamera !== 'all' ? filterCamera : undefined,
        personId: filterPerson !== 'all' ? filterPerson : undefined,
      });
      setTimelineEvents(allEvents);
    } catch (err) {
      console.error(err);
    }
  };

  // Re-ID Actions
  const handleConfirmMatch = async (matchId: string) => {
    try {
      const updated = await updateReidMatch(matchId, {
        status: 'confirmed',
        notes: 'Analyst confirmed identity match across camera feeds.',
      }, mode);
      setReidMatches(prev => prev.map(m => (m.id === matchId ? updated : m)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectMatch = async (matchId: string) => {
    try {
      const updated = await updateReidMatch(matchId, {
        status: 'unmatched',
        notes: 'Analyst marked tracks as distinct individuals.',
      }, mode);
      setReidMatches(prev => prev.map(m => (m.id === matchId ? updated : m)));
    } catch (err) {
      console.error(err);
    }
  };

  // Dossier Export
  const handleOpenDossier = async () => {
    try {
      const dossier = await exportDossier({
        caseId: mode === 'demo' ? 'DEMO-INCIDENT-01' : 'CASE-TX-2026',
        title: mode === 'demo' ? 'Demonstration Benchmark Report' : 'Video Forensic Investigation Report',
      }, mode);
      setDossierData(dossier);
      setIsDossierModalOpen(true);
    } catch (err) {
      console.error('Failed to export dossier:', err);
    }
  };

  const activeCamera = cameras.find(c => c.id === activeCameraId) || cameras[0];
  const pendingReviewsCount = reidMatches.filter(m => m.matchStatus === 'needs_review').length;

  return (
    <div className="min-h-screen bg-[#111315] text-neutral-200 flex flex-col font-sans selection:bg-purple-700 selection:text-white">
      {/* =========================================================================
          TOP BAR CONTRACT:
          [Brand wordmark, one line] — [4–5 single-line links] — [1 primary action]
         ========================================================================= */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 px-5 lg:px-8 py-3 bg-[#191c1f] border-b border-white/10">
        {/* Zone 1: Brand wordmark */}
        <div className="flex items-center gap-3 shrink-0 font-mono">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-purple-700 text-white font-bold text-xs">
            TX
          </div>
          <span className="text-sm font-semibold tracking-tight text-neutral-100 whitespace-nowrap">
            TraceX Video Investigator
          </span>
        </div>

        {/* Zone 2: Navigation Links & Mode Selector */}
        <nav className="flex items-center gap-5 text-xs font-mono text-neutral-400">
          <button
            onClick={() => setIsReidModalOpen(true)}
            className="flex items-center gap-1.5 hover:text-neutral-200 transition-colors whitespace-nowrap shrink-0"
          >
            <GitBranch className="w-3.5 h-3.5 text-neutral-400" />
            <span>Cross-camera review</span>
            {pendingReviewsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px]">
                {pendingReviewsCount} review
              </span>
            )}
          </button>

          <button
            onClick={handleOpenDossier}
            className="flex items-center gap-1.5 hover:text-neutral-200 transition-colors whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-neutral-400" />
            <span>Export Report</span>
          </button>
        </nav>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => {
              setIsUploadModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-medium text-white bg-purple-700 hover:bg-purple-600 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Add footage</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-100">Investigation workspace</h1>
            <p className="mt-1 text-sm text-neutral-400">Review camera footage, detections, and supporting evidence.</p>
          </div>
          <span className="text-xs text-neutral-500">{cameras.length} {cameras.length === 1 ? 'camera' : 'cameras'} registered</span>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div
            className={`flex items-center justify-between px-3.5 py-2 rounded text-xs font-mono border ${
              notification.type === 'error'
                ? 'bg-red-950/50 border-red-800 text-red-300'
                : notification.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-red-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-[11px] underline text-neutral-400 hover:text-neutral-200"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Search Bar */}
        <ForensicSearchBar
          onSearch={handleSearch}
          searchSummary={searchSummary}
          activeQuery={activeQuery}
          onClear={handleClearSearch}
        />

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left: CCTV Player & Feeds */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            {activeCamera ? (
              <CctvPlayer
                activeCamera={activeCamera}
                targetEvent={selectedEvent}
                currentTimeSec={currentTimeSec}
                onTimeUpdate={setCurrentTimeSec}
                detections={activeDetections}
                confidenceThreshold={confidenceThreshold}
                onConfidenceChange={setConfidenceThreshold}
                onRunDetection={handleRunDetection}
                onCancelDetection={handleCancelDetection}
                isDetectionRunning={isDetectionRunning}
                detectionProgress={detectionProgress}
              />
            ) : (
              <div className="min-h-[360px] bg-[#191c1f] border border-white/10 rounded-md flex flex-col items-center justify-center p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-white/10 bg-[#111315] text-neutral-400">
                  <Film className="h-5 w-5" />
                </div>
                <span className="mt-4 text-base font-semibold text-neutral-100">No footage in this workspace</span>
                <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-400">
                  Add a camera recording to review video, run person detection, and build an evidence timeline.
                </p>
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-md bg-purple-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-600"
                >
                  <Upload className="h-4 w-4" />
                  Add footage
                </button>
                <span className="mt-3 text-xs text-neutral-500">MP4 or WebM · Local footage only</span>
              </div>
            )}

            {/* Camera Feeds Selector */}
            {cameras.length > 0 && (
              <CameraGrid
                cameras={cameras}
                activeCameraId={activeCameraId}
                deletingCameraId={deletingCameraId}
                onSelectCamera={id => {
                  setActiveCameraId(id);
                  setSelectedEvent(null);
                }}
                onDeleteCamera={handleDeleteCamera}
                onOpenUploadModal={() => setIsUploadModalOpen(true)}
              />
            )}

            {/* Pipeline Status */}
            {activeCamera && (
              <ProcessingStatusPanel
                jobs={jobs}
                activeCamera={activeCamera}
                cvServiceStatus={cvServiceInfo}
                onRunDetection={handleRunDetection}
                onCancelDetection={handleCancelDetection}
                isDetectionRunning={isDetectionRunning}
              />
            )}
          </div>

          {/* Right: Incident Timeline */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <IncidentTimeline
              events={timelineEvents}
              selectedEventId={selectedEvent?.id}
              onSelectEvent={handleSelectEvent}
              filterCamera={filterCamera}
              setFilterCamera={setFilterCamera}
              filterPerson={filterPerson}
              setFilterPerson={setFilterPerson}
              camerasList={cameras.map(c => ({ id: c.id, name: c.name }))}
              identitiesList={identities.map(i => ({ id: i.id, alias: i.alias }))}
            />

            {/* Re-ID Summary Card */}
            <div className="p-3 bg-neutral-900 border border-neutral-800 rounded flex items-center justify-between text-xs font-mono">
              <div className="flex flex-col gap-0.5">
                <span className="text-neutral-200 font-semibold">
                  Cross-camera match reviews ({reidMatches.length})
                </span>
                <span className="text-[11px] text-neutral-500">
                  Re-ID compares a person across cameras; current labels are camera-local only.
                </span>
              </div>
              <button
                onClick={() => setIsReidModalOpen(true)}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition-colors"
              >
                About Re-ID
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-900 px-6 py-3 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-neutral-500 gap-2">
        <div>TraceX Forensic Video Investigator · Computer Vision & Re-ID Integration</div>
        <div className="flex items-center gap-3">
          <span>Live analysis</span>
          <span>·</span>
          <span>
            Vision: Ultralytics YOLO person detector · ByteTrack local IDs
            {cvServiceInfo?.isOnline ? ' · Python runtime available' : ' · Python runtime unavailable'}
          </span>
        </div>
      </footer>

      {/* Modals */}
      <CrossCameraReidModal
        isOpen={isReidModalOpen}
        onClose={() => setIsReidModalOpen(false)}
        matches={reidMatches}
        onConfirmMatch={handleConfirmMatch}
        onRejectMatch={handleRejectMatch}
      />

      <UploadVideoModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        cameras={cameras}
        onUpload={handleUploadVideo}
      />

      <DossierExportModal
        isOpen={isDossierModalOpen}
        onClose={() => setIsDossierModalOpen(false)}
        dossier={dossierData}
      />
    </div>
  );
}
