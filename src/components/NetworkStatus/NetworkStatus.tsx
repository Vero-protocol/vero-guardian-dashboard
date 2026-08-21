'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, WifiOff, Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNetwork } from '@/context/NetworkContext';
import { getUrlValidationError, defaultNetworkConfig } from '@/services/rpc';
const RPC_HEALTH_REQUEST_BODY = '{"jsonrpc":"2.0","id":1,"method":"getHealth"}';

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const DEGRADED_LATENCY_MS = 1_000;
export const RPC_REQUEST_TIMEOUT_MS = 8_000;

export type NetworkHealthStatus = 'healthy' | 'degraded' | 'offline';

export interface RpcHealthSnapshot {
  status: NetworkHealthStatus;
  latencyMs: number | null;
  message: string;
}

interface RpcHealthResponse {
  result?: {
    status?: string;
  };
  error?: unknown;
}

function describeRpcError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return 'RPC getHealth returned an error';
}

interface NetworkStatusProps {
  endpoint?: string;
  fetcher?: typeof fetch;
  now?: () => number;
}

const INITIAL_SNAPSHOT: RpcHealthSnapshot = {
  status: 'degraded',
  latencyMs: null,
  message: 'Checking RPC health...',
};

const STATUS_STYLES = {
  healthy: {
    labelKey: 'network.healthy',
    icon: CheckCircle2,
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  degraded: {
    labelKey: 'network.degraded',
    icon: Clock3,
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  offline: {
    labelKey: 'network.offline',
    icon: WifiOff,
    badge: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400',
    dot: 'bg-red-500',
  },
} as const;

function translateNetworkMessage(
  message: string,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (message === INITIAL_SNAPSHOT.message) {
    return t('network.initialMessage');
  }

  if (message === 'RPC getHealth is responding normally') {
    return t('network.normal');
  }

  if (message === 'RPC returned an invalid health response. Switch RPC endpoints if this continues.') {
    return t('network.invalidJson');
  }

  if (message === 'RPC responded slowly. Network requests may take longer than expected.') {
    return t('network.slow');
  }

  if (message === 'RPC health status unavailable. Switch RPC endpoints if this continues.') {
    return t('network.unavailable');
  }

  if (message.startsWith('RPC returned HTTP ')) {
    const status = message.match(/RPC returned HTTP (\d+)/)?.[1] ?? '';
    return t('network.httpError', { status });
  }

  if (message.startsWith('RPC unreachable at ')) {
    const endpoint = message
      .replace('RPC unreachable at ', '')
      .replace('. Check your network connection or switch RPC endpoints.', '');
    return t('network.unreachable', { endpoint });
  }

  if (message.startsWith('RPC getHealth error: ')) {
    return t('network.healthError', { message: message.replace('RPC getHealth error: ', '') });
  }

  if (message.startsWith('RPC reported ')) {
    return t('network.reportedStatus', { status: message.replace('RPC reported ', '') });
  }

  return message;
}

export async function fetchRpcHealth(
  endpoint: string,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<RpcHealthSnapshot> {
  const startedAt = now();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, RPC_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: RPC_HEALTH_REQUEST_BODY,
      cache: 'no-store',
      signal: abortController.signal,
    });
    const latencyMs = Math.max(0, Math.round(now() - startedAt));

    if (!response.ok) {
      return {
        status: 'offline',
        latencyMs,
        message: `RPC returned HTTP ${response.status}. Network requests may fail; try again or switch RPC endpoints.`,
      };
    }

    let payload: RpcHealthResponse;
    try {
      payload = (await response.json()) as RpcHealthResponse;
    } catch (error) {
      if (abortController.signal.aborted) {
        console.error('Stellar RPC getHealth request failed', { endpoint, error });
        return {
          status: 'offline',
          latencyMs: null,
          message: `RPC unreachable at ${endpoint}. Check your network connection or switch RPC endpoints.`,
        };
      }

      console.error('Stellar RPC getHealth returned invalid JSON', { endpoint, error });
      return {
        status: 'degraded',
        latencyMs,
        message: 'RPC returned an invalid health response. Switch RPC endpoints if this continues.',
      };
    }

    const reportedStatus = payload.result?.status;

    if (payload.error) {
      return {
        status: 'degraded',
        latencyMs,
        message: `RPC getHealth error: ${describeRpcError(payload.error)}`,
      };
    }

    if (reportedStatus !== 'healthy') {
      return {
        status: 'degraded',
        latencyMs,
        message: reportedStatus ? `RPC reported ${reportedStatus}` : 'RPC health status unavailable. Switch RPC endpoints if this continues.',
      };
    }

    if (latencyMs >= DEGRADED_LATENCY_MS) {
      return {
        status: 'degraded',
        latencyMs,
        message: 'RPC responded slowly. Network requests may take longer than expected.',
      };
    }

    return {
      status: 'healthy',
      latencyMs,
      message: 'RPC getHealth is responding normally',
    };
  } catch (error) {
    console.error('Stellar RPC getHealth request failed', { endpoint, error });
    return {
      status: 'offline',
      latencyMs: null,
      message: `RPC unreachable at ${endpoint}. Check your network connection or switch RPC endpoints.`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function NetworkStatus({
  endpoint,
  fetcher = fetch,
  now = Date.now,
}: NetworkStatusProps) {
  const { t } = useTranslation();
  const {
    networkConfig,
    urlError,
    clearUrlError,
    setHorizonUrl,
    setSorobanRpcUrl,
    setNetworkPassphrase,
    resetToDefaults,
  } = useNetwork();
  const [showSettings, setShowSettings] = useState(false);
  const [localHorizonUrl, setLocalHorizonUrl] = useState(networkConfig.horizonUrl);
  const [localSorobanRpcUrl, setLocalSorobanRpcUrl] = useState(networkConfig.sorobanRpcUrl);
  const [localNetworkPassphrase, setLocalNetworkPassphrase] = useState(
    networkConfig.networkPassphrase
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const rpcEndpoint = endpoint ?? networkConfig.sorobanRpcUrl;
  const [snapshot, setSnapshot] = useState<RpcHealthSnapshot>(INITIAL_SNAPSHOT);
  const latestCheckId = useRef(0);
  const statusStyle = STATUS_STYLES[snapshot.status];
  const StatusIcon = statusStyle.icon;

  useEffect(() => {
    let isMounted = true;

    async function checkHealth() {
      const checkId = latestCheckId.current + 1;
      latestCheckId.current = checkId;
      const nextSnapshot = await fetchRpcHealth(rpcEndpoint, fetcher, now);
      if (!isMounted || checkId !== latestCheckId.current) {
        return;
      }
      setSnapshot((currentSnapshot) => {
        const sameStatusAndMessage =
          currentSnapshot.status === nextSnapshot.status &&
          currentSnapshot.message === nextSnapshot.message;
        const sameVisibleState =
          sameStatusAndMessage &&
          (nextSnapshot.status === 'offline' || currentSnapshot.latencyMs === nextSnapshot.latencyMs);

        return sameVisibleState ? currentSnapshot : nextSnapshot;
      });
    }

    void checkHealth();
    const intervalId = window.setInterval(() => {
      void checkHealth();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [fetcher, now, rpcEndpoint]);

  useEffect(() => {
    setLocalHorizonUrl(networkConfig.horizonUrl);
    setLocalSorobanRpcUrl(networkConfig.sorobanRpcUrl);
    setLocalNetworkPassphrase(networkConfig.networkPassphrase);
  }, [networkConfig]);

  const handleSaveSettings = () => {
    const horizonError = getUrlValidationError(localHorizonUrl);
    if (horizonError) {
      setSettingsError(`Horizon URL: ${horizonError}`);
      return;
    }

    const sorobanError = getUrlValidationError(localSorobanRpcUrl);
    if (sorobanError) {
      setSettingsError(`Soroban RPC URL: ${sorobanError}`);
      return;
    }

    setHorizonUrl(localHorizonUrl);
    setSorobanRpcUrl(localSorobanRpcUrl);
    setNetworkPassphrase(localNetworkPassphrase);
    setSettingsError(null);
    clearUrlError();
    setShowSettings(false);
  };

  const handleReset = () => {
    resetToDefaults();
    setSettingsError(null);
    setShowSettings(false);
  };

  const displayedSettingsError = settingsError ?? urlError;

  return (
    <section
      aria-label={t('network.ariaLabel')}
      aria-live="polite"
      role={snapshot.status === 'offline' ? 'alert' : 'status'}
      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/60 md:max-w-2xl"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('network.heading')}</h2>
          </div>
          <p className="font-mono text-xs text-slate-600 break-all dark:text-slate-400">{rpcEndpoint}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{translateNetworkMessage(snapshot.message, t)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium ${statusStyle.badge}`}>
            <span data-testid="rpc-status-dot" className={`h-2 w-2 rounded-full ${statusStyle.dot}`} aria-hidden="true" />
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
            {t(statusStyle.labelKey)}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            {snapshot.latencyMs === null ? t('network.latencyEmpty') : t('network.latency', { latency: snapshot.latencyMs })}
          </span>
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4 inline-block mr-1" />
            Settings
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">Network Settings</h3>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            {displayedSettingsError ? (
              <p
                role="alert"
                data-testid="network-settings-url-error"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
              >
                {displayedSettingsError}
              </p>
            ) : null}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Horizon URL
              </label>
              <input
                type="text"
                value={localHorizonUrl}
                onChange={(e) => {
                  setLocalHorizonUrl(e.target.value);
                  setSettingsError(null);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                placeholder={defaultNetworkConfig.horizonUrl}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Soroban RPC URL
              </label>
              <input
                type="text"
                value={localSorobanRpcUrl}
                onChange={(e) => {
                  setLocalSorobanRpcUrl(e.target.value);
                  setSettingsError(null);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                placeholder={defaultNetworkConfig.sorobanRpcUrl}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Network Passphrase
              </label>
              <input
                type="text"
                value={localNetworkPassphrase}
                onChange={(e) => setLocalNetworkPassphrase(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                placeholder={defaultNetworkConfig.networkPassphrase}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveSettings}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
