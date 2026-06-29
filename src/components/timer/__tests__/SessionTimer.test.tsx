import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import SessionTimer, { formatAuditTime } from '../StateStateStateStateStateStateStateStateStateStateSessionTimer';

describe('formatAuditTime', () => {
  test('formats minutes and seconds without dropping partial seconds', () => {
    expect(formatAuditTime(65)).toBe('01:05');
    expect(formatAuditTime(0.1)).toBe('00:01');
  });
});

describe('SessionTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('pauses accurately and records a completed audit session once', () => {
    const onSessionComplete = jest.fn();
    render(<SessionTimer durationSeconds={2} onSessionComplete={onSessionComplete} />);

    expect(screen.getByRole('timer').textContent).toBe('00:02');
    fireEvent.click(screen.getByRole('button', { name: 'Start audit' }));

    act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByRole('timer').textContent).toBe('00:01');

    fireEvent.click(screen.getByRole('button', { name: 'Pause audit' }));
    act(() => jest.advanceTimersByTime(2_000));
    expect(screen.getByRole('timer').textContent).toBe('00:01');

    fireEvent.click(screen.getByRole('button', { name: 'Resume audit' }));
    act(() => jest.advanceTimersByTime(1_000));

    expect(screen.getByRole('timer').textContent).toBe('00:00');
    expect(screen.getByText('1 session recorded')).toBeTruthy();
    expect(screen.getByText('Total audit time: 00:02')).toBeTruthy();
    expect(onSessionComplete).toHaveBeenCalledTimes(1);
    expect(onSessionComplete).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 2, completedAt: expect.any(Date) }),
    );
  });

  test('reset restores the full session without erasing recorded audit time', () => {
    render(<SessionTimer durationSeconds={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start audit' }));
    act(() => jest.advanceTimersByTime(1_000));
    fireEvent.click(screen.getByRole('button', { name: 'Start another audit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset audit timer' }));

    expect(screen.getByRole('timer').textContent).toBe('00:01');
    expect(screen.getByText('1 session recorded')).toBeTruthy();
  });
});
