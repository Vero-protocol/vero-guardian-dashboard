'use client';

/**
 * SearchResults Component
 * Displays ranked search results with contract and function details
 */

import { Badge } from 'lucide-react';
import type { RankedSearchResult } from './StateStateStateStateStatetypes';

const TYPE_STYLES: Record<string, string> = {
  task: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
  vote: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  reputation:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  governance:
    'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
  network:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  custom:
    'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  contract: 'Contract',
  function: 'Function',
  description: 'Description',
  tag: 'Tag',
};

export interface SearchResultsProps {
  results: RankedSearchResult[];
  isLoading?: boolean;
  isEmpty?: boolean;
  onResultClick?: (result: RankedSearchResult) => void;
  maxHeight?: string;
  showRank?: boolean;
}

function ScoreBar({ score, maxScore = 100 }: { score: number; maxScore?: number }) {
  const percentage = Math.min(100, (score / maxScore) * 100);
  let barColor = 'bg-red-500';
  if (percentage >= 75) barColor = 'bg-emerald-500';
  else if (percentage >= 50) barColor = 'bg-amber-500';
  else if (percentage >= 25) barColor = 'bg-orange-500';

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={`h-2 ${barColor} transition-all duration-200`} style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{Math.round(score)}%</span>
    </div>
  );
}

export function SearchResults({
  results,
  isLoading = false,
  isEmpty = false,
  onResultClick,
  maxHeight = '400px',
  showRank = true,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-slate-500 dark:text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500 dark:border-slate-600" />
        <span className="ml-2">Searching...</span>
      </div>
    );
  }

  if (isEmpty || results.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-6 py-8 text-center dark:border-slate-700 dark:bg-slate-900/30">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {isEmpty ? 'No search query' : 'No results found'}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {isEmpty
            ? 'Enter a search term to find contracts and functions'
            : 'Try different keywords or check the spelling'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" style={{ maxHeight, overflowY: 'auto' }} role="region" aria-label="Search results">
      {results.map((result, idx) => (
        <button
          key={`${result.contract.id}-${result.function?.id || 'contract'}-${idx}`}
          onClick={() => onResultClick?.(result)}
          className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500 dark:hover:bg-slate-700/50"
          type="button"
        >
          <div className="space-y-3">
            {/* Header with rank, type badge, and score */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                {showRank && (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                    {result.rank}
                  </span>
                )}
                <h3 className="font-semibold text-slate-900 dark:text-white">{result.highlightedText}</h3>
              </div>
              <Badge
                className={`h-5 flex-shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[result.contract.type] || TYPE_STYLES.custom}`}
              />
            </div>

            {/* Contract info */}
            <div className="space-y-1 text-sm">
              <p className="font-medium text-slate-700 dark:text-slate-300">{result.contract.name}</p>
              {result.contract.description && (
                <p className="line-clamp-2 text-slate-600 dark:text-slate-400">{result.contract.description}</p>
              )}
            </div>

            {/* Function info if applicable */}
            {result.function && (
              <div className="space-y-1 border-t border-slate-200 pt-2 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Function:</span>
                  <code className="rounded bg-slate-100 px-2 py-1 text-xs font-mono text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    {result.function.name}
                  </code>
                </div>
                {result.function.description && (
                  <p className="line-clamp-1 text-xs text-slate-600 dark:text-slate-400">{result.function.description}</p>
                )}
              </div>
            )}

            {/* Tags */}
            {(result.contract.tags.length > 0 || result.function?.tags.length! > 0) && (
              <div className="flex flex-wrap gap-1 border-t border-slate-200 pt-2 dark:border-slate-700">
                {(result.function?.tags || result.contract.tags).slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-block rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
                {(result.function?.tags || result.contract.tags).length > 3 && (
                  <span className="inline-block rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    +{(result.function?.tags || result.contract.tags).length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Score bar */}
            <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
              <ScoreBar score={result.score} />
            </div>

            {/* Match type indicator */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Match: <span className="font-medium">{MATCH_TYPE_LABELS[result.matchType]}</span>
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
