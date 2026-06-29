import { calculateConsensusProgress, DEFAULT_CONSENSUS_THRESHOLD } from '../StateStateStateStateStateStateStateStateStateStateconsensusWidget';

describe('calculateConsensusProgress', () => {
  it('returns 0 when threshold is 0', () => {
    const result = calculateConsensusProgress({
      currentWeight: 50,
      threshold: 0,
      approveWeight: 30,
      rejectWeight: 20,
    });
    expect(result).toBe(0);
  });

  it('returns 0 when threshold is negative', () => {
    const result = calculateConsensusProgress({
      currentWeight: 50,
      threshold: -10,
      approveWeight: 30,
      rejectWeight: 20,
    });
    expect(result).toBe(0);
  });

  it('returns 0 when currentWeight is 0', () => {
    const result = calculateConsensusProgress({
      currentWeight: 0,
      threshold: DEFAULT_CONSENSUS_THRESHOLD,
      approveWeight: 0,
      rejectWeight: 0,
    });
    expect(result).toBe(0);
  });

  it('calculates progress at 50% when current weight is half the threshold', () => {
    const result = calculateConsensusProgress({
      currentWeight: 26,
      threshold: 51,
      approveWeight: 20,
      rejectWeight: 6,
    });
    expect(result).toBe(51);
  });

  it('returns 100% when current weight equals threshold', () => {
    const result = calculateConsensusProgress({
      currentWeight: 51,
      threshold: 51,
      approveWeight: 40,
      rejectWeight: 11,
    });
    expect(result).toBe(100);
  });

  it('returns 100% when current weight exceeds threshold', () => {
    const result = calculateConsensusProgress({
      currentWeight: 75,
      threshold: 51,
      approveWeight: 60,
      rejectWeight: 15,
    });
    expect(result).toBe(100);
  });

  it('calculates progress correctly with large numbers', () => {
    const result = calculateConsensusProgress({
      currentWeight: 255,
      threshold: 1000,
      approveWeight: 200,
      rejectWeight: 55,
    });
    expect(result).toBe(26);
  });

  it('calculates progress correctly at exactly 75%', () => {
    const result = calculateConsensusProgress({
      currentWeight: 75,
      threshold: 100,
      approveWeight: 50,
      rejectWeight: 25,
    });
    expect(result).toBe(75);
  });

  it('handles fractional threshold gracefully', () => {
    const result = calculateConsensusProgress({
      currentWeight: 50,
      threshold: 10.5,
      approveWeight: 30,
      rejectWeight: 20,
    });
    expect(result).toBe(100);
  });

  it('passes through all ConsensusData fields accurately', () => {
    const data = {
      currentWeight: 30,
      threshold: 51,
      approveWeight: 20,
      rejectWeight: 10,
    };
    const progress = calculateConsensusProgress(data);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
    expect(data.approveWeight).toBe(20);
    expect(data.rejectWeight).toBe(10);
    expect(data.currentWeight).toBe(30);
  });
});