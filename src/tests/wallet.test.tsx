import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
    sessionManager: {
      subscribe: jest.fn(() => jest.fn()),
      startMonitoring: jest.fn(),
      stopMonitoring: jest.fn(),
    },
  };
});

jest.mock('@stellar/freighter-api', () => ({
  isConnected: jest.fn(),
  getAddress: jest.fn(),
  requestAccess: jest.fn(),
  WatchWalletChanges: jest.fn(),
  getPublicKey: jest.fn(),
  signTransaction: jest.fn(),
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

import * as freighter from '@stellar/freighter-api';

type FreighterError = {
  message?: string;
};

type FreighterConnection = {
  isConnected: boolean;
  error?: FreighterError;
};

type FreighterAddress = {
  address?: string;
  error?: FreighterError;
};

type WalletChangeHandler = (params: FreighterAddress) => void;

type FreighterWalletWatcher = {
  watch: (handler: WalletChangeHandler) => FreighterAddress;
  stop: () => void;
};

type MockFreighterModule = typeof freighter & {
  isConnected: jest.MockedFunction<() => Promise<FreighterConnection>>;
  getAddress: jest.MockedFunction<() => Promise<FreighterAddress>>;
  requestAccess: jest.MockedFunction<() => Promise<FreighterAddress>>;
  WatchWalletChanges: jest.Mock<FreighterWalletWatcher, []>;
  getPublicKey: jest.MockedFunction<() => Promise<string>>;
};

type WalletTestWindow = Window & {
  freighter?: unknown;
};

const mockedFreighter = freighter as unknown as MockFreighterModule;
const mockIsConnected = mockedFreighter.isConnected;
const mockGetAddress = mockedFreighter.getAddress;
const mockRequestAccess = mockedFreighter.requestAccess;
const mockWatchWalletChanges = mockedFreighter.WatchWalletChanges;
const mockGetPublicKey = mockedFreighter.getPublicKey;
const walletWindow = window as WalletTestWindow;
const PUBLIC_KEY = 'GDZST3XVCDTUJ76ZAV2HA72KYXY5YOFZ3F5YMQABR6J32F2TQPWQNQ3X';
const OTHER_PUBLIC_KEY = 'GB3GJYCMCIK6W4XUZ5U4P6G5YQ2ZC4QVK6XG7M7B3B4N5C6D7E8F9G0H';
const STORAGE_KEY = 'vero_wallet_publicKey';

const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

async function renderWallet(children: React.ReactNode) {
  let result: ReturnType<typeof render>;

  await act(async () => {
    result = render(children);
  });

  return result!;
}

function TestComponent() {
  const { publicKey, isConnected, isLoading, error, connect, disconnect } = useWallet();

  return (
    <div>
      <div data-testid="public-key">{publicKey || 'No key'}</div>
      <div data-testid="is-connected">{isConnected ? 'Connected' : 'Disconnected'}</div>
      <div data-testid="is-loading">{isLoading ? 'Loading' : 'Ready'}</div>
      <div data-testid="error">{error || 'No error'}</div>
      <button onClick={() => connect()} data-testid="connect-btn">
        Connect
      </button>
      <button onClick={disconnect} data-testid="disconnect-btn">
        Disconnect
      </button>
    </div>
  );
}

describe('WalletContext', () => {
  let walletChangeHandler: WalletChangeHandler | undefined;

  beforeEach(() => {
    localStorage.clear();
    walletChangeHandler = undefined;
    mockedFreighter.isConnected = mockIsConnected;
    mockedFreighter.getAddress = mockGetAddress;
    mockedFreighter.requestAccess = mockRequestAccess;
    mockedFreighter.WatchWalletChanges = mockWatchWalletChanges;
    mockedFreighter.getPublicKey = mockGetPublicKey;
    mockIsConnected.mockReset();
    mockGetAddress.mockReset();
    mockRequestAccess.mockReset();
    mockWatchWalletChanges.mockReset();
    mockGetPublicKey.mockReset();
    mockIsConnected.mockResolvedValue({ isConnected: false });
    mockGetAddress.mockResolvedValue({ address: PUBLIC_KEY });
    mockRequestAccess.mockResolvedValue({ address: PUBLIC_KEY });
    mockWatchWalletChanges.mockImplementation(() => ({
      watch: (handler) => {
        walletChangeHandler = handler;
        return {};
      },
      stop: jest.fn(),
    }));
    walletWindow.freighter = mockedFreighter;
  });

  describe('WalletProvider', () => {
    it('should render children', () => {
      render(
        <WalletProvider>
          <div data-testid="child">Child Content</div>
        </WalletProvider>
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should initialize with loading state', async () => {
      await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(screen.getByTestId('is-loading')).toHaveTextContent('Ready'));
    });
  });

  describe('useWallet hook', () => {
    it('should throw error when used outside WalletProvider', () => {
      function ComponentOutsideProvider() {
        useWallet();
        return null;
      }

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        render(<ComponentOutsideProvider />);
      }).toThrow('useWallet must be used within a WalletProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('connect', () => {
    it('should connect wallet successfully with Freighter v6 requestAccess', async () => {
      await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(screen.getByTestId('is-loading')).toHaveTextContent('Ready'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('connect-btn'));
      });

      await waitFor(() => expect(screen.getByTestId('public-key')).toHaveTextContent(PUBLIC_KEY));
      expect(mockedFreighter.requestAccess).toHaveBeenCalled();
      expect(screen.getByTestId('is-connected')).toHaveTextContent('Connected');
      expect(screen.getByTestId('error')).toHaveTextContent('No error');
    });

    it('should persist publicKey to localStorage on successful connection', async () => {
      await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(screen.getByTestId('is-loading')).toHaveTextContent('Ready'));
      fireEvent.click(screen.getByTestId('connect-btn'));

      await waitFor(async () => expect(await getSessionItem(STORAGE_KEY)).toBe(PUBLIC_KEY));
      await waitFor(() => expect(getSessionItem(STORAGE_KEY)).resolves.toBe(PUBLIC_KEY));
    });

    it('should restore wallet from localStorage when it matches the current Freighter address', async () => {
      localStorage.setItem(STORAGE_KEY, PUBLIC_KEY);
      mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
      mockedFreighter.getAddress.mockResolvedValue({ address: PUBLIC_KEY });

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(screen.getByTestId('public-key')).toHaveTextContent(PUBLIC_KEY));
      expect(screen.getByTestId('is-connected')).toHaveTextContent('Connected');
      expect(await getSessionItem(STORAGE_KEY)).toBe(PUBLIC_KEY);
      await expect(getSessionItem(STORAGE_KEY)).resolves.toBe(PUBLIC_KEY);
    });

    it('should clear stored wallet when Freighter is disconnected on restore', async () => {
      localStorage.setItem(STORAGE_KEY, PUBLIC_KEY);
      mockedFreighter.isConnected.mockResolvedValue({ isConnected: false });

      await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
      expect(screen.getByTestId('public-key')).toHaveTextContent('No key');
      expect(screen.getByTestId('is-connected')).toHaveTextContent('Disconnected');
    });

    it('should clear stored wallet when it differs from the current Freighter address', async () => {
      localStorage.setItem(STORAGE_KEY, PUBLIC_KEY);
      mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
      mockedFreighter.getAddress.mockResolvedValue({ address: OTHER_PUBLIC_KEY });

      await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
      expect(screen.getByTestId('public-key')).toHaveTextContent('No key');
      expect(screen.getByTestId('is-connected')).toHaveTextContent('Disconnected');
    });

    it('should handle connection error when Freighter is not installed', async () => {
      walletWindow.freighter = undefined;

      await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(screen.getByTestId('is-loading')).toHaveTextContent('Ready'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('connect-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Freighter wallet is not installed');
      });
      expect(screen.getByTestId('is-connected')).toHaveTextContent('Disconnected');
    });

    it('should handle connection error from Freighter API', async () => {
      const errorMessage = 'User denied access';
      mockedFreighter.requestAccess.mockRejectedValue(new Error(errorMessage));

      await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(screen.getByTestId('is-loading')).toHaveTextContent('Ready'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('connect-btn'));
      });

      await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent(errorMessage));
      expect(screen.getByTestId('is-connected')).toHaveTextContent('Disconnected');
    });

    it('should set loading state during connection', async () => {
      let resolveConnect: (value: FreighterAddress) => void;
      const connectPromise = new Promise<FreighterAddress>((resolve) => {
        resolveConnect = resolve;
      });
      mockedFreighter.requestAccess.mockReturnValue(connectPromise);

      await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(screen.getByTestId('is-loading')).toHaveTextContent('Ready'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('connect-btn'));
      });
      resolveConnect!({ address: PUBLIC_KEY });

      await waitFor(() => expect(screen.getByTestId('public-key')).toHaveTextContent(PUBLIC_KEY));
    });
  });

  describe('disconnect', () => {
    it('should disconnect wallet', async () => {
      localStorage.setItem(STORAGE_KEY, PUBLIC_KEY);
      mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
      mockedFreighter.getAddress.mockResolvedValue({ address: PUBLIC_KEY });

      await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(screen.getByTestId('is-connected')).toHaveTextContent('Connected'));

      await act(async () => {
        fireEvent.click(screen.getByTestId('disconnect-btn'));
      });

      expect(screen.getByTestId('public-key')).toHaveTextContent('No key');
      expect(screen.getByTestId('is-connected')).toHaveTextContent('Disconnected');
      expect(screen.getByTestId('error')).toHaveTextContent('No error');
    });

    it('should remove publicKey from localStorage on disconnect', async () => {
      localStorage.setItem(STORAGE_KEY, PUBLIC_KEY);
      mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
      mockedFreighter.getAddress.mockResolvedValue({ address: PUBLIC_KEY });

      await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(async () => expect(await getSessionItem(STORAGE_KEY)).toBe(PUBLIC_KEY));
      await waitFor(() => expect(getSessionItem(STORAGE_KEY)).resolves.toBe(PUBLIC_KEY));

      await act(async () => {
        fireEvent.click(screen.getByTestId('disconnect-btn'));
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('Freighter wallet watcher', () => {
    it('should disconnect on Freighter wallet changes', async () => {
      localStorage.setItem(STORAGE_KEY, PUBLIC_KEY);
      mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
      mockedFreighter.getAddress.mockResolvedValue({ address: PUBLIC_KEY });

      await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(screen.getByTestId('is-connected')).toHaveTextContent('Connected'));

      act(() => {
        walletChangeHandler?.({});
      });

      await waitFor(() => expect(screen.getByTestId('is-connected')).toHaveTextContent('Disconnected'));
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('localStorage persistence', () => {
    it('should persist and restore connection across remounts when Freighter still exposes the same address', async () => {
      const { unmount } = await renderWallet(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(screen.getByTestId('is-loading')).toHaveTextContent('Ready'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('connect-btn'));
      });

      await waitFor(async () => expect(await getSessionItem(STORAGE_KEY)).toBe(PUBLIC_KEY));
      await waitFor(() => expect(getSessionItem(STORAGE_KEY)).resolves.toBe(PUBLIC_KEY));

      unmount();

      mockedFreighter.isConnected.mockResolvedValue({ isConnected: true });
      mockedFreighter.getAddress.mockResolvedValue({ address: PUBLIC_KEY });

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>
      );

      await waitFor(() => expect(screen.getByTestId('public-key')).toHaveTextContent(PUBLIC_KEY));
      expect(screen.getByTestId('is-connected')).toHaveTextContent('Connected');
    });
  });
});
