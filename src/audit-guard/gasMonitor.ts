import * as StellarSdk from '@stellar/stellar-sdk';

/**
 * Gas-usage monitor for Vero contract calls.
 *
 * Soroban meters every contract invocation against a set of per-transaction
 * resource ceilings ("gas"). A call that exceeds any ceiling is rejected by the
 * network, so an attacker can craft inputs that blow past a limit to grief the
 * relayer (a gas-exhaustion DoS). This module predicts the gas cost of a call by
 * reading a Soroban simulation, compares it against configurable limits, and
 * logs the result so over-budget calls are caught before they are submitted.
 */

/** The metered Soroban resources that make up a contract call's "gas" cost. */
export const GAS_RESOURCES = [
  'cpuInstructions',
  'memoryBytes',
  'ledgerReadBytes',
  'ledgerWriteBytes',
  'ledgerReadEntries',
  'ledgerWriteEntries',
  'resourceFeeStroops',
] as const;

export type GasResource = (typeof GAS_RESOURCES)[number];

/** Measured resource consumption of a single contract call. */
export type GasUsage = Record<GasResource, number>;

/** Per-transaction ceilings each resource is checked against. */
export type GasLimits = Record<GasResource, number>;

/**
 * Default per-transaction ceilings, mirroring Soroban network resource limits.
 * `resourceFeeStroops` is a spend guard (~10 XLM) rather than a protocol limit;
 * all values are overridable so callers can match the live network config.
 */
export const DEFAULT_GAS_LIMITS: GasLimits = {
  cpuInstructions: 100_000_000,
  memoryBytes: 41_943_040,
  ledgerReadBytes: 200_000,
  ledgerWriteBytes: 132_096,
  ledgerReadEntries: 40,
  ledgerWriteEntries: 25,
  resourceFeeStroops: 100_000_000,
};

/** Fraction of a limit at which a resource is flagged as a warning. */
export const DEFAULT_WARN_THRESHOLD = 0.8;

export type GasSeverity = 'ok' | 'warning' | 'critical';

/** A resource whose predicted usage meets or exceeds its limit. */
export interface GasLimitViolation {
  resource: GasResource;
  used: number;
  limit: number;
  /** `used / limit`; values >= 1 mean the call would be rejected on-chain. */
  utilization: number;
}

/** Prediction of a call's gas cost relative to the configured limits. */
export interface GasEstimate {
  functionName: string;
  usage: GasUsage;
  limits: GasLimits;
  /** `used / limit` per resource. */
  utilization: Record<GasResource, number>;
  severity: GasSeverity;
  withinLimits: boolean;
  violations: GasLimitViolation[];
}

export type GasMonitorErrorCode = 'SIMULATION_FAILED' | 'INVALID_SIMULATION';

export class GasMonitorError extends Error {
  readonly code: GasMonitorErrorCode;
  readonly cause?: unknown;

  constructor(code: GasMonitorErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'GasMonitorError';
    this.code = code;
    this.cause = cause;
  }
}

type SuccessfulSimulation =
  | StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse
  | StellarSdk.SorobanRpc.Api.SimulateTransactionRestoreResponse;

/** Coerce SDK string/Int64/number resource values to a safe non-negative number. */
function safeNumber(value: string | number | bigint | { toString(): string } | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WARN_THRESHOLD;
  return Math.min(1, Math.max(0, value));
}

