/**
 * Contract state time-travel logic (issue #51)
 *
 * Manages an in-memory snapshot cache of historical contract states and
 * provides pure functions for building state diffs between snapshots.
 *
 * Performance: all operations are O(n) or better on the snapshot array length,
 * and the cache is capped to avoid unbounded memory growth.
 */

/** One point-in-time capture of a contract's on-chain state. */
export interface ContractStateSnapshot {
  /** The ledger sequence number at which this snapshot was taken. */
  ledger: number;
  /** ISO 8601 timestamp of the snapshot. */
  timestamp: string;
  /** Transaction hash that triggered the state change (empty string if seed/manual). */
  txHash: string;
  /** Contract address / identifier. */
  contractId: string;
  /** Flat key/value map of the contract's storage at this point in time. */
  state: Record<string, unknown>;
  /** Optional human-readable label for display (e.g. "Initial state", "After vote"). */
  label?: string;
}

/** A single field-level change between two snapshots. */
export interface StateFieldDiff {
  /** Storage key that changed. */
  key: string;
  /** Value in the "before" snapshot (undefined if the key was added). */
  before: unknown;
  /** Value in the "after" snapshot (undefined if the key was removed). */
  after: unknown;
  /** Semantic classification of this change. */
  kind: 'added' | 'removed' | 'changed';
}

/** Structured comparison result between two snapshots. */
export interface SnapshotDiff {
  /** Index of the earlier snapshot in the history array. */
  fromIndex: number;
  /** Index of the later snapshot in the history array. */
  toIndex: number;
  /** Field-level changes. Empty when the states are identical. */
  changes: StateFieldDiff[];
  /** True when there are no changes. */
  isMatch: boolean;
}

/** Maximum snapshots retained in a single cache to bound memory usage. */
export const MAX_SNAPSHOT_CACHE_SIZE = 200;

// ---------------------------------------------------------------------------
// Pure helper functions (all exported for unit-testing)
// ---------------------------------------------------------------------------

/**
 * Compute the field-level diff between two flat state maps.
 * Returns an array of changes; an empty array means the states are identical.
 */
export function diffStates(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): StateFieldDiff[] {
  const changes: StateFieldDiff[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(after, key);

    if (!hasBefore) {
      changes.push({ key, before: undefined, after: after[key], kind: 'added' });
      continue;
    }
    if (!hasAfter) {
      changes.push({ key, before: before[key], after: undefined, kind: 'removed' });
      continue;
    }
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes.push({ key, before: before[key], after: after[key], kind: 'changed' });
    }
  }

  return changes;
}

/**
 * Compare two snapshots from a history array by their indices.
 * Returns a SnapshotDiff. Works even when `fromIndex === toIndex`.
 */
export function diffSnapshots(
  history: ContractStateSnapshot[],
  fromIndex: number,
  toIndex: number,
): SnapshotDiff {
  const from = history[fromIndex];
  const to = history[toIndex];

  if (!from || !to) {
    return { fromIndex, toIndex, changes: [], isMatch: true };
  }

  const changes = diffStates(from.state, to.state);
  return { fromIndex, toIndex, changes, isMatch: changes.length === 0 };
}

/**
 * Append a new snapshot to a history array, enforcing the cache size cap.
 * Returns a new array (immutable — the caller owns state).
 */
export function appendSnapshot(
  history: ContractStateSnapshot[],
  snapshot: ContractStateSnapshot,
  maxSize = MAX_SNAPSHOT_CACHE_SIZE,
): ContractStateSnapshot[] {
  const next = [...history, snapshot];
  if (next.length > maxSize) {
    return next.slice(next.length - maxSize);
  }
  return next;
}

/**
 * Format an ISO timestamp for compact display in the slider tooltip
 * (e.g. "Jun 18, 14:32").
 */
export function formatSnapshotTime(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return isoTimestamp;
  }
}

/**
 * Format a raw state value for human-readable display in the detail panel.
 */
export function formatStateValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Demo / seed data
// ---------------------------------------------------------------------------

/**
 * Representative historical snapshots for the Vero contract.
 * Injectable via props so real on-chain data can replace it.
 */
export const DEFAULT_CONTRACT_HISTORY: ContractStateSnapshot[] = [
  {
    ledger: 54_210,
    timestamp: '2026-06-15T08:00:00.000Z',
    txHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    contractId: 'Vero Task Registry',
    label: 'Contract deployed',
    state: {
      totalTasks: 0,
      totalVotes: 0,
      activeGuardians: 3,
      proposalThreshold: 2,
      reputationFloor: 100,
    },
  },
  {
    ledger: 54_450,
    timestamp: '2026-06-15T11:22:00.000Z',
    txHash: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
    contractId: 'Vero Task Registry',
    label: 'First PR registered',
    state: {
      totalTasks: 1,
      totalVotes: 0,
      activeGuardians: 3,
      proposalThreshold: 2,
      reputationFloor: 100,
      lastTaskId: 'task_pr_42',
    },
  },
  {
    ledger: 54_812,
    timestamp: '2026-06-15T14:05:00.000Z',
    txHash: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    contractId: 'Vero Task Registry',
    label: 'Guardian vote cast',
    state: {
      totalTasks: 1,
      totalVotes: 1,
      activeGuardians: 3,
      proposalThreshold: 2,
      reputationFloor: 100,
      lastTaskId: 'task_pr_42',
      lastVoteBy: 'GBYZ…KQPW',
    },
  },
  {
    ledger: 55_100,
    timestamp: '2026-06-16T09:40:00.000Z',
    txHash: 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
    contractId: 'Vero Task Registry',
    label: 'Threshold reached — task approved',
    state: {
      totalTasks: 2,
      totalVotes: 3,
      activeGuardians: 3,
      proposalThreshold: 2,
      reputationFloor: 100,
      lastTaskId: 'task_pr_43',
      lastVoteBy: 'GABC…XYZW',
      approvedTasks: ['task_pr_42'],
    },
  },
  {
    ledger: 55_550,
    timestamp: '2026-06-17T16:15:00.000Z',
    txHash: 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
    contractId: 'Vero Task Registry',
    label: 'Guardian set expanded',
    state: {
      totalTasks: 2,
      totalVotes: 3,
      activeGuardians: 4,
      proposalThreshold: 3,
      reputationFloor: 150,
      lastTaskId: 'task_pr_43',
      lastVoteBy: 'GABC…XYZW',
      approvedTasks: ['task_pr_42'],
      newGuardian: 'GDEF…MNOP',
    },
  },
];
