import * as StellarSdk from '@stellar/stellar-sdk';
import { getWalletProvider, type WalletProviderId } from '../lib/wallets';
import { defaultNetworkConfig, DEFAULT_HORIZON_URL, CONSENSUS_THRESHOLD_KEY } from './rpc';

/**
 * Build, Freighter-sign, and submit a vote transaction.
 *
 * @param prId GitHub PR number registered by the Vero Relayer
 * @param publicKey Stellar public key from WalletContext
 * @param horizonUrl Optional Horizon URL (defaults to env or testnet)
 * @param networkPassphrase Optional network passphrase (defaults to testnet)
 * @returns Submitted transaction hash
 */
export async function castVote(
  prId: number,
  publicKey: string,
  horizonUrl: string = defaultNetworkConfig.horizonUrl,
  networkPassphrase: string = defaultNetworkConfig.networkPassphrase,
  providerId: WalletProviderId = 'freighter'
): Promise<string> {
  const server = new StellarSdk.Horizon.Server(horizonUrl);
  const account = await server.loadAccount(publicKey);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.manageData({ name: `vote_${prId}`, value: 'approve' })
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
): Promise<{ currentWeight: number; threshold: number; approveWeight: number; rejectWeight: number }> {
  const server = new StellarSdk.Horizon.Server(horizonUrl);

  if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
    throw new Error('Invalid or missing taskId');
  }

  const triagedId = taskId.trim();

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
  if (!dataAttr || typeof dataAttr !== 'object') {
    return { currentWeight: 0, threshold: 51, approveWeight: 0, rejectWeight: 0 };
  }

  // Decode base64 Stellar data values
  const decodeBase64 = (value: string): string => {
    if (typeof atob === 'function') return atob(value);
    return Buffer.from(value, 'base64').toString();
  };

  // Read consensus threshold from data entries (or use default)
  let threshold = 51;
  const thresholdRaw = dataAttr[CONSENSUS_THRESHOLD_KEY];
  if (thresholdRaw) {
    try {
      const parsed = parseInt(decodeBase64(thresholdRaw).trim(), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        threshold = parsed;
      }
    } catch {
      // Fall back to default threshold
    }
  }

  // Read approve votes for this task
  const approveKey = `vote_${triagedId}_approve`;
  const approveRaw = dataAttr[approveKey];
  let approveWeight = 0;
  if (approveRaw) {
    try {
      approveWeight = parseInt(decodeBase64(approveRaw).trim(), 10) || 0;
    } catch {
      approveWeight = 0;
    }
  }

  // Read reject votes for this task
  const rejectKey = `vote_${triagedId}_reject`;
  const rejectRaw = dataAttr[rejectKey];
  let rejectWeight = 0;
  if (rejectRaw) {
    try {
      rejectWeight = parseInt(decodeBase64(rejectRaw).trim(), 10) || 0;
    } catch {
      rejectWeight = 0;
    }
  }

  const currentWeight = approveWeight + rejectWeight;

  return {
    currentWeight,
    threshold,
    approveWeight,
    rejectWeight,
  };
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

  const preparedTx = StellarSdk.SorobanRpc.assembleTransaction(rawTx, simulation) as StellarSdk.TransactionBuilder;
  const builtTx = preparedTx.build();

  const provider = getWalletProvider(providerId);
  if (!provider.signTransaction) {
    throw new Error(`Wallet provider ${providerId} does not support signing`);
  }

  const signedXdr = await provider.signTransaction(builtTx.toXDR(), { networkPassphrase });

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
