import * as StellarSdk from '@stellar/stellar-sdk';
import {
  DEFAULT_GAS_LIMITS,
  GAS_RESOURCES,
  GasMonitorError,
  GasUsageMonitor,
  estimateGas,
  estimateGasFromSimulation,
  extractGasUsage,
  formatGas,
  formatGasLogMessage,
  logGasEstimate,
  simulateGas,
  type GasLogger,
  type GasLogRecord,
  type GasUsage,
  type TransactionSimulator,
} from '../gasMonitor';

function makeLedgerKey(): StellarSdk.xdr.LedgerKey {
  return StellarSdk.xdr.LedgerKey.account(
    new StellarSdk.xdr.LedgerKeyAccount({ accountId: StellarSdk.Keypair.random().xdrAccountId() }),
  );
}

function makeKeys(count: number): StellarSdk.xdr.LedgerKey[] {
  return Array.from({ length: count }, () => makeLedgerKey());
}

interface SimulationInput {
  cpuInsns: number;
  memBytes: number;
  readBytes: number;
  writeBytes: number;
  minResourceFee: number;
  readEntries?: number;
  writeEntries?: number;
}

function makeSimulation(
  input: SimulationInput,
): StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse {
  const transactionData = new StellarSdk.SorobanDataBuilder()
    .setResources(input.cpuInsns, input.readBytes, input.writeBytes)
    .setResourceFee(input.minResourceFee)
    .setFootprint(makeKeys(input.readEntries ?? 0), makeKeys(input.writeEntries ?? 0));

  return {
    id: '1',
    latestLedger: 1000,
    events: [],
    _parsed: true,
    transactionData,
    minResourceFee: String(input.minResourceFee),
    cost: { cpuInsns: String(input.cpuInsns), memBytes: String(input.memBytes) },
  } as StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse;
}

function makeErrorSimulation(error: string): StellarSdk.SorobanRpc.Api.SimulateTransactionErrorResponse {
  return {
    id: '1',
    latestLedger: 1000,
    events: [],
    _parsed: true,
    error,
  } as StellarSdk.SorobanRpc.Api.SimulateTransactionErrorResponse;
}

const SAFE_USAGE: GasUsage = {
  cpuInstructions: 12_500_000,
  memoryBytes: 524_288,
  ledgerReadBytes: 20_000,
  ledgerWriteBytes: 10_000,
  ledgerReadEntries: 8,
  ledgerWriteEntries: 3,
  resourceFeeStroops: 1_000_000,
};

describe('extractGasUsage', () => {
  it('reads every resource out of a simulation response', () => {
    const usage = extractGasUsage(
      makeSimulation({
        cpuInsns: 12_500_000,
        memBytes: 524_288,
        readBytes: 20_480,
        writeBytes: 8_192,
        minResourceFee: 987_654,
        readEntries: 6,
        writeEntries: 2,
      }),
    );

    expect(usage).toEqual({
      cpuInstructions: 12_500_000,
      memoryBytes: 524_288,
      ledgerReadBytes: 20_480,
      ledgerWriteBytes: 8_192,
      ledgerReadEntries: 6,
      ledgerWriteEntries: 2,
      resourceFeeStroops: 987_654,
    });
  });

  it('falls back to declared instructions when cost is absent', () => {
    const sim = makeSimulation({
      cpuInsns: 7_000_000,
      memBytes: 0,
      readBytes: 0,
      writeBytes: 0,
      minResourceFee: 0,
    });
    const withoutCost = { ...sim, cost: undefined } as unknown as StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse;

    expect(extractGasUsage(withoutCost).cpuInstructions).toBe(7_000_000);
  });
});

