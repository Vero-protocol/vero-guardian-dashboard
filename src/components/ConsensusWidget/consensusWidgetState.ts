/**
 * Consensus threshold constants and types for the ConsensusWidget.
 */

/** Default consensus threshold percentage (e.g., 51% of total vote weight). */
export const DEFAULT_CONSENSUS_THRESHOLD = 51;

/** Stellar data entry key used to store the consensus threshold on-chain. */
export const CONSENSUS_THRESHOLD_KEY = 'consensus_threshold';

/** The vote weight a single guardian casts (used for progress calculation). */
export const GUARDIAN_VOTE_WEIGHT = 1;

export interface ConsensusData {
  /** Total vote weight accumulated so far (approve + reject). */
  currentWeight: number;
  /** The consensus threshold value (percentage, e.g. 51 means 51%). */
  threshold: number;
  /** Vote weight from approve votes. */
  approveWeight: number;
  /** Vote weight from reject votes. */
  rejectWeight: number;
}

export function calculateConsensusProgress(data: ConsensusData): number {
  if (data.threshold <= 0) return 0;
  // Progress is measured as the ratio of current weight to the required threshold
  const requiredWeight = data.threshold;
  const progress = Math.min(100, Math.round((data.currentWeight / requiredWeight) * 100));
  return Math.max(0, progress);
}