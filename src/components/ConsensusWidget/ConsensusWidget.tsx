'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield } from 'lucide-react';
import { useChainState } from '@/hooks/useChainState';
import { getConsensusProgress } from '@/services/contractClient';
import {
  DEFAULT_CONSENSUS_THRESHOLD,
  calculateConsensusProgress,
  type ConsensusData,
} from './StateStateStateStateStateconsensusWidget';

export interface ConsensusWidgetProps {
  /** PR task ID to track consensus for. */
  taskId: string;
  /** Optional polling interval in ms (defaults to 3000). */
  pollIntervalMs?: number;
}

const POLL_INTERVAL_MS = 3_000;

function formatVotes(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function getProgressColor(percent: number): string {
  if (percent >= 100) return 'bg-emerald-500';
  if (percent >= 75) return 'bg-emerald-400';
  if (percent >= 50) return 'bg-amber-400';
  if (percent >= 25) return 'bg-orange-400';
  return 'bg-red-400';
}

function getStatusLabelKey(percent: number, threshold: number): string {
  if (percent >= 100) return 'consensusWidget.status.reached';
  if (percent >= 75) return 'consensusWidget.status.approaching';
  if (percent >= 50) return 'consensusWidget.status.inProgress';
  return 'consensusWidget.status.gathering';
}

export default function ConsensusWidget({
  taskId,
  pollIntervalMs = POLL_INTERVAL_MS,
}: ConsensusWidgetProps): ReactElement {
  const { t } = useTranslation();
  const [consensusData, setConsensusData] = useState<ConsensusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const latestRequestId = useRef(0);
  const { syncVersion } = useChainState({
    cacheKey: `task:${taskId}`,
    pollIntervalMs: Math.min(pollIntervalMs, 5000),
  });

  const fetchConsensus = useCallback(async () => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;

    try {
      const data = await getConsensusProgress(taskId);
      if (latestRequestId.current === requestId) {
        setConsensusData(data);
        setError(null);
      }
    } catch (err) {
      if (latestRequestId.current === requestId) {
        const message =
          err instanceof Error ? err.message : 'Failed to fetch consensus progress';
        setError(message);
        // Keep stale data visible if we have it
        if (!consensusData) {
          setConsensusData(null);
        }
      }
    } finally {
      if (latestRequestId.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [taskId, consensusData]);

  // Initial fetch and auto-refresh via chain state sync version
  useEffect(() => {
    setIsLoading(true);
    void fetchConsensus();
  }, [fetchConsensus, syncVersion]);

  // Polling fallback for real-time updates
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchConsensus();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchConsensus, pollIntervalMs]);

  const progressPercent = useMemo(() => {
    if (!consensusData) return 0;
    return calculateConsensusProgress(consensusData);
  }, [consensusData]);

  const threshold = consensusData?.threshold ?? DEFAULT_CONSENSUS_THRESHOLD;
  const currentWeight = consensusData?.currentWeight ?? 0;
  const approveWeight = consensusData?.approveWeight ?? 0;
  const rejectWeight = consensusData?.rejectWeight ?? 0;
  const isThresholdMet = progressPercent >= 100;
  const progressColor = getProgressColor(progressPercent);
  const statusLabelKey = getStatusLabelKey(progressPercent, threshold);

  return (
    <div
      className="w-full h-full flex flex-col gap-3"
      role="region"
      aria-label={t('consensusWidget.ariaLabel', { taskId })}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('consensusWidget.heading')}
          </h3>
        </div>
        <div
          className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
            isThresholdMet
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {t(statusLabelKey)}
        </div>
      </div>

      {/* Task ID */}
      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
        {t('consensusWidget.taskLabel', { taskId })}
      </p>

      {/* Progress bar area */}
      <div className="flex-1 flex flex-col justify-center gap-2">
        {isLoading && !consensusData ? (
          <div className="flex items-center justify-center py-4">
            <div
              className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            <span className="sr-only">{t('common.loading')}</span>
          </div>
        ) : error && !consensusData ? (
          <div className="text-center py-2">
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {t('consensusWidget.error')}
            </p>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                void fetchConsensus();
              }}
              className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
            >
              {t('consensusWidget.retry')}
            </button>
          </div>
        ) : (
          <>
            {/* Progress percentage display */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('consensusWidget.progressLabel')}
              </span>
              <span
                className={`text-lg font-bold transition-colors ${
                  isThresholdMet
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-800 dark:text-white'
                }`}
                aria-live="polite"
              >
                {progressPercent}%
              </span>
            </div>

            {/* Circular / Radial progress */}
            <div className="flex items-center justify-center py-2">
              <div className="relative w-24 h-24">
                {/* Background circle */}
                <svg
                  className="w-full h-full -rotate-90"
                  viewBox="0 0 100 100"
                  aria-hidden="true"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-slate-200 dark:text-slate-700"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 42}`}
                    strokeDashoffset={`${2 * Math.PI * 42 * (1 - progressPercent / 100)}`}
                    strokeLinecap="round"
                    className={`transition-all duration-700 ease-out ${progressColor}`}
                  />
                </svg>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-slate-900 dark:text-white">
                    {formatVotes(currentWeight)}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {t('consensusWidget.votes')}
                  </span>
                </div>
              </div>
            </div>

            {/* Vote breakdown */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 text-center">
                <span className="block text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  {t('consensusWidget.approve')}
                </span>
                <span className="block text-sm font-bold text-slate-900 dark:text-white">
                  {formatVotes(approveWeight)}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 text-center">
                <span className="block text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {t('consensusWidget.reject')}
                </span>
                <span className="block text-sm font-bold text-slate-900 dark:text-white">
                  {formatVotes(rejectWeight)}
                </span>
              </div>
            </div>

            {/* Threshold info */}
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-1">
              {isThresholdMet
                ? t('consensusWidget.thresholdMet', { threshold })
                : t('consensusWidget.thresholdNeeded', {
                    needed: threshold - currentWeight,
                    threshold,
                  })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}