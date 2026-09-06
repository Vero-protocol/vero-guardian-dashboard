'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_WALLET_PROVIDER_ID,
  freighterClient,
  getWalletProvider,
  isFreighterAvailable,
  isWalletProviderId,
  listWalletProviders,
  readCurrentFreighterPublicKey,
  type WalletProviderId,
  type WalletProviderInfo,
} from '@/lib/wallets';
import { getReputation } from '@/lib/stellar-interact';
import { useNetwork } from '@/context/NetworkContext';
import { useChainState } from '@/hooks/useChainState';
import { useEvents } from '@/hooks/useEvents';
import { getSessionItem, removeSessionItem, setSessionItem, sessionManager } from '@/auth/session';

const STORAGE_KEY = 'vero_wallet_publicKey';
const PROVIDER_STORAGE_KEY = 'vero_wallet_provider';
const FREIGHTER_EVENT = 'freighter-account-change';

interface WalletContextType {
  publicKey: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  reputation: number;
  /** The provider used for the current connection, if any. */
  activeProvider: WalletProviderId | null;
  /** Detected Stellar wallet providers and their availability. */
  availableProviders: WalletProviderInfo[];
  /** Connect with a specific provider; defaults to Freighter when omitted. */
  connect: (providerId?: WalletProviderId) => Promise<void>;
  disconnect: () => void;
  /**
   * DEV-ONLY: Manually override the active public key without going through
   * a real wallet handshake. Always a no-op in production.
   */
  setMockPublicKey: (key: string) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reputation, setReputation] = useState(0);
  const [activeProvider, setActiveProvider] = useState<WalletProviderId | null>(null);
  const [availableProviders, setAvailableProviders] = useState<WalletProviderInfo[]>([]);
  const reputationRequestIdRef = useRef(0);
  const { syncVersion: accountSyncVersion } = useChainState({
    cacheKeys: publicKey ? [`account:${publicKey}`, `reputation:${publicKey}`] : ['wallet'],
  });
  const { emit } = useEvents();
  const { networkConfig } = useNetwork();

  // Detect installed wallet extensions once on the client.
  useEffect(() => {
    setAvailableProviders(listWalletProviders());
  }, []);

  const applyVerifiedPublicKey = useCallback(
    (nextPublicKey: string, providerId: WalletProviderId = DEFAULT_WALLET_PROVIDER_ID) => {
      void setSessionItem(STORAGE_KEY, nextPublicKey).catch((err) => {
        console.error('Failed to store public key:', err);
      });
      void setSessionItem(PROVIDER_STORAGE_KEY, providerId).catch((err) => {
        console.error('Failed to store provider ID:', err);
      });
      setPublicKey(nextPublicKey);
      setActiveProvider(providerId);
      setReputation(0);
      setError(null);
    },
    []
  );

  const clearWalletState = useCallback((nextError: string | null = null) => {
    removeSessionItem(STORAGE_KEY);
    removeSessionItem(PROVIDER_STORAGE_KEY);
    removeSessionItem('vero_wallet_last_active');
    setPublicKey(null);
    setActiveProvider(null);
    setReputation(0);
    setError(nextError);
  }, []);

  const refreshVerifiedWallet = useCallback(async (showLoading: boolean) => {
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const currentPublicKey = await readCurrentFreighterPublicKey();
      if (currentPublicKey) {
        applyVerifiedPublicKey(currentPublicKey);
      } else {
        clearWalletState();
      }
    } catch (restoreError) {
      console.error('Failed to verify wallet connection:', restoreError);
      clearWalletState(getErrorMessage(restoreError, 'Failed to verify wallet connection'));
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [applyVerifiedPublicKey, clearWalletState]);

  useEffect(() => {
    let isMounted = true;

    const initializeWallet = async () => {
      setIsLoading(true);

      try {
        const storedPublicKey = await getSessionItem(STORAGE_KEY);
        const storedProvider = await getSessionItem(PROVIDER_STORAGE_KEY);

        // Only Freighter supports silent session restore; other providers
        // require an explicit reconnect after a reload.
        if (storedProvider && storedProvider !== DEFAULT_WALLET_PROVIDER_ID) {
          clearWalletState();
          return;
        }

        const currentPublicKey = await readCurrentFreighterPublicKey();
        if (!isMounted) {
          return;
        }

        if (!currentPublicKey) {
          clearWalletState();
          return;
        }

        if (!storedPublicKey || storedPublicKey === currentPublicKey) {
          applyVerifiedPublicKey(currentPublicKey);
          return;
        }

        clearWalletState();
      } catch (restoreError) {
        if (!isMounted) {
          return;
        }

        console.error('Failed to initialize wallet:', restoreError);
        clearWalletState(getErrorMessage(restoreError, 'Failed to initialize wallet'));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void initializeWallet();

    return () => {
      isMounted = false;
    };
  }, [applyVerifiedPublicKey, clearWalletState]);

  useEffect(() => {
    const requestId = reputationRequestIdRef.current + 1;
    reputationRequestIdRef.current = requestId;

    if (!publicKey) {
      setReputation(0);
      return;
    }

    const currentPublicKey = publicKey;

    async function refreshReputation() {
      try {
        const nextReputation = await getReputation(currentPublicKey, networkConfig.horizonUrl);
        if (reputationRequestIdRef.current === requestId) {
          setReputation(nextReputation);
        }
      } catch (reputationError) {
        if (reputationRequestIdRef.current !== requestId) {
          return;
        }

        console.error('Failed to refresh on-chain reputation:', reputationError);
        setReputation(0);
      }
    }

    void refreshReputation();

    return () => {
      reputationRequestIdRef.current += 1;
    };
  }, [accountSyncVersion, publicKey]);

  useEffect(() => {
    const handleAccountChange = () => {
      void refreshVerifiedWallet(false);
    };

    window.addEventListener(FREIGHTER_EVENT, handleAccountChange);

    const WatchWalletChanges = isFreighterAvailable()
      ? freighterClient.WatchWalletChanges
      : undefined;
    const watcher = typeof WatchWalletChanges === 'function' ? new WatchWalletChanges() : null;
    const watchResult = watcher?.watch(({ address, error: watchError }) => {
      if (watchError || !address) {
        clearWalletState(
          watchError ? getErrorMessage(watchError, 'Freighter wallet changed.') : null
        );
        return;
      }

      applyVerifiedPublicKey(address);
    });

    if (watchResult?.error) {
      console.warn('Unable to watch Freighter wallet changes:', watchResult.error);
    }

    return () => {
      window.removeEventListener(FREIGHTER_EVENT, handleAccountChange);
      watcher?.stop();
    };
  }, [applyVerifiedPublicKey, clearWalletState, refreshVerifiedWallet]);

  const connect = useCallback(
    async (providerArg?: WalletProviderId) => {
      // Guard against being used directly as an event handler (onClick={connect}),
      // which would otherwise pass a DOM event in place of a provider id.
      const providerId = isWalletProviderId(providerArg) ? providerArg : DEFAULT_WALLET_PROVIDER_ID;

      setIsLoading(true);
      setError(null);

      try {
        const provider = getWalletProvider(providerId);
        const nextPublicKey = await provider.connect();
        applyVerifiedPublicKey(nextPublicKey, providerId);
        emit({ type: 'wallet_connected', actor: nextPublicKey, resource: 'wallet', resourceId: providerId });
      } catch (connectError) {
        const message = getErrorMessage(connectError, 'Failed to connect wallet');
        console.error('Wallet connection error:', connectError);
        clearWalletState(message);
      } finally {
        setIsLoading(false);
      }
    },
    [applyVerifiedPublicKey, clearWalletState, emit]
  );

  const disconnect = useCallback(() => {
    if (publicKey) {
      emit({ type: 'wallet_disconnected', actor: publicKey, resource: 'wallet', resourceId: activeProvider ?? undefined });
    }
    clearWalletState();
  }, [publicKey, activeProvider, clearWalletState, emit]);

  /** DEV-ONLY: override the active public key for local development convenience. */
  const setMockPublicKey = useCallback(
    (key: string) => {
      if (process.env.NODE_ENV === 'production') {
        return;
      }
      applyVerifiedPublicKey(key, DEFAULT_WALLET_PROVIDER_ID);
    },
    [applyVerifiedPublicKey]
  );

  useEffect(() => {
    const unsubscribe = sessionManager.subscribe(() => {
      disconnect();
    });

    if (publicKey) {
      sessionManager.startMonitoring();
    } else {
      sessionManager.stopMonitoring();
    }

    return () => {
      unsubscribe();
      sessionManager.stopMonitoring();
    };
  }, [publicKey, disconnect]);

  const value = useMemo<WalletContextType>(
    () => ({
      publicKey,
      isConnected: publicKey !== null,
      isLoading,
      error,
      reputation,
      activeProvider,
      availableProviders,
      connect,
      disconnect,
      setMockPublicKey,
    }),
    [activeProvider, availableProviders, connect, disconnect, error, isLoading, publicKey, reputation, setMockPublicKey]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
