'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { CheckCircle2, ExternalLink, Radio, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as StellarSdk from '@stellar/stellar-sdk';
import { getStellarExplorerTxUrl } from '@/lib/stellar-expert';
import { useEvents } from '@/hooks/useEvents';
import { appendAuditEvent, type AuditLogEventInput } from '@/utils/logger';
import { useNetwork } from '@/context/NetworkContext';
import { DEFAULT_HORIZON_URL } from '@/services/rpc';
import ActivityLogExport from '@/components/ActivityLogExport/ActivityLogExport';

/** Maximum number of transactions retained in the feed at once. */
export const MAX_FEED_ENTRIES = 25;

export type FeedConnectionStatus = 'connecting' | 'live' | 'error';

export interface FeedTransaction {
  id: string;
  hash: string;
  ledger: number;
  sourceAccount: string;
  operationCount: number;
  successful: boolean;
  createdAt: string;
}

/**
 * Minimal shape of a Horizon streamed transaction record this feed relies on.
 * In streamed records Horizon exposes the ledger sequence as `ledger_attr`
 * because `ledger` itself is overridden with a follow-up call function.
 */
export interface HorizonTransactionRecord {
  id: string;
  hash: string;
  ledger_attr?: number;
  source_account: string;
  operation_count?: number;
  successful?: boolean;
  created_at: string;
}

export interface TransactionStreamHandlers {
  onMessage: (transaction: FeedTransaction) => void;
  onError: (error: unknown) => void;
}

/**
 * Opens a transaction stream and returns an unsubscribe function. Injectable so
 * the component can be driven without a live network connection in tests.
 */
export type TransactionStreamSubscriber = (handlers: TransactionStreamHandlers) => () => void;

/** Normalise a raw Horizon transaction record into the feed's view model. */
export function toFeedTransaction(record: HorizonTransactionRecord): FeedTransaction {
  return {
    id: record.id,
    hash: record.hash,
    ledger: record.ledger_attr ?? 0,
    sourceAccount: record.source_account,
    operationCount: record.operation_count ?? 0,
    successful: record.successful ?? true,
    createdAt: record.created_at,
  };
}

/** Default subscriber that streams new transactions from Horizon in real time. */
export function createHorizonTransactionStream(
  horizonUrl: string = DEFAULT_HORIZON_URL,
): TransactionStreamSubscriber {
  return ({ onMessage, onError }) => {
    const server = new StellarSdk.Horizon.Server(horizonUrl);
    return server
      .transactions()
      .cursor('now')
      .stream({
        onmessage: (record) =>
          onMessage(toFeedTransaction(record as unknown as HorizonTransactionRecord)),
        onerror: (event) => onError(event),
      });
  };
}

/** Shorten a long identifier to `lead…tail` for compact display. */
export function truncateMiddle(value: string, lead = 6, tail = 6): string {
  if (!value) return '';
  if (value.length <= lead + tail + 1) return value;
  return `\( {value.slice(0, lead)}… \){value.slice(-tail)}`;
}

const STATUS_STYLES: Record<
  FeedConnectionStatus,
  { labelKey: string; badge: string; dot: string; pulse: boolean }
> = {
  connecting: {
    labelKey: 'transactionFeed.statusConnecting',
    badge:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    dot: 'bg-amber-500',
    pulse: true,
  },
  live: {
    labelKey: 'transactionFeed.statusLive',
    badge:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    pulse: true,
  },
  error: {
    labelKey: 'transactionFeed.statusError',
    badge:
      'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400',
    dot: 'bg-red-500',
    pulse: false,
  },
};

interface TransactionFeedProps {
  /** Stream source. Defaults to a live Horizon subscription. */
  subscribe?: TransactionStreamSubscriber;
  /** Maximum number of transactions kept in the feed. */
  maxEntries?: number;
  /** Audit sink. Defaults to the encrypted local audit logger. */
  auditAppender?: (event: AuditLogEventInput) => Promise<unknown>;
}

