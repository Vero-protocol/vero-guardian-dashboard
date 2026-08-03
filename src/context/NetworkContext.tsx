
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  defaultNetworkConfig,
  validateUrl,
  type NetworkConfig,
} from '@/services/rpc';

const STORAGE_KEY = 'vero_network_config';

interface NetworkContextType {
  networkConfig: NetworkConfig;
  isCustomConfig: boolean;
  setHorizonUrl: (url: string) => void;
  setSorobanRpcUrl: (url: string) => void;
  setNetworkPassphrase: (passphrase: string) => void;
  resetToDefaults: () => void;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [networkConfig, setNetworkConfig] =
    useState<NetworkConfig>(defaultNetworkConfig);

  // Load saved config on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<NetworkConfig>;
        setNetworkConfig({
          horizonUrl:
            parsed.horizonUrl && validateUrl(parsed.horizonUrl)
              ? parsed.horizonUrl
              : defaultNetworkConfig.horizonUrl,
          sorobanRpcUrl:
            parsed.sorobanRpcUrl && validateUrl(parsed.sorobanRpcUrl)
              ? parsed.sorobanRpcUrl
              : defaultNetworkConfig.sorobanRpcUrl,
          networkPassphrase:
            parsed.networkPassphrase || defaultNetworkConfig.networkPassphrase,
        });
      }
    } catch {
      // Ignore invalid stored config
    }
  }, []);

  // Save config to local storage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(networkConfig));
    } catch {
      // Ignore storage failures, matching the load path above.
    }
  }, [networkConfig]);

  const isCustomConfig = useMemo(
    () =>
      networkConfig.horizonUrl !== defaultNetworkConfig.horizonUrl ||
      networkConfig.sorobanRpcUrl !== defaultNetworkConfig.sorobanRpcUrl ||
      networkConfig.networkPassphrase !== defaultNetworkConfig.networkPassphrase,
    [networkConfig]
  );

  const setHorizonUrl = useCallback((url: string) => {
    if (validateUrl(url)) {
      setNetworkConfig((prev) => ({ ...prev, horizonUrl: url }));
    }
  }, []);

  const setSorobanRpcUrl = useCallback((url: string) => {
    if (validateUrl(url)) {
      setNetworkConfig((prev) => ({ ...prev, sorobanRpcUrl: url }));
    }
  }, []);

  const setNetworkPassphrase = useCallback((passphrase: string) => {
    setNetworkConfig((prev) => ({ ...prev, networkPassphrase: passphrase }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setNetworkConfig(defaultNetworkConfig);
  }, []);

  const value = useMemo<NetworkContextType>(
    () => ({
      networkConfig,
      isCustomConfig,
      setHorizonUrl,
      setSorobanRpcUrl,
      setNetworkPassphrase,
      resetToDefaults,
    }),
    [
      networkConfig,
      isCustomConfig,
      setHorizonUrl,
      setSorobanRpcUrl,
      setNetworkPassphrase,
      resetToDefaults,
    ]
  );

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextType {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}
