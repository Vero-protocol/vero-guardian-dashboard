import { act, fireEvent, render, screen } from '@testing-library/react';
import AuditSessionTimer from '../AuditSessionTimer';
import {
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
  totalAuditedSeconds,
  type TimerState,
} from '../auditSessionTimer';

// ---------------------------------------------------------------------------
// Pure logic — formatTime
// ---------------------------------------------------------------------------

describe('formatTime', () => {
  it('formats zero as 00:00', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('formats 90 seconds as 01:30', () => {
    expect(formatTime(90)).toBe('01:30');
  });

  it('formats 25 minutes as 25:00', () => {
    expect(formatTime(25 * 60)).toBe('25:00');
  });

  it('clamps negative values to 00:00', () => {
    expect(formatTime(-5)).toBe('00:00');
  });
});

// ---------------------------------------------------------------------------
// Pure logic — formatDuration
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
  it('formats seconds only when under a minute', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats whole minutes without seconds', () => {
    expect(formatDuration(60)).toBe('1m');
  });

  it('formats mixed minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1m 30s');
  });

  it('clamps negative values', () => {
    expect(formatDuration(-10)).toBe('0s');
  });
});

// ---------------------------------------------------------------------------
// Pure logic — getRemainingSeconds / getProgress
// ---------------------------------------------------------------------------

describe('getRemainingSeconds', () => {
  it('returns full duration when elapsed is 0', () => {
    expect(getRemainingSeconds(INITIAL_TIMER_STATE)).toBe(INITIAL_TIMER_STATE.durationSeconds);
  });

  it('returns 0 when elapsed equals duration', () => {
    const state: TimerState = { ...INITIAL_TIMER_STATE, elapsedSeconds: INITIAL_TIMER_STATE.durationSeconds };
    expect(getRemainingSeconds(state)).toBe(0);
  });

  it('never returns a negative value', () => {
    const state: TimerState = { ...INITIAL_TIMER_STATE, elapsedSeconds: 99999 };
    expect(getRemainingSeconds(state)).toBe(0);
  });
});

