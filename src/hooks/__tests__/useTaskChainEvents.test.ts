import { act, renderHook } from '@testing-library/react';
import { useTaskChainEvents } from '@/hooks/useTaskChainEvents';
import { resetChainStateForTests } from '@/hooks/useChainState';
import { useEvents } from '@/hooks/useEvents';

jest.useFakeTimers();

describe('useTaskChainEvents', () => {
  afterEach(() => {
    act(() => resetChainStateForTests());
  });

  it('starts polling when enabled', () => {
    const { result } = renderHook(() =>
      useTaskChainEvents({ intervalMs: 1000, enabled: true }),
    );
    expect(result.current.isPolling).toBe(true);
    expect(result.current.pollCount).toBe(0);
  });

  it('does not poll when disabled', () => {
    const { result } = renderHook(() =>
      useTaskChainEvents({ intervalMs: 1000, enabled: false }),
    );
    expect(result.current.isPolling).toBe(false);
  });

  it('emits events into the bus and increments pollCount', () => {
    const { result: eventsResult } = renderHook(() => useEvents());
    const { result } = renderHook(() =>
      useTaskChainEvents({ intervalMs: 100, enabled: true }),
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.pollCount).toBeGreaterThanOrEqual(1);
    expect(result.current.lastEvent).not.toBeNull();
    expect(result.current.lastEvent?.type).toBe('task_verified');
    expect(eventsResult.current.timeline.length).toBeGreaterThanOrEqual(1);
    const emitted = eventsResult.current.timeline.find(
      (e) => e.type === 'task_verified',
    );
    expect(emitted).toBeDefined();
  });
});
