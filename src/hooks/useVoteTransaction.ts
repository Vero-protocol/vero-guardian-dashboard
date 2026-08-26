'use client';

import { useState, useCallback } from 'react';
import { castVote } from '@/services/contractClient';
import { appendAuditEvent } from '@/utils/logger';

export type VoteTxStatus = 'idle' | 'pending' | 'success' | 'error';

export type VoteErrorKind = 'user_rejected' | 'network_error';

export interface VoteTxState {
  status: VoteTxStatus;
  txHash: string | null;
  errorKind: VoteErrorKind | null;
  errorMessage: string | null;
}

const IDLE_STATE: VoteTxState = {
  status: 'idle',
  txHash: null,
  errorKind: null,
  errorMessage: null,
};

/**
 * Detect whether a Freighter error message indicates the user deliberately
 * rejected (cancelled) the signing request.
 */
function isUserRejection(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('user declined') ||
    lower.includes('user rejected') ||
    lower.includes('user cancelled') ||
    lower.includes('transaction was rejected') ||
    lower.includes('request rejected')
  );
}

export interface UseVoteTransactionOptions {
  prId: number;
  publicKey: string;
  providerId?: import('@/lib/wallets').WalletProviderId;
  horizonUrl: string;
  networkPassphrase: string;
}

export interface UseVoteTransactionResult {
  state: VoteTxState;
  /** Runs the full vote flow and returns the final state. */
  submit: () => Promise<VoteTxState>;
  reset: () => void;
}

/**
 * Manages the full lifecycle of a guardian vote transaction:
 * PENDING while Freighter signs and Horizon broadcasts,
 * SUCCESS with the transaction hash on confirmation,
 * ERROR with a distinction between user rejection and contract/network failures.
 */
export function useVoteTransaction({
  prId,
  publicKey,
  providerId,
  horizonUrl,
  networkPassphrase,
}: UseVoteTransactionOptions): UseVoteTransactionResult {
  const [state, setState] = useState<VoteTxState>(IDLE_STATE);

  const submit = useCallback(async (): Promise<VoteTxState> => {
    setState({ status: 'pending', txHash: null, errorKind: null, errorMessage: null });

    try {
      const hash = await castVote(prId, publicKey, horizonUrl, networkPassphrase, providerId);
      const next: VoteTxState = { status: 'success', txHash: hash, errorKind: null, errorMessage: null };
      setState(next);

      void appendAuditEvent({
        id: `vote-${prId}-${hash}`,
        type: 'guardian.vote',
        actor: publicKey,
        action: 'vote_submitted',
        resource: 'pull_request',
        resourceId: prId,
        status: 'success',
        metadata: { transactionHash: hash },
      }).catch((err) => console.error('Unable to append vote audit log', err));

      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Vote failed';
      const errorKind: VoteErrorKind = isUserRejection(message) ? 'user_rejected' : 'network_error';
      const next: VoteTxState = { status: 'error', txHash: null, errorKind, errorMessage: message };
      setState(next);

      void appendAuditEvent({
        type: 'guardian.vote',
        actor: publicKey,
        action: 'vote_failed',
        resource: 'pull_request',
        resourceId: prId,
        status: 'failure',
        metadata: { error: message, errorKind },
      }).catch((e) => console.error('Unable to append failed vote audit log', e));

      return next;
    }
  }, [prId, publicKey, horizonUrl, networkPassphrase, providerId]);

  const reset = useCallback(() => setState(IDLE_STATE), []);

  return { state, submit, reset };
}
