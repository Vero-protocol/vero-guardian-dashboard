/**
 * Reputation score impact simulator.
 *
 * Mirrors the weighted integer math from the leaderboard score, applied to
 * the Guardian's on-chain `vero_reputation` value so users can preview the
 * effect of protocol actions before submitting transactions.
 */

export type SimulatorAction =
  | 'approve_vote'
  | 'dispute_vote'
  | 'critical_finding'
  | 'high_finding'
  | 'medium_finding'
  | 'complete_audit'
  | 'submit_validation';

/** Point delta applied per action (integer math, no floating point). */
export const ACTION_DELTAS: Record<SimulatorAction, number> = {
  approve_vote: 8,
  dispute_vote: -10,
  critical_finding: 20,
  high_finding: 12,
  medium_finding: 6,
  complete_audit: 24,
  submit_validation: 10,
};

export const MIN_REPUTATION = 0;
export const MAX_REPUTATION = 1_000_000;

/** Clamp an integer score to the valid reputation range. */
export function clampScore(score: number): number {
  return Math.min(MAX_REPUTATION, Math.max(MIN_REPUTATION, Math.trunc(score)));
}

/**
 * Simulate the new score after applying `count` instances of `action`.
 *
 * @param currentScore  Current on-chain reputation (integer ≥ 0)
 * @param action        Protocol action to simulate
 * @param count         Number of times the action is taken (default 1)
 * @returns             Object with projected score and net delta
 */
export function simulateScoreImpact(
  currentScore: number,
  action: SimulatorAction,
  count = 1,
): { projectedScore: number; delta: number } {
  const safeBase = clampScore(currentScore);
  const safeCount = Math.max(0, Math.trunc(count));
  const delta = ACTION_DELTAS[action] * safeCount;
  const projectedScore = clampScore(safeBase + delta);
  return { projectedScore, delta: projectedScore - safeBase };
}

/**
 * Simulate applying multiple actions at once.
 *
 * @param currentScore  Starting reputation
 * @param actions       Map of action → count
 * @returns             Projected score and total net delta
 */
export function simulateMultipleActions(
  currentScore: number,
  actions: Partial<Record<SimulatorAction, number>>,
): { projectedScore: number; delta: number } {
  const safeBase = clampScore(currentScore);
  let rawDelta = 0;
  for (const [action, count] of Object.entries(actions) as [SimulatorAction, number][]) {
    rawDelta += ACTION_DELTAS[action] * Math.max(0, Math.trunc(count));
  }
  const projectedScore = clampScore(safeBase + rawDelta);
  return { projectedScore, delta: projectedScore - safeBase };
}