/** Compact human-readable resource value (e.g. `120000000` -> `"120M"`). */
export function formatGas(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Read the metered resource usage out of a successful Soroban simulation. */
export function extractGasUsage(simulation: SuccessfulSimulation): GasUsage {
  const data = simulation.transactionData.build();
  const resources = data.resources();
  const footprint = resources.footprint();

  return {
    cpuInstructions: safeNumber(simulation.cost?.cpuInsns) || safeNumber(resources.instructions()),
    memoryBytes: safeNumber(simulation.cost?.memBytes),
    ledgerReadBytes: safeNumber(resources.readBytes()),
    ledgerWriteBytes: safeNumber(resources.writeBytes()),
    ledgerReadEntries: footprint.readOnly().length,
    ledgerWriteEntries: footprint.readWrite().length,
    resourceFeeStroops: safeNumber(simulation.minResourceFee),
  };
}

export interface EstimateGasOptions {
  limits?: GasLimits;
  /** Fraction of a limit at which a resource is flagged `warning` (default 0.8). */
  warnThreshold?: number;
}

/** Compare measured usage against limits and classify the call's severity. */
export function estimateGas(
  functionName: string,
  usage: GasUsage,
  options: EstimateGasOptions = {},
): GasEstimate {
  const limits = options.limits ?? DEFAULT_GAS_LIMITS;
  const warnThreshold = clampFraction(options.warnThreshold ?? DEFAULT_WARN_THRESHOLD);

  const utilization = {} as Record<GasResource, number>;
  const violations: GasLimitViolation[] = [];
  let severity: GasSeverity = 'ok';

  for (const resource of GAS_RESOURCES) {
    const used = usage[resource] ?? 0;
    const limit = limits[resource] ?? 0;
    const ratio = limit > 0 ? used / limit : used > 0 ? Infinity : 0;
    utilization[resource] = ratio;

    if (ratio >= 1) {
      violations.push({ resource, used, limit, utilization: ratio });
      severity = 'critical';
    } else if (ratio >= warnThreshold && severity !== 'critical') {
      severity = 'warning';
    }
  }

  return {
    functionName,
    usage,
    limits,
    utilization,
    severity,
    withinLimits: violations.length === 0,
    violations,
  };
}

/** Predict a call's gas cost directly from its Soroban simulation response. */
export function estimateGasFromSimulation(
  functionName: string,
  simulation: StellarSdk.SorobanRpc.Api.SimulateTransactionResponse,
  options: EstimateGasOptions = {},
): GasEstimate {
  if (StellarSdk.SorobanRpc.Api.isSimulationError(simulation)) {
    throw new GasMonitorError(
      'SIMULATION_FAILED',
      `Cannot estimate gas for "${functionName}": simulation failed: ${simulation.error}`,
    );
  }
  return estimateGas(functionName, extractGasUsage(simulation), options);
}

/** Minimal Soroban RPC surface needed to simulate a transaction. */
export interface TransactionSimulator {
  simulateTransaction(
    transaction: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction,
  ): Promise<StellarSdk.SorobanRpc.Api.SimulateTransactionResponse>;
}

/** Simulate a transaction and estimate its gas cost in one step. */
export async function simulateGas(
  simulator: TransactionSimulator,
  functionName: string,
  transaction: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction,
  options: EstimateGasOptions = {},
): Promise<GasEstimate> {
  let simulation: StellarSdk.SorobanRpc.Api.SimulateTransactionResponse;
  try {
    simulation = await simulator.simulateTransaction(transaction);
  } catch (error) {
    throw new GasMonitorError('SIMULATION_FAILED', `Soroban simulation failed for "${functionName}".`, error);
  }
  return estimateGasFromSimulation(functionName, simulation, options);
}

export interface GasLogRecord {
  functionName: string;
  severity: GasSeverity;
  withinLimits: boolean;
  usage: GasUsage;
  limits: GasLimits;
  utilization: Record<GasResource, number>;
  violations: GasLimitViolation[];
  timestamp: string;
}

export interface GasLogger {
  info(message: string, record: GasLogRecord): void;
  warn(message: string, record: GasLogRecord): void;
  error(message: string, record: GasLogRecord): void;
}

export const consoleGasLogger: GasLogger = {
  info: (message, record) => console.info(message, record),
  warn: (message, record) => console.warn(message, record),
  error: (message, record) => console.error(message, record),
};

/** One-line summary of a gas estimate, e.g. `gas[cast_vote] critical cpuInstructions=120M/100M(120%)`. */
export function formatGasLogMessage(estimate: GasEstimate): string {
  const parts = GAS_RESOURCES.map((resource) => {
    const used = estimate.usage[resource] ?? 0;
    const limit = estimate.limits[resource] ?? 0;
    const percent = Math.round((estimate.utilization[resource] ?? 0) * 100);
    return `${resource}=${formatGas(used)}/${formatGas(limit)}(${percent}%)`;
  });
  return `gas[${estimate.functionName}] ${estimate.severity} ${parts.join(' ')}`;
}

/** Log a gas estimate at a level matching its severity and return the log record. */
export function logGasEstimate(estimate: GasEstimate, logger: GasLogger = consoleGasLogger): GasLogRecord {
  const record: GasLogRecord = {
    functionName: estimate.functionName,
    severity: estimate.severity,
    withinLimits: estimate.withinLimits,
    usage: estimate.usage,
    limits: estimate.limits,
    utilization: estimate.utilization,
    violations: estimate.violations,
    timestamp: new Date().toISOString(),
  };

  const message = formatGasLogMessage(estimate);
  if (estimate.severity === 'critical') {
    logger.error(message, record);
  } else if (estimate.severity === 'warning') {
    logger.warn(message, record);
  } else {
    logger.info(message, record);
  }
  return record;
}

/** Default cap on retained log records, bounding memory in long-running processes. */
export const DEFAULT_MAX_HISTORY = 1000;

export interface GasUsageMonitorOptions {
  limits?: GasLimits;
  warnThreshold?: number;
  logger?: GasLogger;
  /**
   * Maximum number of log records to retain; once exceeded the oldest records
   * are dropped. A value `<= 0` keeps history unbounded. Defaults to
   * `DEFAULT_MAX_HISTORY`.
   */
  maxHistory?: number;
}

/**
 * Stateful gas monitor that estimates, logs, and remembers contract-call gas
 * usage so the relayer/dashboard can surface over-budget calls and guard against
 * gas-exhaustion DoS.
 */
export class GasUsageMonitor {
  private readonly limits: GasLimits;
  private readonly warnThreshold: number;
  private readonly logger: GasLogger;
  private readonly maxHistory: number;
  private readonly records: GasLogRecord[] = [];

  constructor(options: GasUsageMonitorOptions = {}) {
    this.limits = options.limits ?? DEFAULT_GAS_LIMITS;
    this.warnThreshold = clampFraction(options.warnThreshold ?? DEFAULT_WARN_THRESHOLD);
    this.logger = options.logger ?? consoleGasLogger;
    this.maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY;
  }

  /** Append a record, dropping the oldest entries once `maxHistory` is exceeded. */
  private retain(record: GasLogRecord): void {
    this.records.push(record);
    if (this.maxHistory > 0 && this.records.length > this.maxHistory) {
      this.records.splice(0, this.records.length - this.maxHistory);
    }
  }

  private get options(): EstimateGasOptions {
    return { limits: this.limits, warnThreshold: this.warnThreshold };
  }

  /** Estimate a call's gas from a simulation without logging it. */
  estimate(
    functionName: string,
    simulation: StellarSdk.SorobanRpc.Api.SimulateTransactionResponse,
  ): GasEstimate {
    return estimateGasFromSimulation(functionName, simulation, this.options);
  }

  /** Estimate from a simulation, log the result, and retain the record. */
  record(
    functionName: string,
    simulation: StellarSdk.SorobanRpc.Api.SimulateTransactionResponse,
  ): GasEstimate {
    const estimate = this.estimate(functionName, simulation);
    this.retain(logGasEstimate(estimate, this.logger));
    return estimate;
  }

  /** Simulate a transaction, estimate its gas, log it, and retain the record. */
  async monitor(
    simulator: TransactionSimulator,
    functionName: string,
    transaction: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction,
  ): Promise<GasEstimate> {
    const estimate = await simulateGas(simulator, functionName, transaction, this.options);
    this.retain(logGasEstimate(estimate, this.logger));
    return estimate;
  }

  /** All retained log records, oldest first. */
  history(): readonly GasLogRecord[] {
    return [...this.records];
  }

  /** Records for calls that exceeded at least one limit. */
  violations(): GasLogRecord[] {
    return this.records.filter((record) => !record.withinLimits);
  }

  clear(): void {
    this.records.length = 0;
  }
}
