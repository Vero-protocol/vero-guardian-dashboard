import { ClipboardCheck, HelpCircle, Timer, Wallet } from 'lucide-react';
import {
  EVENT_TYPE_OPTIONS,
  filterEvents,
  formatTimestamp,
  getEventTypeOption,
} from '../StateStateStateStateStateStateStateStateStateStateeventMonitorUtils';

describe('getEventTypeOption', () => {
  it('returns the vote option for vote type', () => {
    const option = getEventTypeOption('vote');
    expect(option.type).toBe('vote');
    expect(option.icon).toBe(ClipboardCheck);
  });

  it('returns the wallet option for wallet_connected', () => {
    const option = getEventTypeOption('wallet_connected');
    expect(option.type).toBe('wallet_connected');
    expect(option.icon).toBe(Wallet);
  });

  it('returns the all option for all type', () => {
    const option = getEventTypeOption('all');
    expect(option.type).toBe('all');
    expect(option.icon).toBe(Timer);
  });

  it('falls back to unknown for unrecognized event types', () => {
    const option = getEventTypeOption('custom_event_type');
    expect(option.type).toBe('custom_event_type');
    expect(option.icon).toBe(HelpCircle);
    expect(option.labelKey).toBe('eventMonitor.typeUnknown');
  });
});

describe('formatTimestamp', () => {
  it('returns a locale time string for valid ISO date', () => {
    const result = formatTimestamp('2026-01-15T10:30:00.000Z');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns the original string for invalid dates', () => {
    const result = formatTimestamp('not-a-date');
    expect(result).toBe('not-a-date');
  });

  it('handles empty string gracefully', () => {
    const result = formatTimestamp('');
    expect(result).toBe('');
  });
});

describe('filterEvents', () => {
  const events = [
    { type: 'vote', id: '1' },
    { type: 'transaction', id: '2' },
    { type: 'vote', id: '3' },
  ] as const;

  it('returns all events when filter is "all"', () => {
    expect(filterEvents(events, 'all')).toHaveLength(3);
  });

  it('filters by specific event type', () => {
    const filtered = filterEvents(events, 'vote');
    expect(filtered).toHaveLength(2);
    expect(filtered[0].type).toBe('vote');
    expect(filtered[1].type).toBe('vote');
  });

  it('returns empty array when no events match', () => {
    const filtered = filterEvents(events, 'emergency_halt');
    expect(filtered).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    const filtered = filterEvents([], 'all');
    expect(filtered).toHaveLength(0);
  });
});

describe('EVENT_TYPE_OPTIONS', () => {
  it('includes all expected event types', () => {
    const types = EVENT_TYPE_OPTIONS.map((opt) => opt.type);
    expect(types).toContain('all');
    expect(types).toContain('vote');
    expect(types).toContain('task_registered');
    expect(types).toContain('reputation_change');
    expect(types).toContain('wallet_connected');
    expect(types).toContain('wallet_disconnected');
    expect(types).toContain('transaction');
    expect(types).toContain('emergency_halt');
    expect(types).toContain('force_sync');
  });

  it('every option has a labelKey, icon, and color', () => {
    for (const option of EVENT_TYPE_OPTIONS) {
      expect(option.labelKey).toBeTruthy();
      expect(option.icon).toBeDefined();
      expect(option.color).toBeTruthy();
    }
  });
});