describe('estimateGas', () => {
  it('reports ok when every resource is well under its limit', () => {
    const estimate = estimateGas('cast_vote', SAFE_USAGE);
    expect(estimate.severity).toBe('ok');
    expect(estimate.withinLimits).toBe(true);
    expect(estimate.violations).toHaveLength(0);
    expect(estimate.utilization.cpuInstructions).toBeCloseTo(12_500_000 / DEFAULT_GAS_LIMITS.cpuInstructions);
  });

  it('flags a warning when a resource crosses the warn threshold', () => {
    const usage: GasUsage = { ...SAFE_USAGE, cpuInstructions: 85_000_000 };
    const estimate = estimateGas('tally_votes', usage);
    expect(estimate.severity).toBe('warning');
    expect(estimate.withinLimits).toBe(true);
    expect(estimate.violations).toHaveLength(0);
  });

  it('flags critical and records a violation when a limit is exceeded', () => {
    const usage: GasUsage = { ...SAFE_USAGE, cpuInstructions: 120_000_000 };
    const estimate = estimateGas('tally_votes', usage);
    expect(estimate.severity).toBe('critical');
    expect(estimate.withinLimits).toBe(false);
    expect(estimate.violations).toEqual([
      {
        resource: 'cpuInstructions',
        used: 120_000_000,
        limit: DEFAULT_GAS_LIMITS.cpuInstructions,
        utilization: 1.2,
      },
    ]);
  });

  it('treats usage at exactly the limit as a violation', () => {
    const usage: GasUsage = { ...SAFE_USAGE, ledgerWriteEntries: DEFAULT_GAS_LIMITS.ledgerWriteEntries };
    const estimate = estimateGas('register_task', usage);
    expect(estimate.severity).toBe('critical');
    expect(estimate.violations[0].resource).toBe('ledgerWriteEntries');
  });

  it('honours custom limits and warn threshold', () => {
    const usage: GasUsage = { ...SAFE_USAGE, cpuInstructions: 60 };
    const estimate = estimateGas('cast_vote', usage, {
      limits: { ...DEFAULT_GAS_LIMITS, cpuInstructions: 100 },
      warnThreshold: 0.5,
    });
    expect(estimate.severity).toBe('warning');
  });

  it('marks any positive usage as critical when its limit is zero', () => {
    const estimate = estimateGas('cast_vote', SAFE_USAGE, {
      limits: { ...DEFAULT_GAS_LIMITS, ledgerWriteEntries: 0 },
    });
    expect(estimate.severity).toBe('critical');
    expect(estimate.utilization.ledgerWriteEntries).toBe(Infinity);
  });
});

describe('estimateGasFromSimulation', () => {
  it('estimates directly from a successful simulation', () => {
    const estimate = estimateGasFromSimulation(
      'cast_vote',
      makeSimulation({
        cpuInsns: 12_500_000,
        memBytes: 524_288,
        readBytes: 1_000,
        writeBytes: 500,
        minResourceFee: 1_000,
        readEntries: 4,
        writeEntries: 1,
      }),
    );
    expect(estimate.severity).toBe('ok');
    expect(estimate.usage.cpuInstructions).toBe(12_500_000);
  });

  it('throws GasMonitorError on a failed simulation', () => {
    expect(() => estimateGasFromSimulation('cast_vote', makeErrorSimulation('boom'))).toThrow(GasMonitorError);
    try {
      estimateGasFromSimulation('cast_vote', makeErrorSimulation('boom'));
    } catch (error) {
      expect(error).toBeInstanceOf(GasMonitorError);
      expect((error as GasMonitorError).code).toBe('SIMULATION_FAILED');
    }
  });
});

