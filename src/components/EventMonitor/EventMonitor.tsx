'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { Activity, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEvents } from '@/hooks/useEvents';
import {
  EVENT_TYPE_OPTIONS,
  filterEvents,
  formatTimestamp,
  getEventTypeOption,
} from './StateStateStateStateStateeventMonitorUtils';
import type { ProtocolEvent } from '@/hooks/useEvents';

const MAX_DISPLAY_METADATA_KEYS = 5;

interface EventMonitorProps {
  maxEvents?: number;
}

export default function EventMonitor({
  maxEvents,
}: EventMonitorProps = {}): ReactElement {
  const { t } = useTranslation();
  const { timeline, emit, clear } = useEvents({ maxEvents });
  const [filterType, setFilterType] = useState<string>('all');

  const filteredEvents = useMemo(
    () => filterEvents<ProtocolEvent>(timeline, filterType),
    [timeline, filterType],
  );

  const activeOption = useMemo(
    () => EVENT_TYPE_OPTIONS.find((opt) => opt.type === filterType) ?? EVENT_TYPE_OPTIONS[0],
    [filterType],
  );

  return (
    <section
      aria-label={t('eventMonitor.ariaLabel')}
      className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          {t('eventMonitor.heading')}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t('eventMonitor.count', { count: filteredEvents.length })}
          </span>
          {filteredEvents.length > 0 && (
            <button
              type="button"
              onClick={clear}
              aria-label={t('eventMonitor.clearAria')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4" role="tablist" aria-label={t('eventMonitor.filterAria')}>
        {EVENT_TYPE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = filterType === option.type;
          return (
            <button
              key={option.type}
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilterType(option.type as string)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {t(option.labelKey)}
            </button>
          );
        })}
      </div>

      {filteredEvents.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
          {t('eventMonitor.empty')}
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-96 overflow-y-auto" aria-live="polite">
          {filteredEvents.map((event) => {
            const option = getEventTypeOption(event.type);
            const Icon = option.icon;
            const metadataEntries = event.metadata
              ? Object.entries(event.metadata).slice(0, MAX_DISPLAY_METADATA_KEYS)
              : [];

            return (
              <li
                key={event.id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 animate-in slide-in-from-top-2 fade-in"
              >
                <Icon
                  className={`w-5 h-5 shrink-0 mt-0.5 ${option.color}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${option.color} bg-slate-100 dark:bg-slate-700`}
                    >
                      {t(option.labelKey)}
                    </span>
                    {event.actor && (
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate max-w-[120px]">
                        {event.actor}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto shrink-0">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  {(event.resource || event.resourceId) && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {event.resource && (
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {event.resource}
                        </span>
                      )}
                      {event.resource && event.resourceId && <span> </span>}
                      {event.resourceId && (
                        <span className="font-mono">{event.resourceId}</span>
                      )}
                    </p>
                  )}
                  {metadataEntries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {metadataEntries.map(([key, val]) => (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-xs text-slate-500 dark:text-slate-400"
                        >
                          <span className="font-medium">{key}:</span>
                          <span className="font-mono">{String(val)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
