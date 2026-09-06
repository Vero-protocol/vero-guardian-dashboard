'use client';

/**
 * GlobalSearchPanel Component
 * Main search interface for on-chain state
 * Combines search input, results display, and filtering
 */

import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { SearchInput } from './SearchInput';
import { SearchResults } from './SearchResults';
import type { RankedSearchResult, SearchOptions } from './types';
import { useTranslation } from 'react-i18next';
import { useSearchIndex } from './useSearchIndex';
import type { ContractMetadata } from './types';

export interface GlobalSearchPanelProps {
  contracts?: ContractMetadata[];
  onResultClick?: (result: RankedSearchResult) => void;
  showFilters?: boolean;
  showStats?: boolean;
  maxResults?: number;
  minScore?: number;
  debounceMs?: number;
  placeholder?: string;
  storageKey?: string;
}

export function GlobalSearchPanel({
  contracts = [],
  onResultClick,
  showFilters = true,
  showStats = true,
  maxResults = 10,
  minScore = 20,
  debounceMs = 300,
  placeholder = t("search.placeholder", { defaultValue: "Search contracts, functions, or on-chain data..." }),
  storageKey = 'search-index-contracts',
}: GlobalSearchPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<ContractMetadata['type'][]>([]);

  const { search, addContracts, contracts: indexedContracts, error, isLoading: isIndexLoading } = useSearchIndex({
    initialContracts: contracts,
    storageKey,
    debounceMs,
  });

  // Add contracts when they change
  useEffect(() => {
    if (contracts.length > 0) {
      addContracts(contracts);
    }
  }, [contracts, addContracts]);

  // Perform search with debounce
  const results = useMemo(() => {
    if (!query.trim()) {
      setIsSearching(false);
      return [];
    }

    setIsSearching(true);
    const searchOptions: SearchOptions = {
      maxResults,
      minScore,
      typeFilter: selectedTypes.length > 0 ? selectedTypes : undefined,
    };

    return search(query, searchOptions);
  }, [query, maxResults, minScore, selectedTypes, search]);

  // Get available types
  const availableTypes = useMemo(() => {
    const types = new Set(indexedContracts.map((c) => c.type));
    return Array.from(types).sort();
  }, [indexedContracts]);

  // Toggle type filter
  const toggleTypeFilter = (type: ContractMetadata['type']) => {
    setSelectedTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const handleRefresh = () => {
    setQuery('');
    setSelectedTypes([]);
  };

  return (
    <section aria-labelledby="global-search-title" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 id="global-search-title" className="text-lg font-bold text-slate-900 dark:text-white">
          On-Chain State Search
        </h2>
        {showStats && indexedContracts.length > 0 && (
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
            {indexedContracts.length} contract{indexedContracts.length !== 1 ? 's' : ''} indexed
          </div>
        )}
      </div>

      {/* Search Input */}
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={placeholder}
        isLoading={isIndexLoading || isSearching}
        error={error}
        autoFocus
      />

      {/* Type Filters */}
      {showFilters && availableTypes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Filter by type</label>
            {selectedTypes.length > 0 && (
              <button
                onClick={handleRefresh}
                type="button"
                className="flex items-center gap-1 text-xs text-slate-600 transition hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                aria-label="Reset filters"
              >
                <RefreshCw className="h-3 w-3" />
                Reset
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {availableTypes.map((type) => (
              <button
                key={type}
                onClick={() => toggleTypeFilter(type)}
                type="button"
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  selectedTypes.includes(type)
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results Summary */}
      {query && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-400">
            {results.length} result{results.length !== 1 ? 's' : ''} found
            {selectedTypes.length > 0 && ` (${selectedTypes.join(', ')})`}
          </span>
        </div>
      )}

      {/* Search Results */}
      <SearchResults
        results={results}
        isLoading={isIndexLoading || isSearching}
        isEmpty={!query}
        onResultClick={onResultClick}
        maxHeight="500px"
        showRank
      />

      {/* Empty State */}
      {indexedContracts.length === 0 && !isIndexLoading && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-6 py-8 text-center dark:border-slate-700 dark:bg-slate-900/30">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No contracts indexed</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Add contracts to the search index to enable searching
          </p>
        </div>
      )}
    </section>
  );
}
