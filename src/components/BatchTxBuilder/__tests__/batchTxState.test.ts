import * as StellarSdk from '@stellar/stellar-sdk';
import { describe, expect, test } from '@jest/globals';
import {
  MAX_DATA_NAME_BYTES,
  createOperationId,
  emptyDraft,
  extractSorobanInvocation,
  isSorobanDraft,
  moveOperation,
  removeOperation,
  shortenAddress,
  summarizeDraft,
  toStellarOperation,
  validateDraft,
  type QueuedOperation,
} from '../batchTxState';

const VALID_DESTINATION = StellarSdk.Keypair.random().publicKey();
const SOURCE = StellarSdk.Keypair.random().publicKey();
const VALID_CONTRACT_ID = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';

function queued(id: string): QueuedOperation {
  return { id, draft: emptyDraft('vote') };
}

/**
 * Operation builders return raw XDR objects whose fields are only readable
 * once decoded through a built transaction (mirrors the txBuilder tests).
 */
function decodeOperation(
  operation: ReturnType<typeof toStellarOperation>,
): Record<string, unknown> {
  const account = new StellarSdk.Account(SOURCE, '1');
  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();
  return transaction.operations[0] as unknown as Record<string, unknown>;
}

describe('emptyDraft', () => {
  test('creates a blank draft for each operation type', () => {
    expect(emptyDraft('vote')).toEqual({ type: 'vote', prId: '', choice: 'approve' });
    expect(emptyDraft('data')).toEqual({ type: 'data', name: '', value: '' });
    expect(emptyDraft('payment')).toEqual({ type: 'payment', destination: '', amount: '' });
  });
});

describe('createOperationId', () => {
  test('generates unique ids', () => {
    const ids = new Set([createOperationId(), createOperationId(), createOperationId()]);
    expect(ids.size).toBe(3);
  });
});

describe('validateDraft', () => {
  test('accepts a well-formed vote', () => {
    expect(validateDraft({ type: 'vote', prId: '42', choice: 'approve' })).toBeNull();
  });

  test('rejects a missing or non-numeric PR number', () => {
    expect(validateDraft({ type: 'vote', prId: '', choice: 'approve' })).toBe('PR_REQUIRED');
    expect(validateDraft({ type: 'vote', prId: 'abc', choice: 'approve' })).toBe('PR_INVALID');
    expect(validateDraft({ type: 'vote', prId: '0', choice: 'approve' })).toBe('PR_INVALID');
  });

  test('requires a data name within the byte limit', () => {
    expect(validateDraft({ type: 'data', name: '', value: 'x' })).toBe('NAME_REQUIRED');
    expect(validateDraft({ type: 'data', name: 'a'.repeat(MAX_DATA_NAME_BYTES + 1), value: '' })).toBe(
      'NAME_TOO_LONG',
    );
    expect(validateDraft({ type: 'data', name: 'status', value: 'active' })).toBeNull();
  });

  test('validates a payment destination and amount', () => {
    expect(validateDraft({ type: 'payment', destination: 'not-a-key', amount: '10' })).toBe(
      'DESTINATION_INVALID',
    );
    expect(validateDraft({ type: 'payment', destination: VALID_DESTINATION, amount: '0' })).toBe(
      'AMOUNT_INVALID',
    );
    expect(validateDraft({ type: 'payment', destination: VALID_DESTINATION, amount: '1.12345678' })).toBe(
      'AMOUNT_INVALID',
    );
    expect(validateDraft({ type: 'payment', destination: VALID_DESTINATION, amount: '10.5' })).toBeNull();
  });
});

describe('toStellarOperation', () => {
  test('maps a vote draft to a manageData operation', () => {
    const decoded = decodeOperation(toStellarOperation({ type: 'vote', prId: '7', choice: 'reject' }));
    expect(decoded.type).toBe('manageData');
    expect(decoded.name).toBe('vote_7');
    expect(String(decoded.value)).toBe('reject');
  });

  test('builds a native payment operation', () => {
    const decoded = decodeOperation(
      toStellarOperation({ type: 'payment', destination: VALID_DESTINATION, amount: '25' }),
    );
    expect(decoded.type).toBe('payment');
    expect(decoded.destination).toBe(VALID_DESTINATION);
    expect(Number(decoded.amount)).toBe(25);
  });

  test('throws on an invalid draft so it never reaches signing', () => {
    expect(() => toStellarOperation({ type: 'vote', prId: '', choice: 'approve' })).toThrow(
      /invalid vote operation/i,
    );
  });
});

describe('summarizeDraft', () => {
  test('describes each operation type', () => {
    expect(summarizeDraft({ type: 'vote', prId: '12', choice: 'approve' })).toBe(
      'Vote approve on PR #12',
    );
    expect(summarizeDraft({ type: 'data', name: 'status', value: 'active' })).toBe(
      'Set data status = active',
    );
    expect(summarizeDraft({ type: 'data', name: 'status', value: '' })).toBe('Clear data status');
    expect(summarizeDraft({ type: 'payment', destination: VALID_DESTINATION, amount: '10' })).toContain(
      'Pay 10 XLM to',
    );
  });
});

