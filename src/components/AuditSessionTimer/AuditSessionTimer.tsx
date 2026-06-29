'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { CheckCircle2, Clock, Pause, Play, RotateCcw, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_DURATION_SECONDS,
  formatDuration,
  formatTime,
  getProgress,
  getRemainingSeconds,
  INITIAL_TIMER_STATE,
  pauseSession,
  resetSession,
  setDuration,
  startSession,
  stopSession,
  tick,
  TIMER_PRESETS,
  totalAuditedSeconds,
  type TimerPreset,
  type TimerState,
} from './StateStateStateStateStateauditSessionTimerState';

// ---------------------------------------------------------------------------
// SVG circular progress ring
// ---------------------------------------------------------------------------

const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface ProgressRingProps {
  progress: number; // 0–1
  phase: TimerState['phase'];
}

function ProgressRing({ progress, phase }: ProgressRingProps): ReactElement {
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  const ringColor =
    phase === 'finished'
      ? '#10b981' // emerald
      : phase === 'paused'
        ? '#f59e0b' // amber
        : '#6366f1'; // indigo

  return (
    <svg
      viewBox="0 0 120 120"
      className="w-full h-full"
      aria-hidden="true"
    >
      {/* Track */}
      <circle
        cx={60}
        cy={60}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={8}
        className="stroke-slate-200 dark:stroke-slate-700"
      />
      {/* Progress arc */}
      <circle
        cx={60}
        cy={60}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={8}
        stroke={ringColor}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={strokeDashoffset}
        transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Session history list
// ---------------------------------------------------------------------------

function SessionHistory({ history }: { history: TimerState['history'] }): ReactElement {
  const { t } = useTranslation();

  if (history.length === 0) return <></>;

  return (
    <div className="mt-5 border-t border-slate-200 dark:border-slate-700 pt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t('auditSessionTimer.historyHeading')}
        </h4>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {t('auditSessionTimer.totalAudited', {
            duration: formatDuration(totalAuditedSeconds(history)),
          })}
        </span>
      </div>
      <ul className="space-y-1.5 max-h-40 overflow-y-auto" aria-label={t('auditSessionTimer.historyAriaLabel')}>
        {[...history].reverse().map((record) => (
          <li
            key={record.id}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs"
          >
            <div className="flex items-center gap-2">
              {record.completed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-label={t('auditSessionTimer.completed')} />
              ) : (
                <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-label={t('auditSessionTimer.stopped')} />
              )}
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {formatDuration(record.elapsedSeconds)}
                {!record.completed && (
                  <span className="text-slate-400 dark:text-slate-500">
                    {' / '}{formatDuration(record.plannedSeconds)}
                  </span>
                )}
              </span>
            </div>
            <span className="text-slate-400 dark:text-slate-500 shrink-0">
              {new Intl.DateTimeFormat('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }).format(new Date(record.finishedAt))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface AuditSessionTimerProps {
  /** Initial duration in seconds. Defaults to 25 minutes. */
  initialDurationSeconds?: number;
  /** Called each time a session finishes or is stopped, with the elapsed seconds. */
  onSessionEnd?: (elapsedSeconds: number, completed: boolean) => void;
}

/**
 * AuditSessionTimer — issue #59
 *
 * A focus-mode session timer that time-boxes audit work to reduce fatigue.
 * Users pick a preset duration, start the timer, and get a visual countdown
 * with a circular progress ring. Sessions are recorded in history.
 *
 * All state lives in local useState — no network calls, no external store.
 * The interval is cleaned up on unmount and whenever the phase leaves 'running'.
 */
export default function AuditSessionTimer({
  initialDurationSeconds = DEFAULT_DURATION_SECONDS,
  onSessionEnd,
}: AuditSessionTimerProps = {}): ReactElement {
  const { t } = useTranslation();

  const [state, setState] = useState<TimerState>({
    ...INITIAL_TIMER_STATE,
    durationSeconds: initialDurationSeconds,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;

  // Tick every second while running
  useEffect(() => {
    if (state.phase === 'running') {
      intervalRef.current = setInterval(() => {
        setState((prev) => tick(prev));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.phase]);

  // Fire callback when a session ends (finished or stopped)
  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;

    if (
      (prev === 'running' || prev === 'paused') &&
      (state.phase === 'finished' || state.phase === 'idle')
    ) {
      const last = state.history[state.history.length - 1];
      if (last) {
        onSessionEndRef.current?.(last.elapsedSeconds, last.completed);
      }
    }
  }, [state.phase, state.history]);

  const handleStart   = useCallback(() => setState((s) => startSession(s)),  []);
  const handlePause   = useCallback(() => setState((s) => pauseSession(s)),  []);
  const handleStop    = useCallback(() => setState((s) => stopSession(s)),   []);
  const handleReset   = useCallback(() => setState((s) => resetSession(s)),  []);
  const handlePreset  = useCallback((preset: TimerPreset) =>
    setState((s) => setDuration(s, preset * 60)), []);

  const remaining = getRemainingSeconds(state);
  const progress  = getProgress(state);

  const phaseColor =
    state.phase === 'finished'
      ? 'text-emerald-600 dark:text-emerald-400'
      : state.phase === 'paused'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-indigo-600 dark:text-indigo-400';

  return (
    <section
      aria-labelledby="audit-session-timer-title"
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        <h2
          id="audit-session-timer-title"
          className="text-lg font-semibold text-slate-900 dark:text-white"
        >
          {t('auditSessionTimer.heading')}
        </h2>
      </div>

      {/* Preset buttons — only when idle */}
      {state.phase === 'idle' && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('auditSessionTimer.presetsAriaLabel')}>
          {TIMER_PRESETS.map((preset) => {
            const isActive = state.durationSeconds === preset * 60;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => handlePreset(preset)}
                aria-pressed={isActive}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isActive
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                }`}
              >
                {t('auditSessionTimer.presetLabel', { minutes: preset })}
              </button>
            );
          })}
        </div>
      )}

      {/* Circular countdown */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-40 h-40">
          <ProgressRing progress={progress} phase={state.phase} />
          {/* Countdown text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={`text-3xl font-mono font-bold tabular-nums ${phaseColor}`}
              aria-live="polite"
              aria-label={t('auditSessionTimer.remainingAriaLabel', { time: formatTime(remaining) })}
            >
              {formatTime(remaining)}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {state.phase === 'finished'
                ? t('auditSessionTimer.done')
                : state.phase === 'paused'
                  ? t('auditSessionTimer.paused')
                  : state.phase === 'running'
                    ? t('auditSessionTimer.running')
                    : t('auditSessionTimer.idle')}
            </span>
          </div>
        </div>

        {/* Planned duration hint */}
        {state.phase !== 'finished' && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('auditSessionTimer.sessionDuration', {
              duration: formatDuration(state.durationSeconds),
            })}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        {/* Start / Resume */}
        {(state.phase === 'idle' || state.phase === 'paused') && (
          <button
            type="button"
            onClick={handleStart}
            aria-label={state.phase === 'paused' ? t('auditSessionTimer.resume') : t('auditSessionTimer.start')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            {state.phase === 'paused' ? t('auditSessionTimer.resume') : t('auditSessionTimer.start')}
          </button>
        )}

        {/* Pause */}
        {state.phase === 'running' && (
          <button
            type="button"
            onClick={handlePause}
            aria-label={t('auditSessionTimer.pause')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <Pause className="w-4 h-4" aria-hidden="true" />
            {t('auditSessionTimer.pause')}
          </button>
        )}

        {/* Stop (running or paused) */}
        {(state.phase === 'running' || state.phase === 'paused') && (
          <button
            type="button"
            onClick={handleStop}
            aria-label={t('auditSessionTimer.stop')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/30 text-slate-700 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            <Square className="w-4 h-4" aria-hidden="true" />
            {t('auditSessionTimer.stop')}
          </button>
        )}

        {/* Reset (finished or paused) */}
        {(state.phase === 'finished' || state.phase === 'paused') && (
          <button
            type="button"
            onClick={handleReset}
            aria-label={t('auditSessionTimer.reset')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            {t('auditSessionTimer.reset')}
          </button>
        )}
      </div>

      {/* Session history */}
      <SessionHistory history={state.history} />
    </section>
  );
}
