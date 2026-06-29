/**
 * Audit session timer logic (issue #59)
 *
 * Pure functions and types for managing time-boxed audit sessions.
 * All functions are side-effect free and fully unit-testable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Named preset durations available in the timer UI. */
export type TimerPreset = 15 | 25 | 45 | 60;

export const TIMER_PRESETS: TimerPreset[] = [15, 25, 45, 60];

/** Current phase of a session. */
export type SessionPhase = 'idle' | 'running' | 'paused' | 'finished';

/** A completed session record stored in history. */
export interface SessionRecord {
  /** Monotonic id — millisecond timestamp at which the session started. */
  id: number;
  /** Planned duration in seconds. */
  plannedSeconds: number;
  /** Actual elapsed seconds when the session ended (may be less if stopped early). */
  elapsedSeconds: number;
  /** ISO timestamp of when the session finished. */
  finishedAt: string;
  /** True when the full duration was completed without being stopped early. */
  completed: boolean;
}

/** Full timer state kept in component useState. */
export interface TimerState {
  phase: SessionPhase;
  /** Total planned duration for the current session (seconds). */
  durationSeconds: number;
  /** Seconds elapsed so far in the current session. */
  elapsedSeconds: number;
  /** Completed-session history for the current page visit. */
  history: SessionRecord[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_PRESET: TimerPreset = 25;
export const DEFAULT_DURATION_SECONDS: number = DEFAULT_PRESET * 60;

export const INITIAL_TIMER_STATE: TimerState = {
  phase: 'idle',
  durationSeconds: DEFAULT_DURATION_SECONDS,
  elapsedSeconds: 0,
  history: [],
};

// ---------------------------------------------------------------------------
// Pure helpers (all exported for unit tests)
// ---------------------------------------------------------------------------

/** Remaining seconds in the current session. */
export function getRemainingSeconds(state: TimerState): number {
  return Math.max(0, state.durationSeconds - state.elapsedSeconds);
}

/** Progress as a value in [0, 1]. */
export function getProgress(state: TimerState): number {
  if (state.durationSeconds === 0) return 0;
  return Math.min(1, state.elapsedSeconds / state.durationSeconds);
}

/** Format seconds as MM:SS string (e.g. 90 → "01:30"). */
export function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.trunc(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Format total seconds as a human-readable duration (e.g. 90 → "1m 30s"). */
export function formatDuration(totalSeconds: number): string {
  const clamped = Math.max(0, Math.trunc(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Produce the next state after one tick (one second passing).
 * Returns the same reference when the phase is not 'running'.
 */
export function tick(state: TimerState): TimerState {
  if (state.phase !== 'running') return state;

  const nextElapsed = state.elapsedSeconds + 1;

  if (nextElapsed >= state.durationSeconds) {
    // Session complete
    const record: SessionRecord = {
      id: Date.now(),
      plannedSeconds: state.durationSeconds,
      elapsedSeconds: state.durationSeconds,
      finishedAt: new Date().toISOString(),
      completed: true,
    };
    return {
      ...state,
      phase: 'finished',
      elapsedSeconds: state.durationSeconds,
      history: [...state.history, record],
    };
  }

  return { ...state, elapsedSeconds: nextElapsed };
}

/** Start or resume a session. */
export function startSession(state: TimerState): TimerState {
  if (state.phase === 'running' || state.phase === 'finished') return state;
  return { ...state, phase: 'running' };
}

/** Pause a running session. */
export function pauseSession(state: TimerState): TimerState {
  if (state.phase !== 'running') return state;
  return { ...state, phase: 'paused' };
}

/**
 * Stop a session early, recording whatever was elapsed.
 * Resets elapsed but preserves duration and history.
 */
export function stopSession(state: TimerState): TimerState {
  if (state.phase === 'idle') return state;

  const record: SessionRecord = {
    id: Date.now(),
    plannedSeconds: state.durationSeconds,
    elapsedSeconds: state.elapsedSeconds,
    finishedAt: new Date().toISOString(),
    completed: false,
  };

  return {
    ...state,
    phase: 'idle',
    elapsedSeconds: 0,
    history: [...state.history, record],
  };
}

/** Reset back to idle with the current duration, discarding elapsed time. No history entry. */
export function resetSession(state: TimerState): TimerState {
  return { ...state, phase: 'idle', elapsedSeconds: 0 };
}

/** Change the planned duration (only allowed when idle). */
export function setDuration(state: TimerState, seconds: number): TimerState {
  if (state.phase !== 'idle') return state;
  return { ...state, durationSeconds: seconds, elapsedSeconds: 0 };
}

/** Total auditing seconds across all completed history records. */
export function totalAuditedSeconds(history: SessionRecord[]): number {
  return history.reduce((sum, r) => sum + r.elapsedSeconds, 0);
}
