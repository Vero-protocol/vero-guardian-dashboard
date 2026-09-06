import * as StellarSdk from '@stellar/stellar-sdk';
import { getWalletProvider, type WalletProviderId } from '../lib/wallets';
import { defaultNetworkConfig, DEFAULT_HORIZON_URL, CONSENSUS_THRESHOLD_KEY } from './rpc';

export type VoteChoice = 'approve' | 'reject';

export interface ConsensusData {
  currentWeight: number;
  threshold: number;
  approveWeight: number;
  rejectWeight: number;
}

/**
 * Build, Freighter-sign, and submit a vote transaction.
 *
 * The vote is recorded as a Horizon `manageData` entry on the voter's own
 * account under the key `vote_<prId>_<choice>` with a numeric weight value.
 * This matches the key shape `getConsensusProgress` expects when reading
 * consensus data.
 *
 * @param prId GitHub PR number registered by the Vero Relayer
 * @param publicKey Stellar public key from WalletContext
 * @param choice Vote direction — 'approve' or 'reject'
 * @param horizonUrl Optional Horizon URL (defaults to env or testnet)
 * @param networkPassphrase Optional network passphrase (defaults to testnet)
 * @param providerId Wallet provider to use for signing
 * @returns Submitted transaction hash
 */
export async function castVote(
  prId: number,
  publicKey: string,
  horizonUrl: string = defaultNetworkConfig.horizonUrl,
  networkPassphrase: string = defaultNetworkConfig.networkPassphrase,
  providerId: WalletProviderId = 'freighter',
  choice: VoteChoice = 'approve'
): Promise<string> {
  const server = new StellarSdk.Horizon.Server(horizonUrl);
  const account = await server.loadAccount(publicKey);

  if (choice !== 'approve' && choice !== 'reject') {
    throw new Error(`Invalid vote choice: ${choice}. Must be 'approve' or 'reject'.`);
  }

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.manageData({
        name: `vote_${prId}_${choice}`,
        value: String(1),
      })
    )
    .setTimeout(30)
    .build();

  const provider = getWalletProvider(providerId);
  if (!provider.signTransaction) {
    throw new Error(`Wallet provider ${providerId} does not support signing`);
  }

  const signedXdr = await provider.signTransaction(tx.toXDR(), { networkPassphrase });

  const signedTx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    networkPassphrase
  );

  const result = await server.submitTransaction(signedTx);
  return result.hash;
}

// Decode base64 Stellar data values in a way that works in both browser and Node.
function decodeBase64(value: string): string {
  if (typeof atob === 'function') return atob(value);
  return Buffer.from(value, 'base64').toString();
}

/**
 * Parse consensus weights out of a Horizon `data_attr` map.
 *
 * Exported so unit tests can feed it the exact `data_attr` shape that
 * `castVote` produces and assert the two sides agree on keys and values.
 */
export function parseConsensusData(
  dataAttr: Record<string, string> | undefined,
  taskId: string
): ConsensusData {
  const result: ConsensusData = {
    currentWeight: 0,
    threshold: 51,
    approveWeight: 0,
    rejectWeight: 0,
  };

  if (!dataAttr || typeof dataAttr !== 'object') {
    return result;
  }

  // Read consensus threshold from data entries (or use default)
  const thresholdRaw = dataAttr[CONSENSUS_THRESHOLD_KEY];
  if (thresholdRaw) {
    try {
      const parsed = parseInt(decodeBase64(thresholdRaw).trim(), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        result.threshold = parsed;
      }
    } catch {
      // Fall back to default threshold
    }
  }

  const triagedId = taskId.trim();

  // Read approve votes for this task
  const approveKey = `vote_${triagedId}_approve`;
  const approveRaw = dataAttr[approveKey];
  if (approveRaw) {
    try {
      result.approveWeight = parseInt(decodeBase64(approveRaw).trim(), 10) || 0;
    } catch {
      result.approveWeight = 0;
    }
  }

  // Read reject votes for this task
  const rejectKey = `vote_${triagedId}_reject`;
  const rejectRaw = dataAttr[rejectKey];
  if (rejectRaw) {
    try {
      result.rejectWeight = parseInt(decodeBase64(rejectRaw).trim(), 10) || 0;
    } catch {
      result.rejectWeight = 0;
    }
  }

  result.currentWeight = result.approveWeight + result.rejectWeight;
  return result;
}

/**
 * Fetch the current consensus progress for a given task from on-chain data.
 *
 * Reads vote weight entries from Horizon account data for the relayer account
 * associated with the task. Falls back to default threshold if the on-chain
 * `consensus_threshold` data entry is not found.
 *
 * @param taskId PR task ID to query consensus for
 * @param horizonUrl Optional Horizon URL (defaults to env or testnet)
 * @param networkPassphrase Optional network passphrase (defaults to testnet)
 * @returns ConsensusData with current weight, threshold, approve/reject breakdown
 */
export async function getConsensusProgress(
  taskId: string,
  horizonUrl: string = defaultNetworkConfig.horizonUrl,
  networkPassphrase: string = defaultNetworkConfig.networkPassphrase
): Promise<ConsensusData> {
  const server = new StellarSdk.Horizon.Server(horizonUrl);

  if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
    throw new Error('Invalid or missing taskId');
  }

  // Load the relayer account that stores the task/vote data entries
  const relayerPublicKey = process.env.NEXT_PUBLIC_RELAYER_PUBLIC_KEY;
  if (!relayerPublicKey) {
    throw new Error('Relayer public key not configured (NEXT_PUBLIC_RELAYER_PUBLIC_KEY)');
  }

  let account;
  try {
    account = await server.loadAccount(relayerPublicKey);
  } catch (err) {
    throw new Error(`Failed to load relayer account for consensus data: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  const dataAttr = (account as any).data_attr as Record<string, string> | undefined;
  return parseConsensusData(dataAttr, taskId);
}

/**
 * Invoke the `halt()` function on the Vero Soroban contract via Freighter.
 *
 * @param publicKey Stellar public key from WalletContext
 * @param contractId Soroban contract ID to halt
 * @param sorobanRpcUrl Optional Soroban RPC URL (defaults to env or testnet)
 * @param networkPassphrase Optional network passphrase (defaults to testnet)
 * @returns Submitted transaction hash
 */
export async function haltContract(
  publicKey: string,
  contractId: string,
  sorobanRpcUrl: string = defaultNetworkConfig.sorobanRpcUrl,
  networkPassphrase: string = defaultNetworkConfig.networkPassphrase,
  providerId: WalletProviderId = 'freighter'
): Promise<string> {
  const server = new StellarSdk.SorobanRpc.Server(sorobanRpcUrl);
  const account = await server.getAccount(publicKey);

  const contract = new StellarSdk.Contract(contractId);

  const rawTx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call("halt"))
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(rawTx);
  if ('error' in simulation) {
    throw new Error(simulation.error);
  }

  const preparedTx = StellarSdk.SorobanRpc.assembleTransaction(rawTx, simulation) as any;

  const provider = getWalletProvider(providerId);
  if (!provider.signTransaction) {
    throw new Error(`Wallet provider ${providerId} does not support signing`);
  }

  const signedXdr = await provider.signTransaction(preparedTx.toXDR(), { networkPassphrase });

  const signedTx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    networkPassphrase
  );

  const result = await server.sendTransaction(signedTx);
  if (result.status === 'ERROR') {
    throw new Error('Transaction submission failed with status ERROR');
  }

  return result.hash;
}
