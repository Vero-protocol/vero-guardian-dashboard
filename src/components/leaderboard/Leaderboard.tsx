'use client';

import type { ReactElement } from 'react';
import { memo, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Medal, ShieldCheck, TrendingUp, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type AuditContributorInput,
  type RankedAuditContributor,
  rankAuditContributors,
} from './score';
import { readAuditLogEvents } from '@/utils/logger';
import type { AuditLogEvent } from '@/utils/logger';
import { fetchContributorProfiles } from '@/services/profileClient';

type LeaderboardWindow = 'all' | 'recent';

// Leaderboard now reads live audit events from the client-side audit logger
// and aggregates them into contributor activity. See `readAuditLogEvents()`.

const DATE_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
});

function filterActivityByWindow(
  contributors: AuditContributorInput[],
  leaderboardWindow: LeaderboardWindow,
): AuditContributorInput[] {
  if (leaderboardWindow === 'all') {
    return contributors;
  }

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return contributors.filter((contributor) => {
    if (!contributor.lastAuditAt) {
      return false;
    }

    return Date.parse(contributor.lastAuditAt) >= cutoff;
  });
}

function mapEventsToContributors(events: AuditLogEvent[]): AuditContributorInput[] {
  const map = new Map<string, AuditContributorInput>();

  for (const e of events) {
    const meta = (e as any).metadata ?? {};
    const actor = e.actor ?? (typeof meta.actor === 'string' ? meta.actor : undefined);
    const contribId = (meta.contributorId as string) ?? actor ?? e.id;
    const displayName = (meta.displayName as string) ?? (meta.name as string) ?? contribId;

    let c = map.get(contribId);
    if (!c) {
      c = {
        contributorId: String(contribId),
        displayName: String(displayName),
        walletAddress: actor ?? undefined,
        auditsCompleted: 0,
        validationsSubmitted: 0,
        criticalFindings: 0,
        highFindings: 0,
        mediumFindings: 0,
        acceptedFindings: 0,
        disputedFindings: 0,
        lastAuditAt: undefined,
      };
    }

    const pushFindingCount = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
      return 1;
    };

    switch (e.action) {
      case 'complete_audit':
        c.auditsCompleted += 1;
        c.lastAuditAt = e.timestamp;
        break;
      case 'submit_validation':
        c.validationsSubmitted += 1;
        break;
      case 'critical_finding':
        c.criticalFindings += pushFindingCount(meta.count ?? 1);
        c.lastAuditAt = e.timestamp;
        break;
      case 'high_finding':
        c.highFindings += pushFindingCount(meta.count ?? 1);
        c.lastAuditAt = e.timestamp;
        break;
      case 'medium_finding':
        c.mediumFindings += pushFindingCount(meta.count ?? 1);
        c.lastAuditAt = e.timestamp;
        break;
      case 'approve_vote':
        c.acceptedFindings += 1;
        break;
      case 'dispute_vote':
        c.disputedFindings = (c.disputedFindings ?? 0) + 1;
        break;
      default:
        // If the event looks like a finding by metadata, try to coerce it
        if (meta?.findingType === 'critical') {
          c.criticalFindings += pushFindingCount(meta.count ?? 1);
        } else if (meta?.findingType === 'high') {
          c.highFindings += pushFindingCount(meta.count ?? 1);
        } else if (meta?.findingType === 'medium') {
          c.mediumFindings += pushFindingCount(meta.count ?? 1);
        }
        break;
    }

    map.set(contribId, c);
  }

  return Array.from(map.values());
}

