import * as StellarSdk from '@stellar/stellar-sdk';
import { z } from 'zod';
import type { StellarOperation } from '@/services/txBuilder';

/**
 * Local-state model for the batch transaction builder UI. Drafts are the
 * raw form values a Guardian enters; they are validated and converted into
 * `StellarOperation`s only when the batch is built, so the queue can be
 * edited entirely in memory without touching the network.
 */

export type VoteChoice = 'approve' | 'reject';

export const OPERATION_TYPES = ['vote', 'data', 'payment', 'sorobanVote', 'sorobanHalt'] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

/** Stellar caps a single transaction at 100 operations. */
export const MAX_BATCH_OPERATIONS = 100;
/** Horizon rejects manageData entries whose name or value exceeds 64 bytes. */
export const MAX_DATA_NAME_BYTES = 64;
export const MAX_DATA_VALUE_BYTES = 64;
/** Stellar amounts allow up to seven decimal places (stroops). */
export const MAX_AMOUNT_DECIMALS = 7;

// Zod schemas
function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return Buffer.byteLength(value, 'utf8');
}

export const VoteOperationDraftSchema = z.object({
  type: z.literal('vote'),
  prId: z.string().trim().min(1, 'PR_REQUIRED').refine(
    (val) => /^\d+$/.test(val) && Number(val) > 0,
    { message: 'PR_INVALID' }
  ),
  choice: z.enum(['approve', 'reject']),
});

export const DataOperationDraftSchema = z.object({
  type: z.literal('data'),
  name: z.string().trim().min(1, 'NAME_REQUIRED').refine(
    (val) => byteLength(val) <= MAX_DATA_NAME_BYTES,
    { message: 'NAME_TOO_LONG' }
  ),
  value: z.string().refine(
    (val) => byteLength(val) <= MAX_DATA_VALUE_BYTES,
    { message: 'VALUE_TOO_LONG' }
  ),
});

export const PaymentOperationDraftSchema = z.object({
  type: z.literal('payment'),
  destination: z.string().trim().refine(
    (val) => StellarSdk.StrKey.isValidEd25519PublicKey(val),
    { message: 'DESTINATION_INVALID' }
  ),
  amount: z.string().trim().refine(
    (val) => {
      if (!new RegExp(`^\\d+(\\.\\d{1,${MAX_AMOUNT_DECIMALS}})?$`).test(val)) {
        return false;
      }
      return Number(val) > 0;
    },
    { message: 'AMOUNT_INVALID' }
  ),
});

const SOROBAN_CONTRACT_ID_REGEX = /^C[A-Z0-9]{55}$/;

export const SorobanVoteOperationDraftSchema = z.object({
  type: z.literal('sorobanVote'),
  contractId: z.string().trim().refine(
    (val) => SOROBAN_CONTRACT_ID_REGEX.test(val),
    { message: 'CONTRACT_ID_INVALID' }
  ),
  prId: z.string().trim().min(1, 'PR_REQUIRED').refine(
    (val) => /^\d+$/.test(val) && Number(val) > 0,
    { message: 'PR_INVALID' }
  ),
  choice: z.enum(['approve', 'reject']),
});

export const SorobanHaltOperationDraftSchema = z.object({
  type: z.literal('sorobanHalt'),
  contractId: z.string().trim().refine(
    (val) => SOROBAN_CONTRACT_ID_REGEX.test(val),
    { message: 'CONTRACT_ID_INVALID' }
  ),
});

export const OperationDraftSchema = z.discriminatedUnion('type', [
  VoteOperationDraftSchema,
  DataOperationDraftSchema,
  PaymentOperationDraftSchema,
  SorobanVoteOperationDraftSchema,
  SorobanHaltOperationDraftSchema,
]);

export interface VoteOperationDraft extends z.infer<typeof VoteOperationDraftSchema> {}
export interface DataOperationDraft extends z.infer<typeof DataOperationDraftSchema> {}
export interface PaymentOperationDraft extends z.infer<typeof PaymentOperationDraftSchema> {}
export interface SorobanVoteOperationDraft extends z.infer<typeof SorobanVoteOperationDraftSchema> {}
export interface SorobanHaltOperationDraft extends z.infer<typeof SorobanHaltOperationDraftSchema> {}
export type OperationDraft = z.infer<typeof OperationDraftSchema>;

export interface QueuedOperation {
  /** Stable client-side id used for React keys and local-state edits. */
  id: string;
  draft: OperationDraft;
}

export type DraftErrorCode =
  | 'PR_REQUIRED'
  | 'PR_INVALID'
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'VALUE_TOO_LONG'
  | 'DESTINATION_INVALID'
  | 'AMOUNT_INVALID'
  | 'CONTRACT_ID_INVALID';

export const DRAFT_ERROR_MESSAGES: Record<DraftErrorCode, string> = {
  PR_REQUIRED: 'Enter the PR number to vote on.',
  PR_INVALID: 'PR number must be a positive whole number.',
  NAME_REQUIRED: 'Enter a data entry name.',
  NAME_TOO_LONG: `Data name must be at most ${MAX_DATA_NAME_BYTES} bytes.`,
  VALUE_TOO_LONG: `Data value must be at most ${MAX_DATA_VALUE_BYTES} bytes.`,
  DESTINATION_INVALID: 'Enter a valid Stellar destination address (G...).',
  AMOUNT_INVALID: 'Enter a positive amount with up to 7 decimal places.',
  CONTRACT_ID_INVALID: 'Enter a valid Soroban contract ID (C...).',
};

