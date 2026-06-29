'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Layers, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import {
  defaultBatchTransactionBuilder,
  type BroadcastBatchTransactionResult,
  type BuildBatchTransactionRequest,
  type BuildSorobanTransactionRequest,
  type SorobanTransactionResult,
} from '@/services/txBuilder';
import {
  DRAFT_ERROR_MESSAGES,
  MAX_BATCH_OPERATIONS,
  OPERATION_TYPES,
  createOperationId,
  emptyDraft,
  extractSorobanInvocation,
  isSorobanDraft,
  moveOperation,
  removeOperation,
  summarizeDraft,
  toStellarOperation,
  validateDraft,
  type OperationDraft,
  type OperationType,
  type QueuedOperation,
  type SorobanHaltOperationDraft,
  type SorobanVoteOperationDraft,
} from './batchTxState';

type BatchTxResult = BroadcastBatchTransactionResult | SorobanTransactionResult;

/** The slice of the batch transaction service this component depends on. */
export interface BatchBroadcaster {
  signAndBroadcastBatchTransaction(
    request: BuildBatchTransactionRequest,
  ): Promise<BroadcastBatchTransactionResult>;
  buildSorobanAndSend?(
    request: BuildSorobanTransactionRequest,
  ): Promise<SorobanTransactionResult>;
}

const OPERATION_TYPE_LABELS: Record<OperationType, string> = {
  vote: 'Vote',
  data: 'Manage data',
  payment: 'Payment',
  sorobanVote: 'Soroban vote',
  sorobanHalt: 'Soroban halt',
};

export interface BatchTxBuilderProps {
  /** Injectable broadcaster; defaults to the shared batch transaction builder. */
  broadcaster?: BatchBroadcaster;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return 'Failed to broadcast the batch transaction.';
}