describe('simulateGas', () => {
  it('simulates then estimates', async () => {
    const simulator: TransactionSimulator = {
      simulateTransaction: jest.fn().mockResolvedValue(
        makeSimulation({ cpuInsns: 1, memBytes: 1, readBytes: 1, writeBytes: 1, minResourceFee: 1 }),
      ),
    };
    const estimate = await simulateGas(simulator, 'cast_vote', {} as StellarSdk.Transaction);
    expect(estimate.severity).toBe('ok');
    expect(simulator.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('wraps simulator failures in GasMonitorError', async () => {
    const simulator: TransactionSimulator = {
      simulateTransaction: jest.fn().mockRejectedValue(new Error('network down')),
    };
    await expect(simulateGas(simulator, 'cast_vote', {} as StellarSdk.Transaction)).rejects.toBeInstanceOf(
      GasMonitorError,
    );
  });
});

describe('formatGas / formatGasLogMessage', () => {
  it('formats large numbers compactly', () => {
    expect(formatGas(120_000_000)).toBe('120M');
    expect(formatGas(1_500)).toBe('1.5K');
  });

  it('summarises an estimate with severity and per-resource ratios', () => {
    const estimate = estimateGas('tally_votes', { ...SAFE_USAGE, cpuInstructions: 120_000_000 });
    const message = formatGasLogMessage(estimate);
    expect(message).toContain('gas[tally_votes] critical');
    expect(message).toContain('cpuInstructions=120M/100M(120%)');
  });
});

function makeSpyLogger(): { logger: GasLogger; calls: { level: keyof GasLogger; record: GasLogRecord }[] } {
  const calls: { level: keyof GasLogger; record: GasLogRecord }[] = [];
  const logger: GasLogger = {
    info: (_m, record) => calls.push({ level: 'info', record }),
    warn: (_m, record) => calls.push({ level: 'warn', record }),
    error: (_m, record) => calls.push({ level: 'error', record }),
  };
  return { logger, calls };
}

describe('logGasEstimate', () => {
  it('logs at error level for critical estimates and returns a timestamped record', () => {
    const { logger, calls } = makeSpyLogger();
    const estimate = estimateGas('tally_votes', { ...SAFE_USAGE, cpuInstructions: 120_000_000 });
    const record = logGasEstimate(estimate, logger);

    expect(calls).toHaveLength(1);
    expect(calls[0].level).toBe('error');
    expect(record.withinLimits).toBe(false);
    expect(record.severity).toBe('critical');
    expect(typeof record.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(record.timestamp))).toBe(false);
  });

  it('logs at info level for ok estimates and warn level for warnings', () => {
    const { logger, calls } = makeSpyLogger();
    logGasEstimate(estimateGas('cast_vote', SAFE_USAGE), logger);
    logGasEstimate(estimateGas('cast_vote', { ...SAFE_USAGE, cpuInstructions: 85_000_000 }), logger);
    expect(calls.map((c) => c.level)).toEqual(['info', 'warn']);
  });
});

describe('GasUsageMonitor', () => {
  it('records, logs, and retains estimates', () => {
    const { logger, calls } = makeSpyLogger();
    const monitor = new GasUsageMonitor({ logger });

    monitor.record('cast_vote', makeSimulation({ cpuInsns: 1, memBytes: 1, readBytes: 1, writeBytes: 1, minResourceFee: 1 }));
    monitor.record(
      'tally_votes',
      makeSimulation({ cpuInsns: 120_000_000, memBytes: 1, readBytes: 1, writeBytes: 1, minResourceFee: 1 }),
    );

    expect(calls.map((c) => c.level)).toEqual(['info', 'error']);
    expect(monitor.history()).toHaveLength(2);
    expect(monitor.violations()).toHaveLength(1);
    expect(monitor.violations()[0].functionName).toBe('tally_votes');
  });

  it('monitors via a simulator and applies configured limits', async () => {
    const { logger, calls } = makeSpyLogger();
    const monitor = new GasUsageMonitor({ logger, limits: { ...DEFAULT_GAS_LIMITS, cpuInstructions: 10 } });
    const simulator: TransactionSimulator = {
      simulateTransaction: jest.fn().mockResolvedValue(
        makeSimulation({ cpuInsns: 50, memBytes: 1, readBytes: 1, writeBytes: 1, minResourceFee: 1 }),
      ),
    };

    const estimate = await monitor.monitor(simulator, 'cast_vote', {} as StellarSdk.Transaction);
    expect(estimate.severity).toBe('critical');
    expect(calls[0].level).toBe('error');
  });

  it('clears retained history', () => {
    const monitor = new GasUsageMonitor({ logger: makeSpyLogger().logger });
    monitor.record('cast_vote', makeSimulation({ cpuInsns: 1, memBytes: 1, readBytes: 1, writeBytes: 1, minResourceFee: 1 }));
    expect(monitor.history()).toHaveLength(1);
    monitor.clear();
    expect(monitor.history()).toHaveLength(0);
  });

  it('caps retained history at maxHistory, dropping the oldest records', () => {
    const monitor = new GasUsageMonitor({ logger: makeSpyLogger().logger, maxHistory: 2 });
    const sim = makeSimulation({ cpuInsns: 1, memBytes: 1, readBytes: 1, writeBytes: 1, minResourceFee: 1 });

    monitor.record('first', sim);
    monitor.record('second', sim);
    monitor.record('third', sim);

    expect(monitor.history()).toHaveLength(2);
    expect(monitor.history().map((record) => record.functionName)).toEqual(['second', 'third']);
  });

  it('keeps history unbounded when maxHistory is non-positive', () => {
    const monitor = new GasUsageMonitor({ logger: makeSpyLogger().logger, maxHistory: 0 });
    const sim = makeSimulation({ cpuInsns: 1, memBytes: 1, readBytes: 1, writeBytes: 1, minResourceFee: 1 });

    for (let i = 0; i < 5; i += 1) {
      monitor.record(`call_${i}`, sim);
    }

    expect(monitor.history()).toHaveLength(5);
  });
});

describe('GAS_RESOURCES coverage', () => {
  it('defines a default limit for every tracked resource', () => {
    for (const resource of GAS_RESOURCES) {
      expect(DEFAULT_GAS_LIMITS[resource]).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Additional edge-case and boundary tests
// ---------------------------------------------------------------------------

describe('formatGas — edge cases', () => {
  it('formats zero', () => {
    // Intl compact should render 0 as "0"
    expect(formatGas(0)).toBe('0');
  });

  it('formats values below 1 000 without a suffix', () => {
    expect(formatGas(999)).toBe('999');
    expect(formatGas(1)).toBe('1');
  });

  it('formats negative values', () => {
    // Negative gas is nonsensical but the formatter should not throw
    expect(() => formatGas(-1)).not.toThrow();
  });
});

describe('estimateGas — additional boundary conditions', () => {
  it('reports ok when every resource is zero', () => {
    const zeroUsage: GasUsage = {
      cpuInstructions: 0,
      memoryBytes: 0,
      ledgerReadBytes: 0,
      ledgerWriteBytes: 0,
      ledgerReadEntries: 0,
      ledgerWriteEntries: 0,
      resourceFeeStroops: 0,
    };
    const estimate = estimateGas('idle_call', zeroUsage);
    expect(estimate.severity).toBe('ok');
    expect(estimate.withinLimits).toBe(true);
    expect(estimate.violations).toHaveLength(0);
  });

  it('produces violations for every resource that exceeds its limit simultaneously', () => {
    const overLimitUsage: GasUsage = {
      cpuInstructions: DEFAULT_GAS_LIMITS.cpuInstructions + 1,
      memoryBytes: DEFAULT_GAS_LIMITS.memoryBytes + 1,
      ledgerReadBytes: DEFAULT_GAS_LIMITS.ledgerReadBytes + 1,
      ledgerWriteBytes: DEFAULT_GAS_LIMITS.ledgerWriteBytes + 1,
      ledgerReadEntries: DEFAULT_GAS_LIMITS.ledgerReadEntries + 1,
      ledgerWriteEntries: DEFAULT_GAS_LIMITS.ledgerWriteEntries + 1,
      resourceFeeStroops: DEFAULT_GAS_LIMITS.resourceFeeStroops + 1,
    };
    const estimate = estimateGas('heavy_call', overLimitUsage);
    expect(estimate.severity).toBe('critical');
    expect(estimate.withinLimits).toBe(false);
    // Every resource is over-limit → one violation per resource
    expect(estimate.violations).toHaveLength(GAS_RESOURCES.length);
    const violatedResources = estimate.violations.map((v) => v.resource);
    for (const resource of GAS_RESOURCES) {
      expect(violatedResources).toContain(resource);
    }
  });

  it('severity stays critical even when some resources are only at warning level', () => {
    // cpuInstructions is critical (>= limit), memoryBytes is at warning level
    const mixedUsage: GasUsage = {
      ...SAFE_USAGE,
      cpuInstructions: DEFAULT_GAS_LIMITS.cpuInstructions + 1, // critical
      memoryBytes: Math.round(DEFAULT_GAS_LIMITS.memoryBytes * 0.85), // warning
    };
    const estimate = estimateGas('mixed_call', mixedUsage);
    expect(estimate.severity).toBe('critical');
    expect(estimate.withinLimits).toBe(false);
    const violationResources = estimate.violations.map((v) => v.resource);
    expect(violationResources).toContain('cpuInstructions');
    expect(violationResources).not.toContain('memoryBytes');
  });
});

describe('estimateGas — warnThreshold clamping', () => {
  it('clamps warnThreshold below 0 to 0, flagging any usage as warning', () => {
    // threshold clamped to 0 — any ratio > 0 hits the warning branch
    const estimate = estimateGas('cast_vote', SAFE_USAGE, { warnThreshold: -1 });
    // SAFE_USAGE has non-zero values so at least one resource ratio > 0
    expect(['warning', 'critical']).toContain(estimate.severity);
  });

  it('clamps warnThreshold above 1 to 1, so no warning is raised below the limit', () => {
    // threshold clamped to 1 — the only way to trigger warning/critical is to meet/exceed the limit
    const estimate = estimateGas('cast_vote', SAFE_USAGE, { warnThreshold: 2 });
    // SAFE_USAGE is well under all limits, so nothing should fire
    expect(estimate.severity).toBe('ok');
  });

  it('falls back to DEFAULT_WARN_THRESHOLD when warnThreshold is NaN', () => {
    // NaN is non-finite → clampFraction returns DEFAULT_WARN_THRESHOLD (0.8)
    const estimate = estimateGas('cast_vote', SAFE_USAGE, { warnThreshold: NaN });
    expect(estimate.severity).toBe('ok');
  });

  it('falls back to DEFAULT_WARN_THRESHOLD when warnThreshold is Infinity', () => {
    const estimate = estimateGas('cast_vote', SAFE_USAGE, { warnThreshold: Infinity });
    // clamped to 1 at the boundary, safe usage should remain ok
    expect(estimate.severity).toBe('ok');
  });
});

describe('formatGasLogMessage — completeness', () => {
  it('includes all 7 resources in the log message', () => {
    const estimate = estimateGas('all_resources', SAFE_USAGE);
    const message = formatGasLogMessage(estimate);
    for (const resource of GAS_RESOURCES) {
      expect(message).toContain(resource);
    }
  });
});

describe('logGasEstimate — default logger', () => {
  it('uses consoleGasLogger when no logger is provided and does not throw', () => {
    const estimate = estimateGas('cast_vote', SAFE_USAGE);
    // should not throw when falling back to consoleGasLogger
    expect(() => logGasEstimate(estimate)).not.toThrow();
  });

  it('returns a record with correct fields when using the default logger', () => {
    const estimate = estimateGas('cast_vote', SAFE_USAGE);
    const record = logGasEstimate(estimate);
    expect(record.functionName).toBe('cast_vote');
    expect(record.severity).toBe('ok');
    expect(record.withinLimits).toBe(true);
    expect(typeof record.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(record.timestamp))).toBe(false);
  });
});

describe('GasUsageMonitor.estimate()', () => {
  it('returns a GasEstimate without logging or retaining a record', () => {
    const { logger, calls } = makeSpyLogger();
    const monitor = new GasUsageMonitor({ logger });
    const sim = makeSimulation({ cpuInsns: 1_000, memBytes: 512, readBytes: 100, writeBytes: 50, minResourceFee: 200 });

    const estimate = monitor.estimate('probe_call', sim);

    expect(estimate.functionName).toBe('probe_call');
    expect(estimate.severity).toBe('ok');
    // estimate() must NOT log
    expect(calls).toHaveLength(0);
    // estimate() must NOT retain anything
    expect(monitor.history()).toHaveLength(0);
  });

  it('throws GasMonitorError when the simulation failed', () => {
    const monitor = new GasUsageMonitor();
    expect(() => monitor.estimate('bad_call', makeErrorSimulation('out of gas'))).toThrow(GasMonitorError);
  });
});

describe('GasUsageMonitor.violations() — empty when all calls are within limits', () => {
  it('returns an empty array when every recorded call is within limits', () => {
    const monitor = new GasUsageMonitor({ logger: makeSpyLogger().logger });
    const sim = makeSimulation({ cpuInsns: 1, memBytes: 1, readBytes: 1, writeBytes: 1, minResourceFee: 1 });

    monitor.record('call_a', sim);
    monitor.record('call_b', sim);
    monitor.record('call_c', sim);

    expect(monitor.violations()).toHaveLength(0);
  });
});
