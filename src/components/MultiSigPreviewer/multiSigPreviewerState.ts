import * as StellarSdk from '@stellar/stellar-sdk';

export interface MultiSigSigner {
  publicKey: string;
  weight: number;
  signed: boolean;
}

export interface ParsedProposal {
  fee: string;
  operationCount: number;
  operations: string[];
  sourceAccount: string;
  sequenceNumber: string;
}

export interface SimulationResult {
  success: boolean;
  fee: string;
  error?: string;
}

export interface SignerThreshold {
  required: number;
  current: number;
  met: boolean;
  signers: MultiSigSigner[];
}

export interface SorobanServer {
  simulateTransaction(tx: StellarSdk.Transaction): Promise<Record<string, unknown>>;
}

/** Decode an unsigned XDR envelope and extract proposal metadata. */
export function parseProposalXdr(xdr: string, networkPassphrase: string): ParsedProposal {
  let tx: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction;
  try {
    tx = StellarSdk.TransactionBuilder.fromXDR(xdr, networkPassphrase);
  } catch (err) {
    throw new Error(
      `Invalid XDR: ${err instanceof Error ? err.message : 'cannot parse transaction'}`,
    );
  }

  if (tx instanceof StellarSdk.FeeBumpTransaction) {
    throw new Error('Fee-bump transactions are not supported.');
  }

  return {
    fee: tx.fee,
    operationCount: tx.operations.length,
    operations: tx.operations.map((op) => op.type),
    sourceAccount: tx.source,
    sequenceNumber: tx.sequence,
  };
}

/** Calculate cumulative signed weight and whether it meets the threshold. */
export function computeThreshold(signers: MultiSigSigner[], required: number): SignerThreshold {
  const current = signers
    .filter((s) => s.signed)
    .reduce((sum, s) => sum + s.weight, 0);
  return { required, current, met: current >= required, signers };
}

/** Run a Soroban pre-flight simulation (read-only, no submission). */
export async function simulateProposal(
  xdr: string,
  networkPassphrase: string,
  sorobanRpcUrl: string,
  serverFactory?: (url: string) => SorobanServer,
): Promise<SimulationResult> {
  let tx: StellarSdk.Transaction;
  try {
    const parsed = StellarSdk.TransactionBuilder.fromXDR(xdr, networkPassphrase);
    if (parsed instanceof StellarSdk.FeeBumpTransaction) {
      throw new Error('Fee-bump transactions are not supported.');
    }
    tx = parsed;
  } catch (err) {
    return { success: false, fee: '0', error: err instanceof Error ? err.message : 'Invalid XDR' };
  }

  try {
    const server: SorobanServer = serverFactory
      ? serverFactory(sorobanRpcUrl)
      : new StellarSdk.SorobanRpc.Server(sorobanRpcUrl);
    const result = await server.simulateTransaction(tx);
    if (result['error']) {
      return { success: false, fee: tx.fee, error: String(result['error']) };
    }
    const fee = typeof result['minResourceFee'] === 'string'
      ? result['minResourceFee']
      : tx.fee;
    return { success: true, fee };
  } catch (err) {
    return {
      success: false,
      fee: tx.fee,
      error: err instanceof Error ? err.message : 'Simulation failed',
    };
  }
}