function shortenHash(hash: string): string {
  return hash.length <= 16 ? hash : `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

export default function BatchTxBuilder({
  broadcaster = defaultBatchTransactionBuilder,
}: BatchTxBuilderProps = {}): ReactElement {
  const { publicKey, isConnected } = useWallet();
  const [operations, setOperations] = useState<QueuedOperation[]>([]);
  const [draft, setDraft] = useState<OperationDraft>(() => emptyDraft('vote'));
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [result, setResult] = useState<BatchTxResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draftError = useMemo(() => validateDraft(draft), [draft]);
  const isFull = operations.length >= MAX_BATCH_OPERATIONS;

  const updateDraft = (patch: Partial<OperationDraft>) => {
    setDraft((current) => ({ ...current, ...patch } as OperationDraft));
  };

  const changeType = (type: OperationType) => {
    setDraft(emptyDraft(type));
  };

  const addOperation = () => {
    if (draftError || isFull) {
      return;
    }
    setOperations((current) => [...current, { id: createOperationId(), draft }]);
    setDraft(emptyDraft(draft.type));
    setResult(null);
  };

  const remove = (id: string) => {
    setOperations((current) => removeOperation(current, id));
  };

  const move = (index: number, direction: 'up' | 'down') => {
    setOperations((current) => moveOperation(current, index, direction));
  };

  const clearAll = () => {
    setOperations([]);
    setError(null);
  };

  const hasSoroban = operations.some((op) => isSorobanDraft(op.draft));

  const broadcast = async () => {
    if (!publicKey || operations.length === 0 || isBroadcasting) {
      return;
    }

    setIsBroadcasting(true);
    setError(null);
    setResult(null);

    try {
      if (hasSoroban) {
        const classicOps = operations
          .filter((op) => !isSorobanDraft(op.draft))
          .map((op) => toStellarOperation(op.draft));
        const invocations = operations
          .filter((op) => isSorobanDraft(op.draft))
          .map((op) => extractSorobanInvocation(op.draft as SorobanVoteOperationDraft | SorobanHaltOperationDraft));

        const sorobanBroadcaster = broadcaster.buildSorobanAndSend ?? defaultBatchTransactionBuilder.buildSorobanAndSend.bind(defaultBatchTransactionBuilder);
        const sorobanResult = await sorobanBroadcaster({
          sourceAccount: publicKey,
          invocations,
          classicOperations: classicOps.length > 0 ? classicOps : undefined,
        });
        setResult(sorobanResult);
        setOperations([]);
      } else {
        const stellarOperations = operations.map((operation) => toStellarOperation(operation.draft));
        const broadcastResult = await broadcaster.signAndBroadcastBatchTransaction({
          sourceAccount: publicKey,
          operations: stellarOperations,
        });
        setResult(broadcastResult);
        setOperations([]);
      }
    } catch (broadcastError) {
      setError(getErrorMessage(broadcastError));
    } finally {
      setIsBroadcasting(false);
    }
  };

  return (
    <section
      aria-label="Batch transaction builder"
      className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg"
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-500" aria-hidden="true" />
          Batch Transaction Builder
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Queue multiple operations and broadcast them in a single signed transaction.
        </p>
      </div>

      {/* Draft form */}
      <div className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Operation type
          <select
            data-testid="operation-type"
            className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={draft.type}
            onChange={(event) => changeType(event.target.value as OperationType)}
          >
            {OPERATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {OPERATION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        {draft.type === 'vote' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              PR number
              <input
                data-testid="vote-pr"
                type="text"
                inputMode="numeric"
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.prId}
                onChange={(event) => updateDraft({ prId: event.target.value })}
                placeholder="42"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Choice
              <select
                data-testid="vote-choice"
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.choice}
                onChange={(event) => updateDraft({ choice: event.target.value as 'approve' | 'reject' })}
              >
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
              </select>
            </label>
          </div>
        )}

        {draft.type === 'data' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Data name
              <input
                data-testid="data-name"
                type="text"
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
                placeholder="status"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Data value
              <input
                data-testid="data-value"
                type="text"
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.value}
                onChange={(event) => updateDraft({ value: event.target.value })}
                placeholder="active"
              />
            </label>
          </div>
        )}

        {draft.type === 'payment' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Destination
              <input
                data-testid="payment-destination"
                type="text"
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.destination}
                onChange={(event) => updateDraft({ destination: event.target.value })}
                placeholder="G..."
              />
            </label>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Amount (XLM)
              <input
                data-testid="payment-amount"
                type="text"
                inputMode="decimal"
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.amount}
                onChange={(event) => updateDraft({ amount: event.target.value })}
                placeholder="10"
              />
            </label>
          </div>
        )}

        {draft.type === 'sorobanVote' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Contract ID
              <input
                data-testid="soroban-vote-contract"
                type="text"
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.contractId}
                onChange={(event) => updateDraft({ contractId: event.target.value })}
                placeholder="C..."
              />
            </label>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              PR number
              <input
                data-testid="soroban-vote-pr"
                type="text"
                inputMode="numeric"
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.prId}
                onChange={(event) => updateDraft({ prId: event.target.value })}
                placeholder="42"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Choice
              <select
                data-testid="soroban-vote-choice"
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={draft.choice}
                onChange={(event) => updateDraft({ choice: event.target.value as 'approve' | 'reject' })}
              >
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
              </select>
            </label>
          </div>
        )}

        {draft.type === 'sorobanHalt' && (
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            Contract ID
            <input
              data-testid="soroban-halt-contract"
              type="text"
              className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={draft.contractId}
              onChange={(event) => updateDraft({ contractId: event.target.value })}
              placeholder="C..."
            />
          </label>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-rose-600 dark:text-rose-400" role="status" aria-live="polite">
            {draftError ? DRAFT_ERROR_MESSAGES[draftError] : ''}
          </p>
          <button
            type="button"
            data-testid="add-operation"
            onClick={addOperation}
            disabled={Boolean(draftError) || isFull}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add operation
          </button>
        </div>
        {isFull && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            A transaction can hold at most {MAX_BATCH_OPERATIONS} operations.
          </p>
        )}
      </div>

      {/* Queue */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Queued operations ({operations.length})
          </h4>
          {operations.length > 0 && (
            <button
              type="button"
              data-testid="clear-operations"
              onClick={clearAll}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors focus:outline-none focus:underline"
            >
              Clear all
            </button>
          )}
        </div>

        {operations.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
            No operations queued yet. Add one above to start your batch.
          </p>
        ) : (
          <ol className="space-y-2">
            {operations.map((operation, index) => (
              <li
                key={operation.id}
                data-testid="queued-operation"
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2"
              >
                <span className="text-xs font-mono text-slate-400 dark:text-slate-500 w-5 shrink-0">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">
                  {summarizeDraft(operation.draft)}
                </span>
                <button
                  type="button"
                  aria-label="Move operation up"
                  onClick={() => move(index, 'up')}
                  disabled={index === 0}
                  className="p-1 rounded text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <ArrowUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Move operation down"
                  onClick={() => move(index, 'down')}
                  disabled={index === operations.length - 1}
                  className="p-1 rounded text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <ArrowDown className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Remove operation"
                  onClick={() => remove(operation.id)}
                  className="p-1 rounded text-slate-500 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Broadcast */}
      <div className="mt-5 border-t border-slate-200 dark:border-slate-700 pt-4">
        <button
          type="button"
          data-testid="broadcast-batch"
          onClick={broadcast}
          disabled={!isConnected || operations.length === 0 || isBroadcasting}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {isBroadcasting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Broadcasting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" aria-hidden="true" />
              Build &amp; broadcast
            </>
          )}
        </button>

        {!isConnected && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center">
            Connect your wallet to broadcast the batch.
          </p>
        )}

        {error && (
          <p
            data-testid="broadcast-error"
            role="alert"
            className="mt-3 text-sm text-rose-600 dark:text-rose-400"
          >
            {error}
          </p>
        )}

        {result && (
          <div
            data-testid="broadcast-success"
            className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
            <span className="text-slate-700 dark:text-slate-200">
              {'sendResponse' in result ? 'Soroban tx' : 'Broadcast'} {result.operationCount} operation{result.operationCount === 1 ? '' : 's'} in{' '}
              <span className="font-mono text-emerald-700 dark:text-emerald-400">{shortenHash(result.hash)}</span>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
