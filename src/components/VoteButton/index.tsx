'use client';

import type { ReactElement } from 'react';
import { Loader2 } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/Toast';
import { useRole } from '@/context/RoleContext';
import { useNetwork } from '@/context/NetworkContext';
import { useChainState } from '@/hooks/useChainState';
import { useVoteTransaction } from '@/hooks/useVoteTransaction';
import TransactionNotification from '@/components/TransactionNotification';
import { getStellarExplorerTxUrl } from '@/lib/stellar-expert';
import { useWallet } from '@/context/WalletContext';

interface VoteButtonProps {
  prId: number;
  publicKey: string | null;
}

const VOTE_BUTTON_BASE_CLASSNAME =
  'px-4 py-2 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900';

type VoteButtonState =
  | 'voted'
  | 'pending'
  | 'checking-access'
  | 'missing-wallet'
  | 'unauthorized'
  | 'unsupported-wallet'
  | 'ready';

function getVoteButtonState(
  voted: boolean,
  isPending: boolean,
  isRoleLoading: boolean,
  hasPublicKey: boolean,
  canVote: boolean,
  isRabet: boolean
): VoteButtonState {
  if (voted) return 'voted';
  if (isPending) return 'pending';
  if (isRoleLoading) return 'checking-access';
  if (!hasPublicKey) return 'missing-wallet';
  if (isRabet) return 'unsupported-wallet';
  if (!canVote) return 'unauthorized';
  return 'ready';
}

function getVoteAriaLabel(prId: number, state: VoteButtonState, t: TFunction): string {
  switch (state) {
    case 'voted':
      return t('vote.aria.voted', { prId });
    case 'pending':
      return t('vote.aria.signing', { prId });
    case 'checking-access':
      return t('vote.aria.checkingAccess', { prId });
    case 'missing-wallet':
      return t('vote.aria.missingWallet', { prId });
    case 'unsupported-wallet':
      return t('vote.aria.unsupportedWallet', { prId, defaultValue: 'Unsupported wallet' });
    case 'unauthorized':
      return t('vote.aria.unauthorized', { prId });
    default:
      return t('vote.aria.ready', { prId });
  }
}

function getVoteButtonClassName(state: VoteButtonState): string {
  switch (state) {
    case 'voted':
      return `${VOTE_BUTTON_BASE_CLASSNAME} bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 cursor-default`;
    case 'pending':
    case 'checking-access':
      return `${VOTE_BUTTON_BASE_CLASSNAME} bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 cursor-wait`;
    case 'missing-wallet':
    case 'unauthorized':
    case 'unsupported-wallet':
      return `${VOTE_BUTTON_BASE_CLASSNAME} bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed`;
    default:
      return `${VOTE_BUTTON_BASE_CLASSNAME} bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-900/20`;
  }
}

function getVoteButtonContent(state: VoteButtonState, t: TFunction): ReactElement | string {
  switch (state) {
    case 'voted':
      return `✓ ${t('vote.voted')}`;
    case 'pending':
      return (
        <span className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          {t('vote.signing')}
        </span>
      );
    case 'checking-access':
      return t('vote.checking');
    case 'unsupported-wallet':
      return t('vote.unsupportedWallet', { defaultValue: 'Rabet voting soon' });
    case 'unauthorized':
      return t('vote.unauthorized');
    default:
      return t('vote.vote');
  }
}

export default function VoteButton({ prId, publicKey }: VoteButtonProps): ReactElement {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { canVote, isLoading: isRoleLoading } = useRole();
  const { networkConfig } = useNetwork();
  const { activeProvider } = useWallet();
  useChainState({
    cacheKeys: publicKey
      ? ['dashboard', 'prs', 'transactions', `account:${publicKey}`, `reputation:${publicKey}`]
      : ['dashboard', 'prs', 'transactions'],
  });

  const { state: txState, submit, reset } = useVoteTransaction({
    prId,
    publicKey: publicKey ?? '',
    providerId: activeProvider ?? 'freighter',
    horizonUrl: networkConfig.horizonUrl,
    networkPassphrase: networkConfig.networkPassphrase,
  });

  const voted = txState.status === 'success';
  const isPending = txState.status === 'pending';
  const hasPublicKey = Boolean(publicKey);
  const isRabet = activeProvider === 'rabet';

  const voteButtonState = getVoteButtonState(voted, isPending, isRoleLoading, hasPublicKey, canVote, isRabet);
  const isDisabled = voteButtonState !== 'ready';

  async function handleVote(): Promise<void> {
    if (isDisabled) return;

    if (!publicKey) {
      showToast(t('vote.toast.connectWallet'), 'warning');
      return;
    }

    if (isRoleLoading || !canVote) {
      showToast(t('vote.toast.notGuardian'), 'error');
      return;
    }

    const result = await submit();

    // Mirror into the global toast so it's visible regardless of scroll position.
    if (result.status === 'success' && result.txHash) {
      const explorerUrl = getStellarExplorerTxUrl(result.txHash);
      showToast(
        `${t('vote.toast.recorded')} — <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">tx ${result.txHash.slice(0, 8)}…</a>`,
        'success',
      );
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={handleVote}
        disabled={isDisabled}
        aria-label={getVoteAriaLabel(prId, voteButtonState, t)}
        className={getVoteButtonClassName(voteButtonState)}
      >
        {getVoteButtonContent(voteButtonState, t)}
      </button>
      <TransactionNotification state={txState} onDismiss={reset} />
    </div>
  );
}
