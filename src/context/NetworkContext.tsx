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
import { AlertTriangle } from 'lucide-react';
import {
  defaultNetworkConfig,
  getUrlValidationError,
  validateUrl,
  type NetworkConfig,
} from '@/services/rpc';

const STORAGE_KEY = 'vero_network_config';

export const CUSTOM_NETWORK_CONFIG_WARNING =
  'Custom Horizon or Soroban RPC endpoints are active. Role and consensus data are loaded from these servers — only use endpoints you trust.';

interface NetworkContextType {
  networkConfig: NetworkConfig;
  isCustomConfig: boolean;
  urlError: string | null;
  clearUrlError: () => void;
  setHorizonUrl: (url: string) => boolean;
  setSorobanRpcUrl: (url: string) => boolean;
  setNetworkPassphrase: (passphrase: string) => void;
  resetToDefaults: () => void;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [networkConfig, setNetworkConfig] =
    useState<NetworkConfig>(defaultNetworkConfig);
  const [urlError, setUrlError] = useState<string | null>(null);

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

  const clearUrlError = useCallback(() => {
    setUrlError(null);
  }, []);

  const setHorizonUrl = useCallback((url: string): boolean => {
    const error = getUrlValidationError(url);
    if (error) {
      setUrlError(error);
      return false;
    }
    setUrlError(null);
    setNetworkConfig((prev) => ({ ...prev, horizonUrl: url }));
    return true;
  }, []);

  const setSorobanRpcUrl = useCallback((url: string): boolean => {
    const error = getUrlValidationError(url);
    if (error) {
      setUrlError(error);
      return false;
    }
    setUrlError(null);
    setNetworkConfig((prev) => ({ ...prev, sorobanRpcUrl: url }));
    return true;
  }, []);

  const setNetworkPassphrase = useCallback((passphrase: string) => {
    setNetworkConfig((prev) => ({ ...prev, networkPassphrase: passphrase }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setUrlError(null);
    setNetworkConfig(defaultNetworkConfig);
  }, []);

  const value = useMemo<NetworkContextType>(
    () => ({
      networkConfig,
      isCustomConfig,
      urlError,
      clearUrlError,
      setHorizonUrl,
      setSorobanRpcUrl,
      setNetworkPassphrase,
      resetToDefaults,
    }),
    [
      networkConfig,
      isCustomConfig,
      urlError,
      clearUrlError,
      setHorizonUrl,
      setSorobanRpcUrl,
      setNetworkPassphrase,
      resetToDefaults,
    ]
  );

  return (
    <NetworkContext.Provider value={value}>
      {isCustomConfig ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="custom-network-config-warning"
          className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Custom network endpoints in use</p>
            <p className="mt-0.5 text-sm opacity-90">{CUSTOM_NETWORK_CONFIG_WARNING}</p>
          </div>
        </div>
      ) : null}
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