describe('getProgress', () => {
  it('returns 0 when nothing has elapsed', () => {
    expect(getProgress(INITIAL_TIMER_STATE)).toBe(0);
  });

  it('returns 0.5 at the halfway point', () => {
    const state: TimerState = {
      ...INITIAL_TIMER_STATE,
      elapsedSeconds: INITIAL_TIMER_STATE.durationSeconds / 2,
    };
    expect(getProgress(state)).toBeCloseTo(0.5);
  });

  it('caps at 1 when over duration', () => {
    const state: TimerState = { ...INITIAL_TIMER_STATE, elapsedSeconds: 99999 };
    expect(getProgress(state)).toBe(1);
  });

  it('returns 0 when duration is 0', () => {
    const state: TimerState = { ...INITIAL_TIMER_STATE, durationSeconds: 0 };
    expect(getProgress(state)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pure logic — tick
// ---------------------------------------------------------------------------

describe('tick', () => {
  it('does nothing when phase is not running', () => {
    const idle = INITIAL_TIMER_STATE;
    expect(tick(idle)).toBe(idle); // same reference
  });

  it('increments elapsed by 1 each tick', () => {
    const running: TimerState = { ...INITIAL_TIMER_STATE, phase: 'running' };
    const next = tick(running);
    expect(next.elapsedSeconds).toBe(1);
    expect(next.phase).toBe('running');
  });

  it('transitions to finished on the final tick', () => {
    const almostDone: TimerState = {
      ...INITIAL_TIMER_STATE,
      phase: 'running',
      durationSeconds: 5,
      elapsedSeconds: 4,
    };
    const finished = tick(almostDone);
    expect(finished.phase).toBe('finished');
    expect(finished.elapsedSeconds).toBe(5);
  });

  it('adds a completed record to history on finish', () => {
    const almostDone: TimerState = {
      ...INITIAL_TIMER_STATE,
      phase: 'running',
      durationSeconds: 3,
      elapsedSeconds: 2,
    };
    const finished = tick(almostDone);
    expect(finished.history).toHaveLength(1);
    expect(finished.history[0].completed).toBe(true);
    expect(finished.history[0].elapsedSeconds).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Pure logic — startSession / pauseSession / stopSession / resetSession
// ---------------------------------------------------------------------------

describe('startSession', () => {
  it('transitions idle to running', () => {
    expect(startSession(INITIAL_TIMER_STATE).phase).toBe('running');
  });

  it('transitions paused to running', () => {
    const paused: TimerState = { ...INITIAL_TIMER_STATE, phase: 'paused' };
    expect(startSession(paused).phase).toBe('running');
  });

  it('is a no-op when already running', () => {
    const running: TimerState = { ...INITIAL_TIMER_STATE, phase: 'running' };
    expect(startSession(running)).toBe(running);
  });
});

describe('pauseSession', () => {
  it('transitions running to paused', () => {
    const running: TimerState = { ...INITIAL_TIMER_STATE, phase: 'running' };
    expect(pauseSession(running).phase).toBe('paused');
  });

  it('is a no-op when not running', () => {
    expect(pauseSession(INITIAL_TIMER_STATE)).toBe(INITIAL_TIMER_STATE);
  });
});

describe('stopSession', () => {
  it('transitions running to idle and records elapsed', () => {
    const running: TimerState = {
      ...INITIAL_TIMER_STATE,
      phase: 'running',
      elapsedSeconds: 120,
    };
    const stopped = stopSession(running);
    expect(stopped.phase).toBe('idle');
    expect(stopped.elapsedSeconds).toBe(0);
    expect(stopped.history).toHaveLength(1);
    expect(stopped.history[0].elapsedSeconds).toBe(120);
    expect(stopped.history[0].completed).toBe(false);
  });

  it('is a no-op when already idle', () => {
    expect(stopSession(INITIAL_TIMER_STATE)).toBe(INITIAL_TIMER_STATE);
  });
});

describe('resetSession', () => {
  it('resets elapsed to 0 and phase to idle without adding history', () => {
    const paused: TimerState = {
      ...INITIAL_TIMER_STATE,
      phase: 'paused',
      elapsedSeconds: 60,
    };
    const reset = resetSession(paused);
    expect(reset.phase).toBe('idle');
    expect(reset.elapsedSeconds).toBe(0);
    expect(reset.history).toHaveLength(0);
  });
});

describe('setDuration', () => {
  it('updates duration when idle', () => {
    const updated = setDuration(INITIAL_TIMER_STATE, 900);
    expect(updated.durationSeconds).toBe(900);
  });

  it('is a no-op when not idle', () => {
    const running: TimerState = { ...INITIAL_TIMER_STATE, phase: 'running' };
    expect(setDuration(running, 900)).toBe(running);
  });
});

// ---------------------------------------------------------------------------
// Pure logic — totalAuditedSeconds
// ---------------------------------------------------------------------------

describe('totalAuditedSeconds', () => {
  it('returns 0 for empty history', () => {
    expect(totalAuditedSeconds([])).toBe(0);
  });

  it('sums elapsed seconds across all records', () => {
    const history = [
      { id: 1, plannedSeconds: 1500, elapsedSeconds: 1500, finishedAt: '', completed: true },
      { id: 2, plannedSeconds: 1500, elapsedSeconds: 300,  finishedAt: '', completed: false },
    ];
    expect(totalAuditedSeconds(history)).toBe(1800);
  });
});

// ---------------------------------------------------------------------------
// Component — AuditSessionTimer
// ---------------------------------------------------------------------------

describe('AuditSessionTimer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders the heading', () => {
    render(<AuditSessionTimer />);
    expect(screen.getByText('Audit Focus Timer')).toBeTruthy();
  });

  it('shows preset duration buttons', () => {
    render(<AuditSessionTimer />);
    expect(screen.getByRole('button', { name: /15m/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /25m/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /45m/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /60m/i })).toBeTruthy();
  });

  it('starts with the start button visible', () => {
    render(<AuditSessionTimer />);
    expect(screen.getByRole('button', { name: /^start$/i })).toBeTruthy();
  });

  it('hides presets and shows pause/stop after starting', () => {
    render(<AuditSessionTimer />);
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
    expect(screen.queryByRole('button', { name: /15m/i })).toBeNull();
    expect(screen.getByRole('button', { name: /pause/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /stop/i })).toBeTruthy();
  });

  it('shows resume and reset after pausing', () => {
    render(<AuditSessionTimer />);
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(screen.getByRole('button', { name: /resume/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reset/i })).toBeTruthy();
  });

  it('counts down each second while running', () => {
    render(<AuditSessionTimer initialDurationSeconds={10} />);
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    act(() => { jest.advanceTimersByTime(3000); });

    // 10 - 3 = 7 seconds remaining → 00:07
    expect(screen.getByText('00:07')).toBeTruthy();
  });

  it('shows finished state when time runs out', () => {
    render(<AuditSessionTimer initialDurationSeconds={2} />);
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    act(() => { jest.advanceTimersByTime(2000); });

    expect(screen.getByText('Complete')).toBeTruthy();
    expect(screen.getByText('00:00')).toBeTruthy();
  });

  it('records a session in history after stopping early', () => {
    render(<AuditSessionTimer initialDurationSeconds={60} />);
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    act(() => { jest.advanceTimersByTime(5000); });

    fireEvent.click(screen.getByRole('button', { name: /stop/i }));

    expect(screen.getByText('Session History')).toBeTruthy();
  });

  it('calls onSessionEnd when a session completes', () => {
    const onEnd = jest.fn();
    render(<AuditSessionTimer initialDurationSeconds={1} onSessionEnd={onEnd} />);
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    act(() => { jest.advanceTimersByTime(1000); });

    expect(onEnd).toHaveBeenCalledWith(1, true);
  });

  it('calls onSessionEnd with completed=false when stopped early', () => {
    const onEnd = jest.fn();
    render(<AuditSessionTimer initialDurationSeconds={60} onSessionEnd={onEnd} />);
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    act(() => { jest.advanceTimersByTime(3000); });

    fireEvent.click(screen.getByRole('button', { name: /stop/i }));

    expect(onEnd).toHaveBeenCalledWith(3, false);
  });

  it('changing a preset updates the displayed duration', () => {
    render(<AuditSessionTimer />);
    fireEvent.click(screen.getByRole('button', { name: /15m/i }));
    expect(screen.getByText('15:00')).toBeTruthy();
  });
});
