import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletProvider, useWallet } from '@/context/WalletContext';
import { getSessionItem } from '@/auth/session';

jest.mock('@/auth/session', () => {
  const store: Record<string, string> = {};
  return {
    setSessionItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
      try { localStorage.setItem(key, value); } catch {}
    }),
    getSessionItem: jest.fn(async (key: string) => store[key] ?? null),
    removeSessionItem: jest.fn((key: string) => {
      delete store[key];
      try { localStorage.removeItem(key); } catch {}
    }),
    sessionManager: {
      subscribe: jest.fn(() => jest.fn()),
      startMonitoring: jest.fn(),
      stopMonitoring: jest.fn(),
    },
  };
});

jest.mock('@stellar/freighter-api', () => ({
  isConnected: jest.fn().mockResolvedValue({ isConnected: false }),
  getAddress: jest.fn(),
  requestAccess: jest.fn(),
  WatchWalletChanges: jest.fn(() => ({ watch: jest.fn(() => ({})), stop: jest.fn() })),
  getPublicKey: jest.fn(),
}));

jest.mock('@/lib/stellar-interact', () => ({
  getReputation: jest.fn(async () => 0),
}));
jest.mock('@/hooks/useChainState', () => ({
  useChainState: () => ({
    forceSync: jest.fn(),
    isSyncing: false,
    status: 'idle',
    syncVersion: 0,
  }),
}));

const RABET_KEY = 'GRABET3XVCDTUJ76ZAV2HA72KYXY5YOFZ3F5YMQABR6J32F2TQPWQABCD';
const STORAGE_KEY = 'vero_wallet_publicKey';
const PROVIDER_STORAGE_KEY = 'vero_wallet_provider';

type TestWindow = {
  rabet?: { connect: jest.Mock };
};

describe('WalletContext multi-provider support', () => {
  const testWindow = window as unknown as TestWindow;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    delete testWindow.rabet;
  });

  function TestComponent() {
    const { publicKey, isConnected, activeProvider, connect, isLoading } = useWallet();
    return (
      <div>
        <div data-testid="pk">{publicKey}</div>
        <div data-testid="connected">{isConnected ? 'Connected' : 'Disconnected'}</div>
        <div data-testid="provider">{activeProvider ?? 'none'}</div>
        <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
        <button data-testid="connect-btn" onClick={() => connect('rabet')}>
          Connect Rabet
        </button>
      </div>
    );
  }

  it('connects through Rabet and persists the active provider', async () => {
    testWindow.rabet = { connect: jest.fn().mockResolvedValue({ publicKey: RABET_KEY }) };

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));

    fireEvent.click(screen.getByTestId('connect-btn'));

    await waitFor(() => expect(screen.getByTestId('pk')).toHaveTextContent(RABET_KEY));
    expect(screen.getByTestId('provider')).toHaveTextContent('rabet');
    await waitFor(() => expect(getSessionItem(STORAGE_KEY)).resolves.toBe(RABET_KEY));
    await waitFor(() => expect(getSessionItem(PROVIDER_STORAGE_KEY)).resolves.toBe('rabet'));
  });
});
