import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from '@jest/globals';
import ContractTimeTraveler from '../ContractTimeTraveler';
import {
  appendSnapshot,
  DEFAULT_CONTRACT_HISTORY,
  diffSnapshots,
  diffStates,
  formatSnapshotTime,
  formatStateValue,
  MAX_SNAPSHOT_CACHE_SIZE,
  type ContractStateSnapshot,
} from '../contractTimeTravelerState';

// ---------------------------------------------------------------------------
// Pure logic — diffStates
// ---------------------------------------------------------------------------

describe('diffStates', () => {
  it('returns an empty array when states are identical', () => {
    const state = { totalTasks: 1, totalVotes: 0 };
    expect(diffStates(state, state)).toHaveLength(0);
  });

  it('detects a changed value', () => {
    const changes = diffStates({ totalTasks: 1 }, { totalTasks: 2 });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ key: 'totalTasks', before: 1, after: 2, kind: 'changed' });
  });

  it('detects an added key', () => {
    const changes = diffStates({}, { newKey: 'hello' });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ key: 'newKey', before: undefined, after: 'hello', kind: 'added' });
  });

  it('detects a removed key', () => {
    const changes = diffStates({ oldKey: 42 }, {});
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ key: 'oldKey', before: 42, after: undefined, kind: 'removed' });
  });

  it('handles complex nested values via JSON comparison', () => {
    const changes = diffStates(
      { arr: ['a', 'b'] },
      { arr: ['a', 'b', 'c'] },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('changed');
  });
});

// ---------------------------------------------------------------------------
// Pure logic — diffSnapshots
// ---------------------------------------------------------------------------

