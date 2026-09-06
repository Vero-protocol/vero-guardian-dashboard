'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Pause, Play, RotateCcw, Timer as TimerIcon } from 'lucide-react';

export const DEFAULT_SESSION_SECONDS = 25 * 60;
export const TIMER_TICK_MS = 250;

export interface AuditSessionRecord {
  completedAt: Date;
  durationSeconds: number;
}

interface SessionTimerProps {
  durationSeconds?: number;
  now?: () => number;
  onSessionComplete?: (session: AuditSessionRecord) => void;
}

type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';

export function formatAuditTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function SessionTimer({
  durationSeconds = DEFAULT_SESSION_SECONDS,
  now = Date.now,
  onSessionComplete,
}: SessionTimerProps) {
  const { t } = useTranslation();
  const sessionDurationMs = Math.max(1, durationSeconds) * 1_000;
  const [remainingMs, setRemainingMs] = useState(sessionDurationMs);
  const [status, setStatus] = useState<TimerStatus>('idle');
  const [sessions, setSessions] = useState<AuditSessionRecord[]>([]);
  const endsAtRef = useRef<number | null>(null);
  const completionRecordedRef = useRef(false);

  const completeSession = useCallback(() => {
    if (completionRecordedRef.current) {
      return;
    }

    completionRecordedRef.current = true;
    endsAtRef.current = null;
    const session = {
      completedAt: new Date(now()),
      durationSeconds: sessionDurationMs / 1_000,
    };
    setRemainingMs(0);
    setStatus('completed');
    setSessions((currentSessions) => [session, ...currentSessions]);
    onSessionComplete?.(session);
  }, [now, onSessionComplete, sessionDurationMs]);

  useEffect(() => {
    if (status !== 'running') {
      return;
    }

    const updateRemainingTime = () => {
      const endsAt = endsAtRef.current;
      if (endsAt === null) {
        return;
      }

      const nextRemainingMs = Math.max(0, endsAt - now());
      if (nextRemainingMs === 0) {
        completeSession();
        return;
      }
      setRemainingMs(nextRemainingMs);
    };

    updateRemainingTime();
    const intervalId = window.setInterval(updateRemainingTime, TIMER_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [completeSession, now, status]);

  const startOrResume = () => {
    completionRecordedRef.current = false;
    const nextRemainingMs = status === 'completed' ? sessionDurationMs : remainingMs;
    setRemainingMs(nextRemainingMs);
    endsAtRef.current = now() + nextRemainingMs;
    setStatus('running');
  };

  const pause = () => {
    if (endsAtRef.current !== null) {
      setRemainingMs(Math.max(0, endsAtRef.current - now()));
    }
    endsAtRef.current = null;
    setStatus('paused');
  };

  const reset = () => {
    endsAtRef.current = null;
    completionRecordedRef.current = false;
    setRemainingMs(sessionDurationMs);
    setStatus('idle');
  };

  const remainingSeconds = remainingMs / 1_000;
  const progress = Math.min(100, Math.max(0, ((sessionDurationMs - remainingMs) / sessionDurationMs) * 100));
  const isRunning = status === 'running';
  const primaryLabel = status === 'paused' ? t('sessionTimer.resume', 'Resume audit') : status === 'completed' ? t('sessionTimer.startAnother', 'Start another audit') : t('sessionTimer.start', 'Start audit');
  const totalAuditedSeconds = sessions.reduce((total, session) => total + session.durationSeconds, 0);

  return (
    <section aria-labelledby="audit-session-timer-title" className="space-y-5">
      <div className="flex items-center gap-2">
        <TimerIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
        <div>
          <h2 id="audit-session-timer-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            Audit focus timer
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">One task. One focused session.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5 text-center dark:border-violet-900 dark:bg-violet-950/30">
        <p
          className="font-mono text-5xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white"
          role="timer"
          aria-live="off"
          aria-label={`${Math.ceil(remainingSeconds)} seconds remaining`}
        >
          {formatAuditTime(remainingSeconds)}
        </p>
        <p className="mt-2 text-sm font-medium text-violet-700 dark:text-violet-300">
          {status === 'running' && t('sessionTimer.inProgress', 'Focus session in progress')}
          {status === 'paused' && t('sessionTimer.paused', 'Session paused')}
          {status === 'idle' && t('sessionTimer.ready', 'Ready for a focused audit')}
          {status === 'completed' && t('sessionTimer.completed', 'Session complete — time recorded')}
        </p>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950"
          role="progressbar"
          aria-label="Audit session progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={isRunning ? pause : startOrResume}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          {isRunning ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          {isRunning ? t('sessionTimer.pause', 'Pause audit') : primaryLabel}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={status === 'idle'}
          aria-label="Reset audit timer"
          className="rounded-xl border border-slate-200 bg-white px-4 text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">
              {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} recorded
            </p>
            <p className="text-emerald-700 dark:text-emerald-400">Total audit time: {formatAuditTime(totalAuditedSeconds)}</p>
          </div>
        </div>
      )}
    </section>
  );
}
