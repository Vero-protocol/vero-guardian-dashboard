import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { NetworkProvider } from '@/context/NetworkContext';
import TransactionFeed, {
  toFeedTransaction,
  truncateMiddle,
  type FeedTransaction,
  type HorizonTransactionRecord,
  type TransactionStreamHandlers,
  type TransactionStreamSubscriber,
} from '../StateStateStateStateStateStateStateStateStateStateTransactionFeed';

jest.mock('@/hooks/useChainState', () => ({
  useChainState: () => ({
    forceSync: async () => undefined,
    isSyncing: false,
    status: 'idle',
    syncVersion: 0,
  }),
}));

function renderWithProviders(element: React.ReactElement) {
  return render(<NetworkProvider>{element}</NetworkProvider>);
}

function makeRecord(overrides: Partial<HorizonTransactionRecord> = {}): HorizonTransactionRecord {
  return {
    id: 'tx-1',
    hash: 'a'.repeat(64),
    ledger_attr: 1234,
    source_account: 'G'.repeat(56),
    operation_count: 2,
    successful: true,
    created_at: '2026-06-17T00:00:00Z',
    ...overrides,
  };
}

/**
 * Build an injectable subscriber that captures the live handlers so a test can
 * push transactions / errors on demand, and records unsubscribe calls.
 */
function createControllableSubscriber() {
  const handlersRef: { current: TransactionStreamHandlers | null } = { current: null };
  const unsubscribe = jest.fn();
  const auditAppender = jest.fn(() => Promise.resolve());
  const subscribe: TransactionStreamSubscriber = (handlers) => {
    handlersRef.current = handlers;
    return unsubscribe;
  };
  return { subscribe, handlersRef, unsubscribe, auditAppender };
}

function feedTx(overrides: Partial<FeedTransaction> = {}): FeedTransaction {
  return {
    id: 'tx-1',
    hash: 'a'.repeat(64),
    ledger: 1234,
    sourceAccount: 'G'.repeat(56),
    operationCount: 2,
    successful: true,
    createdAt: '2026-06-17T00:00:00Z',
    ...overrides,
  };
}

describe('toFeedTransaction', () => {
  test('maps Horizon record fields, reading ledger from ledger_attr', () => {
    expect(toFeedTransaction(makeRecord())).toEqual({
      id: 'tx-1',
      hash: 'a'.repeat(64),
      ledger: 1234,
      sourceAccount: 'G'.repeat(56),
      operationCount: 2,
      successful: true,
      createdAt: '2026-06-17T00:00:00Z',
    });
  });

  test('applies safe defaults for missing optional fields', () => {
    const record = makeRecord({ ledger_attr: undefined, operation_count: undefined, successful: undefined });
    const mapped = toFeedTransaction(record);
    expect(mapped.ledger).toBe(0);
    expect(mapped.operationCount).toBe(0);
    expect(mapped.successful).toBe(true);
  });
});

describe('truncateMiddle', () => {
  test('shortens long values and leaves short ones intact', () => {
    expect(truncateMiddle('a'.repeat(64))).toBe('aaaaaa…aaaaaa');
    expect(truncateMiddle('short')).toBe('short');
    expect(truncateMiddle('')).toBe('');
  });
});

describe('TransactionFeed', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders the heading and an empty listening state, going live on subscribe', () => {
    const { subscribe, auditAppender } = createControllableSubscriber();
    renderWithProviders(<TransactionFeed subscribe={subscribe} auditAppender={auditAppender} />);

    expect(screen.getByText('Live Transactions')).toBeTruthy();
    expect(screen.getByText('Listening for new transactions...')).toBeTruthy();
    expect(screen.getByText('Live')).toBeTruthy();
  });

  test('renders a streamed transaction with an explorer link, ledger and op count', () => {
    const { subscribe, handlersRef, auditAppender } = createControllableSubscriber();
    renderWithProviders(<TransactionFeed subscribe={subscribe} auditAppender={auditAppender} />);

    act(() => {
      handlersRef.current?.onMessage(feedTx());
    });

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(
      `https://stellar.expert/explorer/public/tx/${'a'.repeat(64)}`,
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('aaaaaa…aaaaaa')).toBeTruthy();
    expect(screen.getByText('Ledger 1234')).toBeTruthy();
    expect(screen.getByText('2 ops')).toBeTruthy();
    expect(auditAppender).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'stellar-tx-tx-1',
        type: 'transaction.stream',
        action: 'horizon_transaction_observed',
        resource: 'stellar.transaction',
        resourceId: 'a'.repeat(64),
        status: 'success',
      }),
    );
  });

  test('prepends newest transactions and caps the feed at maxEntries', () => {
    const { subscribe, handlersRef, auditAppender } = createControllableSubscriber();
    renderWithProviders(<TransactionFeed subscribe={subscribe} maxEntries={3} auditAppender={auditAppender} />);

    act(() => {
      for (let i = 1; i <= 5; i += 1) {
        handlersRef.current?.onMessage(feedTx({ id: `tx-${i}`, ledger: 1000 + i }));
      }
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    const ledgers = screen.getAllByText(/Ledger 100\d/).map((node) => node.textContent);
    // Newest (1005) first, oldest retained is 1003.
    expect(ledgers).toEqual(['Ledger 1005', 'Ledger 1004', 'Ledger 1003']);
  });

  test('ignores duplicate transaction ids', () => {
    const { subscribe, handlersRef, auditAppender } = createControllableSubscriber();
    renderWithProviders(<TransactionFeed subscribe={subscribe} auditAppender={auditAppender} />);

    act(() => {
      handlersRef.current?.onMessage(feedTx({ id: 'dup' }));
      handlersRef.current?.onMessage(feedTx({ id: 'dup' }));
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(auditAppender).toHaveBeenCalledTimes(1);
  });

  test('shows a failed icon label for unsuccessful transactions', () => {
    const { subscribe, handlersRef, auditAppender } = createControllableSubscriber();
    renderWithProviders(<TransactionFeed subscribe={subscribe} auditAppender={auditAppender} />);

    act(() => {
      handlersRef.current?.onMessage(feedTx({ successful: false }));
    });

    expect(screen.getByLabelText('Failed transaction')).toBeTruthy();
  });

  test('surfaces a disconnected status and message on stream error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { subscribe, handlersRef, auditAppender } = createControllableSubscriber();
    renderWithProviders(<TransactionFeed subscribe={subscribe} auditAppender={auditAppender} />);

    act(() => {
      handlersRef.current?.onError(new Error('stream dropped'));
    });

    expect(screen.getByText('Disconnected')).toBeTruthy();
    expect(
      screen.getByText('Live feed disconnected. A page refresh may be required to reconnect.'),
    ).toBeTruthy();
    expect(errorSpy).toHaveBeenCalledWith('Transaction feed stream error', expect.any(Error));
    errorSpy.mockRestore();
  });

  test('unsubscribes from the stream on unmount', () => {
    const { subscribe, unsubscribe, auditAppender } = createControllableSubscriber();
    const { unmount } = renderWithProviders(<TransactionFeed subscribe={subscribe} auditAppender={auditAppender} />);

    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
