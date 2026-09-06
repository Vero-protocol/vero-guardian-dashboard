/**
 * contractClient unit tests.
 *
 * The Horizon Server singleton in contractClient.ts is created at module-load
 * time, so we mock @stellar/stellar-sdk to return a stable server object whose
 * methods we can reconfigure between tests.
 */

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  const server = {
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
  };

  // Store the server reference on the mock constructor so tests can access it
  const ServerMock = jest.fn(() => server);
  (ServerMock as any).__mockServer = server;

  // Capture the operation passed to addOperation so tests can inspect it.
  const capturedOps: any[] = [];
  const txMock = {
    addOperation: jest.fn((op: any) => {
      capturedOps.push(op);
      return txMock;
    }),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ toXDR: jest.fn().mockReturnValue('xdr') }),
    __capturedOps: capturedOps,
  };
  const TransactionBuilder = jest.fn(() => txMock);
  (TransactionBuilder as any).fromXDR = jest.fn(() => ({}));
  (TransactionBuilder as any).__txMock = txMock;

  return {
    ...original,
    Horizon: { Server: ServerMock },
    TransactionBuilder,
  };
});

jest.mock('@/lib/wallets', () => {
  const original = jest.requireActual('@/lib/wallets');
  return {
    ...original,
    getWalletProvider: jest.fn(),
  };
});

import { castVote, parseConsensusData } from '@/services/contractClient';
import { getWalletProvider } from '@/lib/wallets';
import * as StellarSdk from '@stellar/stellar-sdk';

// Access the mock server instance stored on the Server mock constructor
const mockServer = (StellarSdk.Horizon.Server as any).__mockServer as {
  loadAccount: jest.Mock;
  submitTransaction: jest.Mock;
};

const mockTxBuilder = (StellarSdk.TransactionBuilder as any).__txMock as {
  addOperation: jest.Mock;
  __capturedOps: any[];
};

const mockGetWalletProvider = getWalletProvider as jest.Mock;

// ---------------------------------------------------------------------------
// castVote
// ---------------------------------------------------------------------------

describe('castVote', () => {
  const PUBLIC_KEY = 'GABC1234';
  const TX_HASH = 'abc123hash';
  const mockProvider = {
    signTransaction: jest.fn(),
  };

  beforeEach(() => {
    mockServer.loadAccount.mockResolvedValue({
      accountId: () => PUBLIC_KEY,
      sequenceNumber: () => '1',
      incrementSequenceNumber: jest.fn(),
      sequence: '1',
      id: PUBLIC_KEY,
    });
    mockServer.submitTransaction.mockResolvedValue({ hash: TX_HASH });
    mockProvider.signTransaction.mockResolvedValue('signedXDR');
    mockGetWalletProvider.mockReturnValue(mockProvider);
    mockTxBuilder.__capturedOps.length = 0;
  });

  afterEach(() => {
    mockServer.loadAccount.mockReset();
    mockServer.submitTransaction.mockReset();
    mockProvider.signTransaction.mockReset();
    mockGetWalletProvider.mockReset();
  });

  it('returns transaction hash on success (Freighter default)', async () => {
    const hash = await castVote(42, PUBLIC_KEY);
    expect(hash).toBe(TX_HASH);
    expect(mockGetWalletProvider).toHaveBeenCalledWith('freighter');
    expect(mockProvider.signTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        networkPassphrase: expect.any(String),
      })
    );
    expect(mockServer.submitTransaction).toHaveBeenCalled();
  });

  it('returns transaction hash on success using Rabet', async () => {
    const hash = await castVote(42, PUBLIC_KEY, undefined, undefined, 'rabet');
    expect(hash).toBe(TX_HASH);
    expect(mockGetWalletProvider).toHaveBeenCalledWith('rabet');
    expect(mockProvider.signTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        networkPassphrase: expect.any(String),
      })
    );
    expect(mockServer.submitTransaction).toHaveBeenCalled();
  });

  it('writes the approve key and numeric weight by default', async () => {
    await castVote(42, PUBLIC_KEY);
    expect(mockTxBuilder.__capturedOps).toHaveLength(1);
    expect(mockTxBuilder.__capturedOps[0]).toMatchObject({
      name: 'vote_42_approve',
      value: '1',
    });
  });

  it('writes the reject key when choice is reject', async () => {
    await castVote(42, PUBLIC_KEY, undefined, undefined, 'freighter', 'reject');
    expect(mockTxBuilder.__capturedOps).toHaveLength(1);
    expect(mockTxBuilder.__capturedOps[0]).toMatchObject({
      name: 'vote_42_reject',
      value: '1',
    });
  });

  it('throws on an invalid vote choice', async () => {
    await expect(castVote(42, PUBLIC_KEY, undefined, undefined, 'freighter', 'maybe' as any)).rejects.toThrow(
      /Invalid vote choice/
    );
  });

  it('propagates Horizon submission errors', async () => {
    mockServer.submitTransaction.mockRejectedValue(new Error('Horizon error'));
    await expect(castVote(42, PUBLIC_KEY)).rejects.toThrow('Horizon error');
  });

  it('propagates signing errors', async () => {
    mockProvider.signTransaction.mockRejectedValue(new Error('User rejected'));
    await expect(castVote(42, PUBLIC_KEY)).rejects.toThrow('User rejected');
  });
});

// ---------------------------------------------------------------------------
// parseConsensusData
// ---------------------------------------------------------------------------

describe('parseConsensusData', () => {
  const encode = (value: string): string => Buffer.from(value).toString('base64');

  it('returns zero weights when dataAttr is missing', () => {
    expect(parseConsensusData(undefined, '42')).toEqual({
      currentWeight: 0,
      threshold: 51,
      approveWeight: 0,
      rejectWeight: 0,
    });
  });

  it('reads the exact key/value shape castVote produces for approve', () => {
    const dataAttr: Record<string, string> = {
      consensus_threshold: encode('100'),
      vote_42_approve: encode('1'),
    };

    expect(parseConsensusData(dataAttr, '42')).toEqual({
      currentWeight: 1,
      threshold: 100,
      approveWeight: 1,
      rejectWeight: 0,
    });
  });

  it('reads reject votes separately from approve votes', () => {
    const dataAttr: Record<string, string> = {
      consensus_threshold: encode('100'),
      vote_42_approve: encode('3'),
      vote_42_reject: encode('2'),
    };

    expect(parseConsensusData(dataAttr, '42')).toEqual({
      currentWeight: 5,
      threshold: 100,
      approveWeight: 3,
      rejectWeight: 2,
    });
  });

  it('trims whitespace from the taskId', () => {
    const dataAttr: Record<string, string> = {
      vote_42_approve: encode('7'),
    };

    expect(parseConsensusData(dataAttr, '  42  ')).toEqual({
      currentWeight: 7,
      threshold: 51,
      approveWeight: 7,
      rejectWeight: 0,
    });
  });

  it('ignores malformed numeric values gracefully', () => {
    const dataAttr: Record<string, string> = {
      vote_42_approve: encode('not-a-number'),
    };

    expect(parseConsensusData(dataAttr, '42')).toEqual({
      currentWeight: 0,
      threshold: 51,
      approveWeight: 0,
      rejectWeight: 0,
    });
  });
});
