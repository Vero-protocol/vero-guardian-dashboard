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

  // Chainable TransactionBuilder mock
  const txMock = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ toXDR: jest.fn().mockReturnValue('xdr') }),
  };
  const TransactionBuilder = jest.fn(() => txMock);
  (TransactionBuilder as any).fromXDR = jest.fn(() => ({}));

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

import { castVote } from '@/services/contractClient';
import { getWalletProvider } from '@/lib/wallets';
import * as StellarSdk from '@stellar/stellar-sdk';

// Access the mock server instance stored on the Server mock constructor
const mockServer = (StellarSdk.Horizon.Server as any).__mockServer as {
  loadAccount: jest.Mock;
  submitTransaction: jest.Mock;
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

  it('propagates Horizon submission errors', async () => {
    mockServer.submitTransaction.mockRejectedValue(new Error('Horizon error'));
    await expect(castVote(42, PUBLIC_KEY)).rejects.toThrow('Horizon error');
  });

  it('propagates signing errors', async () => {
    mockProvider.signTransaction.mockRejectedValue(new Error('User rejected'));
    await expect(castVote(42, PUBLIC_KEY)).rejects.toThrow('User rejected');
  });
});