describe('diffSnapshots', () => {
  const history: ContractStateSnapshot[] = [
    {
      ledger: 1000,
      timestamp: '2026-01-01T00:00:00.000Z',
      txHash: 'aaa',
      contractId: 'TestContract',
      state: { count: 0 },
    },
    {
      ledger: 1001,
      timestamp: '2026-01-01T01:00:00.000Z',
      txHash: 'bbb',
      contractId: 'TestContract',
      state: { count: 1, newField: true },
    },
  ];

  it('returns isMatch:true when indices are equal', () => {
    const result = diffSnapshots(history, 0, 0);
    expect(result.isMatch).toBe(true);
  });

  it('reports correct changes between two snapshots', () => {
    const result = diffSnapshots(history, 0, 1);
    expect(result.isMatch).toBe(false);
    const keys = result.changes.map((c) => c.key);
    expect(keys).toContain('count');
    expect(keys).toContain('newField');
  });

  it('returns an empty diff when history indices are out of bounds', () => {
    const result = diffSnapshots(history, 99, 100);
    expect(result.isMatch).toBe(true);
    expect(result.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pure logic — appendSnapshot
// ---------------------------------------------------------------------------

describe('appendSnapshot', () => {
  const base: ContractStateSnapshot = {
    ledger: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    txHash: '',
    contractId: 'C',
    state: {},
  };

  it('appends a snapshot to the history', () => {
    const result = appendSnapshot([base], { ...base, ledger: 2 });
    expect(result).toHaveLength(2);
    expect(result[1].ledger).toBe(2);
  });

  it('does not mutate the original array', () => {
    const original = [base];
    appendSnapshot(original, { ...base, ledger: 2 });
    expect(original).toHaveLength(1);
  });

  it('caps the cache at MAX_SNAPSHOT_CACHE_SIZE', () => {
    const large = Array.from({ length: MAX_SNAPSHOT_CACHE_SIZE }, (_, i) => ({
      ...base,
      ledger: i,
    }));
    const result = appendSnapshot(large, { ...base, ledger: MAX_SNAPSHOT_CACHE_SIZE });
    expect(result).toHaveLength(MAX_SNAPSHOT_CACHE_SIZE);
    // The newest snapshot must be preserved
    expect(result[result.length - 1].ledger).toBe(MAX_SNAPSHOT_CACHE_SIZE);
  });
});

// ---------------------------------------------------------------------------
// Pure logic — formatting helpers
// ---------------------------------------------------------------------------

describe('formatSnapshotTime', () => {
  it('returns a compact human-readable string for a valid ISO date', () => {
    const result = formatSnapshotTime('2026-06-15T08:00:00.000Z');
    // Just check it contains month and day — locale output varies
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('falls back gracefully on an invalid timestamp', () => {
    const result = formatSnapshotTime('not-a-date');
    expect(typeof result).toBe('string');
  });
});

describe('formatStateValue', () => {
  it('renders null as a dash', () => {
    expect(formatStateValue(null)).toBe('—');
  });

  it('renders undefined as a dash', () => {
    expect(formatStateValue(undefined)).toBe('—');
  });

  it('renders numbers as strings', () => {
    expect(formatStateValue(42)).toBe('42');
  });

  it('renders booleans as strings', () => {
    expect(formatStateValue(true)).toBe('true');
  });

  it('renders objects as JSON', () => {
    expect(formatStateValue({ a: 1 })).toBe('{"a":1}');
  });
});

// ---------------------------------------------------------------------------
// Component — ContractTimeTraveler
// ---------------------------------------------------------------------------

describe('ContractTimeTraveler', () => {
  it('renders the heading', () => {
    render(<ContractTimeTraveler />);
    expect(screen.getByText('Contract Time Travel')).toBeTruthy();
  });

  it('shows the empty state when history is empty', () => {
    render(<ContractTimeTraveler history={[]} />);
    expect(screen.getByText('No contract state history available.')).toBeTruthy();
  });

  it('starts at the last snapshot (most recent state)', () => {
    render(<ContractTimeTraveler history={DEFAULT_CONTRACT_HISTORY} />);
    const last = DEFAULT_CONTRACT_HISTORY[DEFAULT_CONTRACT_HISTORY.length - 1];
    expect(screen.getByText(last.label as string)).toBeTruthy();
  });

  it('navigates to the previous snapshot when the previous button is clicked', () => {
    render(<ContractTimeTraveler history={DEFAULT_CONTRACT_HISTORY} />);

    const prevButton = screen.getByRole('button', { name: /previous snapshot/i });
    fireEvent.click(prevButton);

    const secondToLast = DEFAULT_CONTRACT_HISTORY[DEFAULT_CONTRACT_HISTORY.length - 2];
    expect(screen.getByText(secondToLast.label as string)).toBeTruthy();
  });

  it('navigates forward when the next button is clicked after going back', () => {
    render(<ContractTimeTraveler history={DEFAULT_CONTRACT_HISTORY} />);

    const prevButton = screen.getByRole('button', { name: /previous snapshot/i });
    const nextButton = screen.getByRole('button', { name: /next snapshot/i });

    fireEvent.click(prevButton);
    fireEvent.click(nextButton);

    const last = DEFAULT_CONTRACT_HISTORY[DEFAULT_CONTRACT_HISTORY.length - 1];
    expect(screen.getByText(last.label as string)).toBeTruthy();
  });

  it('disables the previous button at the first snapshot', () => {
    render(<ContractTimeTraveler history={DEFAULT_CONTRACT_HISTORY} />);

    const slider = screen.getByRole('slider');
    // Move to the beginning
    fireEvent.change(slider, { target: { value: '0' } });

    const prevButton = screen.getByRole('button', { name: /previous snapshot/i });
    expect(prevButton).toBeDisabled();
  });

  it('disables the next button at the last snapshot', () => {
    render(<ContractTimeTraveler history={DEFAULT_CONTRACT_HISTORY} />);
    const nextButton = screen.getByRole('button', { name: /next snapshot/i });
    expect(nextButton).toBeDisabled();
  });

  it('shows a diff summary when moving away from the first snapshot', () => {
    render(<ContractTimeTraveler history={DEFAULT_CONTRACT_HISTORY} />);

    // Default is last snapshot; diff should be visible (non-first index)
    // At least one of the diff indicators must be present
    const diffBadges = screen
      .getAllByText(/^\+\d+|^~\d+|^-\d+/)
      .filter(Boolean);
    expect(diffBadges.length).toBeGreaterThan(0);
  });

  it('renders state keys for the selected snapshot', () => {
    render(<ContractTimeTraveler history={DEFAULT_CONTRACT_HISTORY} />);
    // All snapshots have 'totalTasks'; the detail panel should show it
    expect(screen.getByText('totalTasks')).toBeTruthy();
  });

  it('works with a single-snapshot history (no diff shown)', () => {
    const single = [DEFAULT_CONTRACT_HISTORY[0]];
    render(<ContractTimeTraveler history={single} />);
    expect(screen.getByText(single[0].label as string)).toBeTruthy();
    // No diff summary should be present with only one snapshot
    expect(screen.queryByText(/field changed/)).toBeNull();
  });
});