describe('shortenAddress', () => {
  test('truncates long addresses and leaves short ones intact', () => {
    expect(shortenAddress(VALID_DESTINATION)).toBe(
      `${VALID_DESTINATION.slice(0, 4)}…${VALID_DESTINATION.slice(-4)}`,
    );
    expect(shortenAddress('short')).toBe('short');
  });
});

describe('removeOperation', () => {
  test('removes the matching operation only', () => {
    const ops = [queued('a'), queued('b'), queued('c')];
    expect(removeOperation(ops, 'b').map((o) => o.id)).toEqual(['a', 'c']);
    expect(ops).toHaveLength(3); // input not mutated
  });
});

describe('moveOperation', () => {
  test('swaps adjacent operations and preserves order at the edges', () => {
    const ops = [queued('a'), queued('b'), queued('c')];
    expect(moveOperation(ops, 1, 'up').map((o) => o.id)).toEqual(['b', 'a', 'c']);
    expect(moveOperation(ops, 1, 'down').map((o) => o.id)).toEqual(['a', 'c', 'b']);
    expect(moveOperation(ops, 0, 'up')).toBe(ops); // no-op returns the same array
    expect(moveOperation(ops, 2, 'down')).toBe(ops);
  });
});

describe('emptyDraft (Soroban)', () => {
  test('creates a blank sorobanVote draft', () => {
    const draft = emptyDraft('sorobanVote');
    expect(draft).toEqual({ type: 'sorobanVote', contractId: '', prId: '', choice: 'approve' });
  });

  test('creates a blank sorobanHalt draft', () => {
    const draft = emptyDraft('sorobanHalt');
    expect(draft).toEqual({ type: 'sorobanHalt', contractId: '' });
  });
});

describe('isSorobanDraft', () => {
  test('returns true for Soroban operation types', () => {
    expect(isSorobanDraft({ type: 'sorobanVote', contractId: VALID_CONTRACT_ID, prId: '5', choice: 'approve' })).toBe(true);
    expect(isSorobanDraft({ type: 'sorobanHalt', contractId: VALID_CONTRACT_ID })).toBe(true);
  });

  test('returns false for classic operation types', () => {
    expect(isSorobanDraft({ type: 'vote', prId: '5', choice: 'approve' })).toBe(false);
    expect(isSorobanDraft({ type: 'data', name: 'key', value: 'val' })).toBe(false);
    expect(isSorobanDraft({ type: 'payment', destination: VALID_DESTINATION, amount: '10' })).toBe(false);
  });
});

describe('validateDraft (Soroban)', () => {
  test('accepts a well-formed sorobanVote', () => {
    expect(validateDraft({ type: 'sorobanVote', contractId: VALID_CONTRACT_ID, prId: '42', choice: 'approve' })).toBeNull();
  });

  test('accepts a well-formed sorobanHalt', () => {
    expect(validateDraft({ type: 'sorobanHalt', contractId: VALID_CONTRACT_ID })).toBeNull();
  });

  test('rejects sorobanVote with missing contract ID', () => {
    expect(validateDraft({ type: 'sorobanVote', contractId: '', prId: '42', choice: 'approve' })).toBe('CONTRACT_ID_INVALID');
  });

  test('rejects sorobanVote with non-numeric PR number', () => {
    expect(validateDraft({ type: 'sorobanVote', contractId: VALID_CONTRACT_ID, prId: 'abc', choice: 'approve' })).toBe('PR_INVALID');
  });

  test('rejects sorobanHalt with invalid contract ID', () => {
    expect(validateDraft({ type: 'sorobanHalt', contractId: 'G12345' })).toBe('CONTRACT_ID_INVALID');
  });
});

describe('extractSorobanInvocation', () => {
  test('extracts vote invocation from sorobanVote draft', () => {
    const invocation = extractSorobanInvocation({
      type: 'sorobanVote',
      contractId: VALID_CONTRACT_ID,
      prId: '7',
      choice: 'reject',
    });
    expect(invocation.contractId).toBe(VALID_CONTRACT_ID);
    expect(invocation.method).toBe('vote');
    expect(invocation.args).toHaveLength(2);
  });

  test('extracts halt invocation from sorobanHalt draft', () => {
    const invocation = extractSorobanInvocation({
      type: 'sorobanHalt',
      contractId: VALID_CONTRACT_ID,
    });
    expect(invocation.contractId).toBe(VALID_CONTRACT_ID);
    expect(invocation.method).toBe('halt');
    expect(invocation.args).toHaveLength(0);
  });
});

describe('summarizeDraft (Soroban)', () => {
  test('describes sorobanVote operation', () => {
    expect(summarizeDraft({ type: 'sorobanVote', contractId: VALID_CONTRACT_ID, prId: '12', choice: 'approve' })).toBe(
      'Soroban vote approve on PR #12',
    );
  });

  test('describes sorobanHalt operation', () => {
    expect(summarizeDraft({ type: 'sorobanHalt', contractId: VALID_CONTRACT_ID })).toContain('Soroban halt contract');
  });
});
