'use client';

import type { ReactElement } from 'react';
import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { useTranslation } from 'react-i18next';

export interface VoteProgressBarProps {
  /** Number of approve votes */
  approveCount: number;
  /** Number of reject votes */
  rejectCount: number;
  /** Minimum votes needed to reach quorum */
  quorum?: number;
}

interface TooltipPayload {
  name: string;
  value: number;
  payload: { label: string; count: number; fill: string };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps): ReactElement | null {
  const { t } = useTranslation();

  if (!active || !payload?.length) {
    return null;
  }

  const entry = payload[0];

  return (
    <div
      role="tooltip"
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 shadow-lg text-xs"
    >
      <p className="font-semibold text-slate-800 dark:text-slate-100">{entry.payload.label}</p>
      <p className="text-slate-600 dark:text-slate-300">
        {t('voteProgressBar.tooltipVotes', { count: entry.payload.count })}
      </p>
    </div>
  );
}

export default function VoteProgressBar({
  approveCount,
  rejectCount,
  quorum,
}: VoteProgressBarProps): ReactElement {
  const { t } = useTranslation();

  const total = approveCount + rejectCount;

  const data = useMemo(
    () => [
      {
        label: t('voteProgressBar.approve'),
        count: approveCount,
        fill: '#22c55e', // green-500
      },
      {
        label: t('voteProgressBar.reject'),
        count: rejectCount,
        fill: '#ef4444', // red-500
      },
    ],
    [approveCount, rejectCount, t],
  );

  const approvePercent = total > 0 ? Math.round((approveCount / total) * 100) : 0;
  const rejectPercent = total > 0 ? 100 - approvePercent : 0;

  return (
    <div
      aria-label={t('voteProgressBar.ariaLabel', { approveCount, rejectCount })}
      className="w-full"
    >
      {/* Summary row */}
      <div className="flex items-center justify-between mb-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
          {t('voteProgressBar.approve')}
          <span className="font-semibold text-slate-700 dark:text-slate-200 ml-0.5">
            {approveCount}
          </span>
          <span className="text-slate-400">({approvePercent}%)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-slate-400">({rejectPercent}%)</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200 mr-0.5">
            {rejectCount}
          </span>
          {t('voteProgressBar.reject')}
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-1" aria-hidden="true" />
        </span>
      </div>

      {/* Recharts bar */}
      <ResponsiveContainer width="100%" height={36}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          barSize={18}
        >
          <XAxis type="number" domain={[0, Math.max(total, 1)]} hide />
          <YAxis type="category" dataKey="label" hide />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'transparent' }}
          />
          <Bar dataKey="count" radius={[4, 4, 4, 4]} isAnimationActive background={{ fill: '#f1f5f9', radius: 4 }}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.fill} />
            ))}
            <LabelList
              dataKey="count"
              position="insideRight"
              style={{ fill: '#fff', fontSize: 11, fontWeight: 600 }}
              formatter={(v: unknown) => (typeof v === 'number' && v > 0 ? v : '')}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Quorum indicator */}
      {quorum !== undefined && (
        <p
          className={`mt-1 text-xs font-medium ${
            approveCount >= quorum
              ? 'text-green-600 dark:text-green-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
          aria-live="polite"
        >
          {approveCount >= quorum
            ? t('voteProgressBar.quorumReached')
            : t('voteProgressBar.quorumNeeded', { needed: quorum - approveCount, quorum })}
        </p>
      )}
    </div>
  );
}
