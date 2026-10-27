import * as StellarSdk from '@stellar/stellar-sdk';
import { getWalletProvider, type WalletProviderId } from '../lib/wallets';
import { defaultNetworkConfig, DEFAULT_HORIZON_URL, CONSENSUS_THRESHOLD_KEY } from './rpc';

export type VoteChoice = 'approve' | 'reject';

export function buildVoteDataKey(prId: number | string, choice: VoteChoice): string {
  return `vote_${String(prId).trim()}_${choice}`;
}

/**
 * Build, Freighter-sign, and submit a vote transaction.
 *
 * @param prId GitHub PR number registered by the Vero Relayer
 * @param publicKey Stellar public key from WalletContext
 * @param horizonUrl Optional Horizon URL (defaults to env or testnet), or VoteChoice shorthand
 * @param networkPassphrase Optional network passphrase (defaults to testnet)
 * @param providerId Wallet provider ID (defaults to 'freighter')
 * @param choice Vote choice ('approve' | 'reject', defaults to 'approve')
 * @param weight Vote weight integer (defaults to 1)
 * @returns Submitted transaction hash
 */
export async function castVote(
  prId: number,
  publicKey: string,
  horizonUrl: string | VoteChoice = defaultNetworkConfig.horizonUrl,
  networkPassphrase: string = defaultNetworkConfig.networkPassphrase,
  providerId: WalletProviderId = 'freighter',
  choice: VoteChoice = 'approve',
  weight: number = 1
): Promise<string> {
  const isShorthandChoice = horizonUrl === 'approve' || horizonUrl === 'reject';
  const resolvedChoice: VoteChoice = isShorthandChoice ? horizonUrl : choice;
  const resolvedHorizonUrl = isShorthandChoice
    ? defaultNetworkConfig.horizonUrl
    : horizonUrl;
  const normalizedWeight =
    Number.isFinite(weight) && weight > 0 ? Math.floor(weight) : 1;

  const server = new StellarSdk.Horizon.Server(resolvedHorizonUrl);
  const account = await server.loadAccount(publicKey);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.manageData({
        name: buildVoteDataKey(prId, resolvedChoice),
        value: String(normalizedWeight),
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
  networkPassphrase: string = defaultNetworkConfig.networkPassphrase,
  guardianPublicKeys?: string[]
): Promise<{ currentWeight: number; threshold: number; approveWeight: number; rejectWeight: number }> {
  const server = new StellarSdk.Horizon.Server(horizonUrl);

  if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
    throw new Error('Invalid or missing taskId');
  }

  const triagedId = taskId.trim();

  // Load the relayer account and any configured guardian accounts that store vote data entries
  const relayerPublicKey = process.env.NEXT_PUBLIC_RELAYER_PUBLIC_KEY;
  const envGuardianKeys = (process.env.NEXT_PUBLIC_GUARDIAN_PUBLIC_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const accountIds = Array.from(
    new Set([
      ...(relayerPublicKey ? [relayerPublicKey] : []),
      ...(guardianPublicKeys ?? []),
      ...envGuardianKeys,
    ])
  );

  if (accountIds.length === 0) {
    throw new Error('Relayer public key not configured (NEXT_PUBLIC_RELAYER_PUBLIC_KEY)');
  }

  const accounts: any[] = [];
  for (const accountId of accountIds) {
    try {
      const acc = await server.loadAccount(accountId);
      accounts.push(acc);
    } catch (err) {
      if (accountId === relayerPublicKey && accounts.length === 0 && accountIds.length === 1) {
        throw new Error(
          `Failed to load relayer account for consensus data: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }
  }

  if (accounts.length === 0) {
    return { currentWeight: 0, threshold: 51, approveWeight: 0, rejectWeight: 0 };
  }

  // Decode base64 Stellar data values
  const decodeBase64 = (value: string): string => {
    if (typeof atob === 'function') return atob(value);
    return Buffer.from(value, 'base64').toString();
  };

  let threshold = 51;
  let approveWeight = 0;
  let rejectWeight = 0;

  const approveKey = buildVoteDataKey(triagedId, 'approve');
  const rejectKey = buildVoteDataKey(triagedId, 'reject');

  for (const account of accounts) {
    const dataAttr = (account as any)?.data_attr as Record<string, string> | undefined;
    if (!dataAttr || typeof dataAttr !== 'object') {
      continue;
    }

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

    const approveRaw = dataAttr[approveKey];
    if (approveRaw) {
      try {
        approveWeight += parseInt(decodeBase64(approveRaw).trim(), 10) || 0;
      } catch {
        // Ignore malformed entry
      }
    }

    const rejectRaw = dataAttr[rejectKey];
    if (rejectRaw) {
      try {
        rejectWeight += parseInt(decodeBase64(rejectRaw).trim(), 10) || 0;
      } catch {
        // Ignore malformed entry
      }
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
