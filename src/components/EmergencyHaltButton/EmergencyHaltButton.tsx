'use client';

import { useState, type ReactElement } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { haltContract } from '@/services/contractClient';
import { getStellarExplorerTxUrl } from '@/lib/stellar-expert';
import { useToast } from '@/components/Toast';
import { useRole } from '@/context/RoleContext';
import { useWallet } from '@/context/WalletContext';
import { useNetwork } from '@/context/NetworkContext';
import { useChainState } from '@/hooks/useChainState';
import { useEvents } from '@/hooks/useEvents';
import { appendAuditEvent } from '@/utils/logger';

const CONTRACT_ID = (process.env.NEXT_PUBLIC_CONTRACT_ID ?? '').trim();

const BUTTON_BASE_CLASSNAME =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900';

type HaltState =
  | 'confirming'
  | 'halting'
  | 'halted'
  | 'missing-wallet'
  | 'unauthorized'
  | 'unsupported-wallet'
  | 'no-contract'
  | 'ready';

function getHaltState(
  isConfirming: boolean,
  isHalting: boolean,
  isHalted: boolean,
  hasPublicKey: boolean,
  isAdmin: boolean,
  hasContractId: boolean,
  isRabet: boolean,
): HaltState {
  if (isHalted) {
    return 'halted';
  }

  if (isHalting) {
    return 'halting';
  }

  if (isConfirming) {
    return 'confirming';
  }

  if (!hasContractId) {
    return 'no-contract';
  }

  if (!hasPublicKey) {
    return 'missing-wallet';
  }

  if (isRabet) {
    return 'unsupported-wallet';
  }

  if (!isAdmin) {
    return 'unauthorized';
  }

  return 'ready';
}

function getHaltButtonClassName(state: HaltState): string {
  switch (state) {
    case 'halted':
      return `${BUTTON_BASE_CLASSNAME} bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 cursor-default`;
    case 'halting':
    case 'confirming':
      return `${BUTTON_BASE_CLASSNAME} bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 cursor-wait`;
    case 'missing-wallet':
    case 'unauthorized':
    case 'unsupported-wallet':
    case 'no-contract':
      return `${BUTTON_BASE_CLASSNAME} bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed`;
    default:
      return `${BUTTON_BASE_CLASSNAME} bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/30`;
  }
}

export default function EmergencyHaltButton(): ReactElement {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isAdmin } = useRole();
  const { publicKey, activeProvider } = useWallet();
  const { networkConfig } = useNetwork();
  const { forceSync } = useChainState({
    cacheKeys: publicKey
      ? ['dashboard', 'prs', 'transactions', 'contract', `account:${publicKey}`]
      : ['dashboard', 'prs', 'transactions', 'contract'],
  });
  const [isConfirming, setIsConfirming] = useState(false);
  const [isHalting, setIsHalting] = useState(false);
  const [isHalted, setIsHalted] = useState(false);
  const { emit: emitEvent } = useEvents();

  const hasPublicKey = Boolean(publicKey);
  const hasContractId = Boolean(CONTRACT_ID);
  const haltState = getHaltState(
    isConfirming,
    isHalting,
    isHalted,
    hasPublicKey,
    isAdmin,
    hasContractId,
    activeProvider === 'rabet',
  );
  const isDisabled = haltState !== 'ready' && haltState !== 'confirming';

  async function handleConfirm(): Promise<void> {
    if (haltState !== 'ready') {
      return;
    }

    setIsConfirming(true);
  }

  async function handleExecute(): Promise<void> {
    if (!publicKey) {
      showToast(t('emergencyHalt.toast.connectWallet'), 'warning');
      return;
    }

    if (!CONTRACT_ID) {
      showToast(t('emergencyHalt.toast.noContract'), 'error');
      return;
    }

    setIsHalting(true);
    setIsConfirming(false);

    try {
      const hash = await haltContract(
        publicKey,
        CONTRACT_ID,
        networkConfig.sorobanRpcUrl,
        networkConfig.networkPassphrase,
        activeProvider ?? 'freighter',
      );

      setIsHalted(true);
      emitEvent({ type: 'emergency_halt', actor: publicKey, resource: 'contract', resourceId: CONTRACT_ID, metadata: { transactionHash: hash } });
      void appendAuditEvent({
        id: `halt-${hash}`,
        type: 'admin.emergency_halt',
        actor: publicKey,
        action: 'contract_halted',
        resource: 'contract',
        resourceId: CONTRACT_ID,
        status: 'success',
        metadata: { transactionHash: hash },
      }).catch((error) => {
        console.error('Unable to append halt audit log', error);
      });

      const explorerUrl = getStellarExplorerTxUrl(hash);
      showToast(
      <>
        {t('emergencyHalt.toast.halted')} —{' '}
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          tx {hash.slice(0, 8)}…
        </a>
      </>,
      'success',
    );
    } catch (err) {
      const message = err instanceof Error ? err.message : t('emergencyHalt.toast.failed');
      emitEvent({ type: 'emergency_halt', actor: publicKey, resource: 'contract', resourceId: CONTRACT_ID, metadata: { error: message } });
      void appendAuditEvent({
        type: 'admin.emergency_halt',
        actor: publicKey,
        action: 'halt_failed',
        resource: 'contract',
        resourceId: CONTRACT_ID,
        status: 'failure',
        metadata: { error: message },
      }).catch((error) => {
        console.error('Unable to append failed halt audit log', error);
      });
      showToast(message, 'error');
    } finally {
      setIsHalting(false);
    }
  }

  function handleCancel(): void {
    setIsConfirming(false);
  }

  if (isConfirming) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          {t('emergencyHalt.confirmTitle')}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t('emergencyHalt.confirmDescription')}
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleExecute}
            disabled={isDisabled}
            className={getHaltButtonClassName('confirming')}
          >
            {t('emergencyHalt.confirmExecute')}
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            {t('emergencyHalt.confirmCancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleConfirm}
      disabled={isDisabled}
      aria-label={t('emergencyHalt.ariaLabel')}
      className={getHaltButtonClassName(haltState)}
    >
      <AlertTriangle className="w-4 h-4" aria-hidden="true" />
      {haltState === 'halted' && `✓ ${t('emergencyHalt.halted')}`}
      {haltState === 'halting' && t('emergencyHalt.halting')}
      {haltState === 'no-contract' && t('emergencyHalt.noContract')}
      {haltState === 'missing-wallet' && t('emergencyHalt.missingWallet')}
      {haltState === 'unsupported-wallet' && t('emergencyHalt.unsupportedWallet', { defaultValue: 'Rabet not supported yet' })}
      {haltState === 'unauthorized' && t('emergencyHalt.unauthorized')}
      {haltState === 'ready' && t('emergencyHalt.label')}
    </button>
  );
}