function formatWallet(walletAddress: string | undefined, t: (key: string) => string): string {
  if (!walletAddress) {
    return t('leaderboard.noWallet');
  }

  if (walletAddress.length <= 12) {
    return walletAddress;
  }

  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

function formatDate(value: string | undefined, t: (key: string) => string): string {
  if (!value) {
    return t('leaderboard.noActivity');
  }

  return DATE_FORMATTER.format(new Date(value));
}

function getRankClassName(rank: number): string {
  switch (rank) {
    case 1:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
    case 2:
      return 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100';
    case 3:
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200';
    default:
      return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300';
  }
}

function LeaderboardRow({ contributor, t }: { contributor: RankedAuditContributor; t: (key: string, options?: any) => string }): ReactElement {
  return (
    <li className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/80">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${getRankClassName(contributor.rank)}`}
          aria-label={t('leaderboard.rankAria', { rank: contributor.rank })}
        >
          {contributor.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                {/* avatar will be injected via DOM by parent using profile map when available */}
                <span id={`avatar-${contributor.contributorId}`} />
                <span>{contributor.displayName}</span>
              </p>
              <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                {formatWallet(contributor.walletAddress, t)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-bold text-slate-900 dark:text-white">
                {contributor.score}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('leaderboard.score')}</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">{t('leaderboard.audits')}</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">
                {contributor.auditsCompleted}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">{t('leaderboard.findings')}</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">
                {contributor.criticalFindings + contributor.highFindings + contributor.mediumFindings}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">{t('leaderboard.latest')}</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">
                {formatDate(contributor.lastAuditAt, t)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </li>
  );
}

function Leaderboard(): ReactElement {
  const { t } = useTranslation();
  const [leaderboardWindow, setLeaderboardWindow] = useState<LeaderboardWindow>('all');
  const [contributors, setContributors] = useState<AuditContributorInput[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
  const mountedRef = useRef(true);

  const manualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const events = await readAuditLogEvents();
      if (!mountedRef.current) return;
      setContributors(mapEventsToContributors(events));
      setLastUpdated(new Date());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Unable to read audit logs for leaderboard', error);
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void manualRefresh();

    const interval = setInterval(() => {
      void manualRefresh();
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [manualRefresh]);

  // Load contributor profiles (avatars, canonical names) and inject into DOM elements
  useEffect(() => {
    let mounted = true;
    const ids = contributors.map((c) => c.contributorId);
    if (ids.length === 0) return;

    void fetchContributorProfiles(ids)
      .then((profiles) => {
        if (!mounted) return;
        for (const id of Object.keys(profiles)) {
          const p = profiles[id];
          const container = document.getElementById(`avatar-${id}`);
          if (!container) continue;
          // Clear existing
          container.innerHTML = '';
          if (p?.avatarUrl) {
            const img = document.createElement('img');
            img.src = p.avatarUrl;
            img.alt = p.displayName ?? id;
            img.width = 28;
            img.height = 28;
            img.className = 'rounded-full object-cover';
            container.appendChild(img);
          } else if (p?.displayName) {
            const span = document.createElement('span');
            span.textContent = p.displayName.slice(0, 1).toUpperCase();
            span.className = 'inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200';
            container.appendChild(span);
          }
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [contributors]);

  const rankedContributors = useMemo(
    () => rankAuditContributors(filterActivityByWindow(contributors, leaderboardWindow)),
    [contributors, leaderboardWindow],
  );
  const topContributor = rankedContributors[0];
  const totalAudits = useMemo(
    () =>
      rankedContributors.reduce(
        (total, contributor) => total + contributor.auditsCompleted,
        0,
      ),
    [rankedContributors],
  );

  return (
    <section aria-labelledby="audit-leaderboard-title">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <Medal className="h-5 w-5" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wider">{t('leaderboard.auditActivity')}</p>
          </div>
          <h2 id="audit-leaderboard-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            {t('leaderboard.title')}
          </h2>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setLeaderboardWindow('all')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              leaderboardWindow === 'all'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
            aria-pressed={leaderboardWindow === 'all'}
          >
            {t('leaderboard.all')}
          </button>
          <button
            type="button"
            onClick={() => setLeaderboardWindow('recent')}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              leaderboardWindow === 'recent'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
            aria-pressed={leaderboardWindow === 'recent'}
          >
            {t('leaderboard.recent30d')}
          </button>
          <button
            type="button"
            onClick={() => void manualRefresh()}
            disabled={isRefreshing}
            className={`ml-2 inline-flex items-center gap-2 rounded-md px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              isRefreshing
                ? 'opacity-60 cursor-wait'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
            aria-label={t('leaderboard.refresh')}
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            {isRefreshing ? t('leaderboard.refreshing', { defaultValue: 'Refreshing...' }) : t('leaderboard.refresh')}
          </button>
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {lastUpdated ? `Updated: ${DATE_FORMATTER.format(lastUpdated)} ${lastUpdated.toLocaleTimeString()}` : ''}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/80">
          <div className="mb-1 flex items-center gap-2 text-sky-700 dark:text-sky-400">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wider">{t('leaderboard.audits')}</p>
          </div>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white">{totalAudits}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/80">
          <div className="mb-1 flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wider">{t('leaderboard.leader')}</p>
          </div>
          <p className="truncate font-semibold text-slate-900 dark:text-white">
            {topContributor?.displayName ?? t('leaderboard.noActivity')}
          </p>
        </div>
      </div>

      <ol className="space-y-3">
        {rankedContributors.map((contributor) => (
          <LeaderboardRow key={contributor.contributorId} contributor={contributor} t={t} />
        ))}
      </ol>
    </section>
  );
}

export default memo(Leaderboard);