export default function TransactionFeed({
  subscribe,
  maxEntries = MAX_FEED_ENTRIES,
  auditAppender = appendAuditEvent,
}: TransactionFeedProps = {}): ReactElement {
  const { t } = useTranslation();
  const { networkConfig } = useNetwork();
  const { emit } = useEvents();
  const [transactions, setTransactions] = useState<FeedTransaction[]>([]);
  const [status, setStatus] = useState<FeedConnectionStatus>('connecting');
  const seenTransactionIds = useRef<Set<string>>(new Set());

  const subscriber = useMemo<TransactionStreamSubscriber>(
    () => subscribe ?? createHorizonTransactionStream(networkConfig.horizonUrl),
    [subscribe, networkConfig.horizonUrl],
  );

  useEffect(() => {
    let active = true;
    seenTransactionIds.current = new Set();
    setStatus('connecting');
    setTransactions([]);

    const unsubscribe = subscriber({
      onMessage: (transaction) => {
        if (!active) return;
        setStatus('live');
        if (seenTransactionIds.current.has(transaction.id)) {
          return;
        }

        seenTransactionIds.current.add(transaction.id);
        emit({
          type: 'transaction',
          actor: transaction.sourceAccount,
          resource: 'stellar.transaction',
          resourceId: transaction.hash,
          metadata: {
            ledger: transaction.ledger,
            operationCount: transaction.operationCount,
            successful: transaction.successful,
          },
        });
        void auditAppender({
          id: `stellar-tx-${transaction.id}`,
          timestamp: transaction.createdAt,
          type: 'transaction.stream',
          actor: transaction.sourceAccount,
          action: 'horizon_transaction_observed',
          resource: 'stellar.transaction',
          resourceId: transaction.hash,
          requestId: transaction.id,
          status: transaction.successful ? 'success' : 'failure',
          metadata: {
            ledger: transaction.ledger,
            operationCount: transaction.operationCount,
          },
        }).catch((error) => {
          console.error('Unable to append transaction audit log', error);
        });
        setTransactions((previous) => [transaction, ...previous].slice(0, maxEntries));
      },
      onError: (error) => {
        if (!active) return;
        console.error('Transaction feed stream error', error);
        setStatus('error');
      },
    });

    if (active) {
      setStatus('live');
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [auditAppender, subscriber, maxEntries, emit]);

  const statusStyle = STATUS_STYLES[status];

  return (
    <section
      aria-label={t('transactionFeed.ariaLabel')}
      className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Radio className="w-5 h-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          {t('transactionFeed.heading')}
        </h3>

        <div className="flex items-center gap-3">
          <ActivityLogExport />

          {/* Connection status */}
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold ${statusStyle.badge}`}
          >
            <span
              data-testid="transaction-feed-status-dot"
              className={`w-2 h-2 rounded-full ${statusStyle.dot} ${
                statusStyle.pulse ? 'animate-pulse' : ''
              }`}
              aria-hidden="true"
            />
            {t(statusStyle.labelKey)}
          </span>
        </div>
      </div>

      {/* Empty / Error state */}
      {transactions.length === 0 ? (
        <p
          className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center"
          role="status"
          aria-live="polite"
        >
          {status === 'error' ? t('transactionFeed.error') : t('transactionFeed.empty')}
        </p>
      ) : (
        /* Transaction list */
        <ul
          className="space-y-2 max-h-96 overflow-y-auto"
          aria-live="polite"
          aria-label={t('transactionFeed.listLabel', {
            defaultValue: 'Recent transactions',
          })}
        >
          {transactions.map((transaction) => {
            const statusText = transaction.successful
              ? t('transactionFeed.successful')
              : t('transactionFeed.failed');

            const itemLabel = `${statusText}. Transaction ${truncateMiddle(
              transaction.hash,
            )}. From ${truncateMiddle(transaction.sourceAccount, 4, 4)}. Ledger ${
              transaction.ledger
            }. ${transaction.operationCount} operations.`;

            return (
              <li
                key={transaction.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 animate-in slide-in-from-top-2 fade-in"
              >
                {/* Status icon */}
                {transaction.successful ? (
                  <CheckCircle2
                    className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                ) : (
                  <XCircle
                    className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400"
                    aria-hidden="true"
                  />
                )}

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <a
                    href={getStellarExplorerTxUrl(transaction.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${t('transactionFeed.viewOnExplorer')}: ${truncateMiddle(
                      transaction.hash,
                    )}`}
                    className="inline-flex items-center gap-1 font-mono text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 rounded"
                  >
                    {truncateMiddle(transaction.hash)}
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>

                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                    {truncateMiddle(transaction.sourceAccount, 4, 4)}
                  </p>
                </div>

                {/* Meta info */}
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('transactionFeed.ledger', { ledger: transaction.ledger })}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('transactionFeed.operations', {
                      count: transaction.operationCount,
                    })}
                  </p>
                </div>

                {/* Screen reader only full description */}
                <span className="sr-only">{itemLabel}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
      }
