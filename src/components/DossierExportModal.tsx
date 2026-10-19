import React from 'react';
import { InvestigationDossier } from '../types/index.ts';
import { Download, Printer, FileText, CheckCircle, X, Hash } from 'lucide-react';

interface DossierExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: InvestigationDossier | null;
}

export const DossierExportModal: React.FC<DossierExportModalProps> = ({
  isOpen,
  onClose,
  dossier,
}) => {
  if (!isOpen || !dossier) return null;

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dossier, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${dossier.caseId}_report.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleDownloadCsv = () => {
    const headers = ['Timestamp', 'Camera_ID', 'Camera_Name', 'Track_ID', 'Person_ID', 'Event_Type', 'Confidence', 'Description'];
    const rows = dossier.events.map(e => [
      `"${e.timestampFormatted}"`,
      `"${e.cameraId}"`,
      `"${e.cameraName}"`,
      `"${e.localTrackId}"`,
      `"${e.globalPersonId || 'Unassigned'}"`,
      `"${e.eventType}"`,
      `"${e.confidence}"`,
      `"${e.description.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${dossier.caseId}_timeline.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh] font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-950 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-400" />
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">
                Investigation Report Export
              </h2>
              <p className="text-[11px] text-neutral-400">
                Case Identifier: {dossier.caseId} · Status: {dossier.status}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4 text-neutral-300">
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded space-y-1">
            <div className="flex justify-between font-semibold text-neutral-100">
              <span>{dossier.title}</span>
              <span className="text-neutral-400">{dossier.generatedAt.substring(0, 10)}</span>
            </div>
            <div className="text-[11px] text-neutral-500">
              Lead Analyst: {dossier.analyst} · Monitored Feeds: {dossier.totalCameras} · Logged Detections: {dossier.totalIncidents}
            </div>
          </div>

          {/* Persons Tracked */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-neutral-400 font-semibold uppercase">
              Identified Persons ({dossier.keyIdentities.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {dossier.keyIdentities.map(i => (
                <div key={i.id} className="p-2.5 bg-neutral-950 border border-neutral-800 rounded">
                  <div className="font-semibold text-neutral-100">{i.id} — {i.alias}</div>
                  <div className="text-[10px] text-neutral-500 mt-1">
                    Traversed: {i.camerasTraversed.join(', ')} · Total Detections: {i.totalDetections}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cross Camera Matches */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-neutral-400 font-semibold uppercase">
              Cross-Camera Trajectory Matches ({dossier.reidMatches.length})
            </span>
            <div className="divide-y divide-neutral-800 border border-neutral-800 rounded bg-neutral-950">
              {dossier.reidMatches.map((m, idx) => (
                <div key={m.id || idx} className="p-2 flex items-center justify-between text-[11px]">
                  <span>{m.sourceCameraName} → {m.targetCameraName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-purple-400 font-semibold">
                      Re-ID: {(m.cosineSimilarity * 100).toFixed(1)}%
                    </span>
                    <span className="text-neutral-400 uppercase text-[10px]">
                      {m.matchStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hash */}
          <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-neutral-500" />
              <div>
                <div className="text-[10px] text-neutral-500">Record SHA-256 Hash</div>
                <div className="text-[11px] text-neutral-300 select-all">{dossier.sha256Hash}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-neutral-400">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              <span>Preserved</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-neutral-950 border-t border-neutral-800">
          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>CSV Log</span>
          </button>
          <button
            onClick={handleDownloadJson}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded bg-purple-700 hover:bg-purple-600 text-white font-medium transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>JSON Report</span>
          </button>
        </div>
      </div>
    </div>
  );
};