/** Create a blank draft for the given operation type. */
export function emptyDraft(type: OperationType): OperationDraft {
  switch (type) {
    case 'vote':
      return { type: 'vote', prId: '', choice: 'approve' };
    case 'data':
      return { type: 'data', name: '', value: '' };
    case 'payment':
      return { type: 'payment', destination: '', amount: '' };
    case 'sorobanVote':
      return { type: 'sorobanVote', contractId: '', prId: '', choice: 'approve' };
    case 'sorobanHalt':
      return { type: 'sorobanHalt', contractId: '' };
  }
}

/** True when a draft requires Soroban RPC simulation instead of classic Horizon submission. */
export function isSorobanDraft(draft: OperationDraft): draft is SorobanVoteOperationDraft | SorobanHaltOperationDraft {
  return draft.type === 'sorobanVote' || draft.type === 'sorobanHalt';
}

let idCounter = 0;

/** Generate a unique, stable id for a queued operation. */
export function createOperationId(): string {
  idCounter += 1;
  return `op-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validate a single draft. Returns the first failing error code, or `null`
 * when the draft is ready to be converted into a Stellar operation.
 */
export function validateDraft(draft: OperationDraft): DraftErrorCode | null {
  const result = OperationDraftSchema.safeParse(draft);
  if (!result.success) {
    const firstError = result.error.issues[0];
    return firstError.message as DraftErrorCode;
  }
  return null;
}

/**
 * Convert a validated draft into a Stellar operation. Throws when the draft
 * is invalid so a malformed operation can never reach the signing flow.
 */
export function toStellarOperation(draft: OperationDraft): StellarOperation {
  const error = validateDraft(draft);
  if (error) {
    throw new Error(`Cannot build an invalid ${draft.type} operation (${error}).`);
  }

  switch (draft.type) {
    case 'vote':
      return StellarSdk.Operation.manageData({
        name: `vote_${draft.prId.trim()}`,
        value: draft.choice,
      });
    case 'data':
      return StellarSdk.Operation.manageData({
        name: draft.name.trim(),
        // An empty value clears the data entry, which is a valid manageData use.
        value: draft.value.length > 0 ? draft.value : null,
      });
    case 'payment':
      return StellarSdk.Operation.payment({
        destination: draft.destination.trim(),
        asset: StellarSdk.Asset.native(),
        amount: draft.amount.trim(),
      });
    default:
      throw new Error(`Cannot convert ${(draft as OperationDraft).type} draft to a classic Stellar operation.`);
  }
}

export interface SorobanInvocation {
  contractId: string;
  method: string;
  args: readonly StellarSdk.xdr.ScVal[];
}

/**
 * Convert a Soroban draft into contract invocation parameters.
 * Throws when the draft is not a Soroban type.
 */
export function extractSorobanInvocation(draft: SorobanVoteOperationDraft | SorobanHaltOperationDraft): SorobanInvocation {
  switch (draft.type) {
    case 'sorobanVote':
      return {
        contractId: draft.contractId.trim(),
        method: 'vote',
        args: [
          StellarSdk.nativeToScVal(Number(draft.prId.trim()), { type: 'u32' }),
          StellarSdk.nativeToScVal(draft.choice, { type: 'symbol' }),
        ],
      };
    case 'sorobanHalt':
      return {
        contractId: draft.contractId.trim(),
        method: 'halt',
        args: [],
      };
  }
}

/** A short, human-readable one-line summary of a draft for the queue list. */
export function summarizeDraft(draft: OperationDraft): string {
  switch (draft.type) {
    case 'vote':
      return `Vote ${draft.choice} on PR #${draft.prId.trim() || '?'}`;
    case 'data': {
      const name = draft.name.trim() || '(unnamed)';
      return draft.value.length > 0 ? `Set data ${name} = ${draft.value}` : `Clear data ${name}`;
    }
    case 'payment':
      return `Pay ${draft.amount.trim() || '0'} XLM to ${shortenAddress(draft.destination.trim())}`;
    case 'sorobanVote':
      return `Soroban vote ${draft.choice} on PR #${draft.prId.trim() || '?'}`;
    case 'sorobanHalt':
      return `Soroban halt contract ${shortenAddress(draft.contractId)}`;
  }
}

/** Truncate a Stellar address to `GABC…WXYZ` for compact display. */
export function shortenAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Remove a queued operation by id, returning a new array. */
export function removeOperation(operations: QueuedOperation[], id: string): QueuedOperation[] {
  return operations.filter((operation) => operation.id !== id);
}

/**
 * Move a queued operation one slot up or down to control its position in the
 * signed transaction. Out-of-range moves return the original array unchanged.
 */
export function moveOperation(
  operations: QueuedOperation[],
  index: number,
  direction: 'up' | 'down',
): QueuedOperation[] {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= operations.length || target < 0 || target >= operations.length) {
    return operations;
  }

  const next = [...operations];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
