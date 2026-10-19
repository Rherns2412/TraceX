import React from 'react';
import { TimelineEvent } from '../types/index.ts';
import {
  Clock,
  PlayCircle,
  Filter,
  User,
  AlertCircle,
  DoorOpen,
  Activity,
  Layers,
} from 'lucide-react';

interface IncidentTimelineProps {
  events: TimelineEvent[];
  selectedEventId?: string | null;
  onSelectEvent: (event: TimelineEvent) => void;
  filterCamera: string;
  setFilterCamera: (cam: string) => void;
  filterPerson: string;
  setFilterPerson: (person: string) => void;
  camerasList: { id: string; name: string }[];
  identitiesList: { id: string; alias: string }[];
  isLoading?: boolean;
}

export const IncidentTimeline: React.FC<IncidentTimelineProps> = ({
  events,
  selectedEventId,
  onSelectEvent,
  filterCamera,
  setFilterCamera,
  filterPerson,
  setFilterPerson,
  camerasList,
  identitiesList,
  isLoading,
}) => {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'door_access':
        return <DoorOpen className="w-3.5 h-3.5 text-neutral-300" />;
      case 'motion_detected':
        return <Activity className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <User className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  return (
    <div className="flex flex-col bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-sm">
      {/* Header & Filter Controls */}
      <div className="p-3 bg-neutral-950 border-b border-neutral-800 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            <h3 className="text-xs font-semibold text-neutral-100 uppercase tracking-wider font-mono">
              Detection & Activity Timeline
            </h3>
          </div>
          <span className="text-[11px] font-mono text-neutral-400 tabular-nums">
            {events.length} Logged Entries
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1 text-neutral-400 text-[11px]">
            <Filter className="w-3 h-3" />
            <span>Filter:</span>
          </div>

          <select
            value={filterCamera}
            onChange={e => setFilterCamera(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-neutral-200 text-xs focus:outline-none focus:border-purple-600"
          >
            <option value="all">All Cameras</option>
            {camerasList.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={filterPerson}
            onChange={e => setFilterPerson(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-neutral-200 text-xs focus:outline-none focus:border-purple-600"
          >
            <option value="all">All Person IDs</option>
            {identitiesList.map(i => (
              <option key={i.id} value={i.id}>
                {i.id}
              </option>
            ))}
          </select>

          {(filterCamera !== 'all' || filterPerson !== 'all') && (
            <button
              onClick={() => {
                setFilterCamera('all');
                setFilterPerson('all');
              }}
              className="text-[11px] text-purple-400 hover:text-purple-300 underline ml-auto"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Events List */}
      <div className="divide-y divide-neutral-800 max-h-[500px] overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400 text-xs font-mono">
            Loading timeline events...
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 flex flex-col items-center justify-center text-center text-neutral-400 text-xs font-mono gap-1.5">
            <AlertCircle className="w-5 h-5 text-neutral-600 mb-1" />
            <span>No events recorded for current selection</span>
            <span className="text-neutral-500 text-[11px]">
              Timeline entries are generated when person detections are processed by the model.
            </span>
          </div>
        ) : (
          events.map(event => {
            const isSelected = selectedEventId === event.id;

            return (
              <div
                key={event.id}
                onClick={() => onSelectEvent(event)}
                className={`group flex items-start justify-between p-3 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-purple-950/40 border-l-2 border-purple-500'
                    : 'hover:bg-neutral-800/40'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 p-1.5 rounded bg-neutral-950 border border-neutral-800 shrink-0">
                    {getEventIcon(event.eventType)}
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-neutral-100 group-hover:text-purple-300 transition-colors">
                      {event.title}
                    </span>
                    <p className="text-[11px] text-neutral-400 leading-relaxed max-w-sm">
                      {event.description}
                    </p>

                    {/* Unboxed Metadata */}
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-500 pt-0.5">
                      <span className="text-neutral-400">{event.cameraName}</span>
                      <span>·</span>
                      <span>Track: {event.localTrackId}</span>
                      {event.globalPersonId && (
                        <>
                          <span>·</span>
                          <span className="text-purple-400">{event.globalPersonId}</span>
                        </>
                      )}
                      <span>·</span>
                      <span className="tabular-nums">
                        Conf: {(event.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0 pl-2">
                  <span className="text-xs font-mono font-semibold tabular-nums text-neutral-300">
                    {event.timestampFormatted}
                  </span>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onSelectEvent(event);
                    }}
                    className="flex items-center gap-1 text-[10px] font-mono text-purple-400 hover:text-purple-300 group-hover:underline"
                  >
                    <PlayCircle className="w-3 h-3" />
                    <span>Seek</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
