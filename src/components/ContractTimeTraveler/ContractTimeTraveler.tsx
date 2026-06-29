'use client';

import { type ReactElement } from 'react';
import { ChevronLeft, ChevronRight, Clock, GitCompare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlayback } from '@/hooks/usePlayback';
import {
  DEFAULT_CONTRACT_HISTORY,
  formatSnapshotTime,
  formatStateValue,
  type ContractStateSnapshot,
  type SnapshotDiff,
} from './StateStateStateStateStatecontractTimeTravelerState';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SliderProps {
  value: number;
  max: number;
  onChange: (index: number) => void;
  snapshots: readonly ContractStateSnapshot[];
}

function TimelineSlider({ value, max, onChange, snapshots }: SliderProps): ReactElement {
  const { t } = useTranslation();
  const current = snapshots[value];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          aria-label={t('contractTimeTraveler.previous')}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>

        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={t('contractTimeTraveler.sliderAriaLabel')}
          aria-valuetext={
            current
              ? t('contractTimeTraveler.sliderValueText', {
                  index: value + 1,
                  total: max + 1,
                  label: current.label ?? formatSnapshotTime(current.timestamp),
                })
              : undefined
          }
          className="flex-1 h-2 rounded-full appearance-none cursor-pointer accent-indigo-600 bg-slate-200 dark:bg-slate-700"
        />

        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value === max}
          aria-label={t('contractTimeTraveler.next')}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Position indicator */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 select-none">
        <span>{snapshots[0] ? formatSnapshotTime(snapshots[0].timestamp) : ''}</span>
        <span className="font-medium text-indigo-600 dark:text-indigo-400">
          {t('contractTimeTraveler.position', { index: value + 1, total: max + 1 })}
        </span>
        <span>
          {snapshots[max] ? formatSnapshotTime(snapshots[max].timestamp) : ''}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface SnapshotDetailProps {
  snapshot: ContractStateSnapshot;
  diff: SnapshotDiff | null;
}

function SnapshotDetail({ snapshot, diff }: SnapshotDetailProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Snapshot metadata */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            {snapshot.label && (
              <p className="font-semibold text-slate-900 dark:text-white text-sm">{snapshot.label}</p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {t('contractTimeTraveler.ledger', { ledger: snapshot.ledger })}
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatSnapshotTime(snapshot.timestamp)}
          </span>
        </div>

        {snapshot.txHash && (
          <p className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate">
            {t('contractTimeTraveler.tx')}:{' '}
            <span className="text-indigo-600 dark:text-indigo-400">{snapshot.txHash}</span>
          </p>
        )}
      </div>

      {/* State key/value table */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
          {t('contractTimeTraveler.stateHeading')}
        </h4>
        <dl className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden divide-y divide-slate-200 dark:divide-slate-700">
          {Object.entries(snapshot.state).map(([key, value]) => {
            const change = diff?.changes.find((c) => c.key === key);
            const rowClass =
              change?.kind === 'added'
                ? 'bg-emerald-50 dark:bg-emerald-950/30'
                : change?.kind === 'changed'
                  ? 'bg-amber-50 dark:bg-amber-950/30'
                  : 'bg-white dark:bg-slate-900/40';

            return (
              <div key={key} className={`flex items-start gap-3 px-4 py-2.5 ${rowClass}`}>
                <dt className="font-mono text-xs text-slate-500 dark:text-slate-400 shrink-0 min-w-[8rem] pt-0.5">
                  {key}
                </dt>
                <dd className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                  {formatStateValue(value)}
                  {change?.kind === 'changed' && (
                    <span className="block text-slate-400 dark:text-slate-500 line-through mt-0.5">
                      {formatStateValue(change.before)}
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
          {/* Keys that were removed relative to previous snapshot */}
          {diff?.changes
            .filter((c) => c.kind === 'removed')
            .map((c) => (
              <div
                key={`removed-${c.key}`}
                className="flex items-start gap-3 px-4 py-2.5 bg-red-50 dark:bg-red-950/30"
              >
                <dt className="font-mono text-xs text-slate-500 dark:text-slate-400 shrink-0 min-w-[8rem] pt-0.5">
                  {c.key}
                </dt>
                <dd className="font-mono text-xs text-slate-400 dark:text-slate-500 line-through break-all">
                  {formatStateValue(c.before)}
                </dd>
              </div>
            ))}
        </dl>
      </div>

      {/* Diff summary */}
      {diff && (
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
          {diff.isMatch ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('contractTimeTraveler.noChanges')}
            </p>
          ) : (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t('contractTimeTraveler.diffSummary', { count: diff.changes.length })}
              <span className="inline-flex gap-1.5 ml-1.5">
                {diff.changes.filter((c) => c.kind === 'added').length > 0 && (
                  <span className="rounded px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold">
                    +{diff.changes.filter((c) => c.kind === 'added').length}
                  </span>
                )}
                {diff.changes.filter((c) => c.kind === 'changed').length > 0 && (
                  <span className="rounded px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold">
                    ~{diff.changes.filter((c) => c.kind === 'changed').length}
                  </span>
                )}
                {diff.changes.filter((c) => c.kind === 'removed').length > 0 && (
                  <span className="rounded px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-semibold">
                    -{diff.changes.filter((c) => c.kind === 'removed').length}
                  </span>
                )}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface ContractTimeTravelerProps {
  /** Historical snapshots to display. Defaults to built-in demo data. */
  history?: ContractStateSnapshot[];
}

/**
 * ContractTimeTraveler — issue #51
 *
 * A time-series slider that lets guardians scrub through past contract states
 * to reproduce and investigate bugs found in production.
 *
 * Performance: snapshot history lives entirely in local component state
 * (`useState`). `diffSnapshots` is memoized so it only recomputes when the
 * selected index changes. No network calls are made; data is injected via props.
 */
export default function ContractTimeTraveler({
  history: initialHistory = DEFAULT_CONTRACT_HISTORY,
}: ContractTimeTravelerProps): ReactElement {
  const { t } = useTranslation();

  const {
    currentIndex,
    currentSnapshot,
    history,
    goTo,
    diff,
  } = usePlayback({ initialHistory });

  if (history.length === 0) {
    return (
      <section
        aria-labelledby="contract-time-traveler-title"
        className="space-y-4"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <h2
            id="contract-time-traveler-title"
            className="text-lg font-semibold text-slate-900 dark:text-white"
          >
            {t('contractTimeTraveler.heading')}
          </h2>
        </div>
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          {t('contractTimeTraveler.empty')}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="contract-time-traveler-title"
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        <div>
          <h2
            id="contract-time-traveler-title"
            className="text-lg font-semibold text-slate-900 dark:text-white"
          >
            {t('contractTimeTraveler.heading')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {currentSnapshot?.contractId}
          </p>
        </div>
      </div>

      {/* Timeline slider */}
      <TimelineSlider
        value={currentIndex}
        max={history.length - 1}
        onChange={goTo}
        snapshots={history}
      />

      {/* Snapshot detail */}
      {currentSnapshot && (
        <SnapshotDetail snapshot={currentSnapshot} diff={diff} />
      )}
    </section>
  );
}
