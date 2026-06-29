'use client';

/**
 * useSearchIndex Hook
 * Manages search index state and provides search functionality
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContractMetadata, SearchIndex, SearchOptions, RankedSearchResult } from './StateStateStateStateStatetypes';
import { buildIndex, searchIndex, validateIndex } from './StateStateStateStateStateindexer';

export interface UseSearchIndexOptions {
  initialContracts?: ContractMetadata[];
  storageKey?: string;
  debounceMs?: number;
}

export interface UseSearchIndexState {
  index: SearchIndex | null;
  isLoading: boolean;
  error: Error | null;
  contracts: ContractMetadata[];
}

/**
 * Hook for managing search index and performing searches
 */
export function useSearchIndex(
  options: UseSearchIndexOptions = {},
): UseSearchIndexState & {
  search: (query: string, searchOptions?: SearchOptions) => RankedSearchResult[];
  addContracts: (contracts: ContractMetadata[]) => void;
  removeContracts: (contractIds: string[]) => void;
  updateContracts: (contracts: ContractMetadata[]) => void;
  clearIndex: () => void;
  reloadIndex: () => void;
} {
  const { initialContracts = [], storageKey = 'search-index-contracts', debounceMs = 300 } = options;

  const [contracts, setContracts] = useState<ContractMetadata[]>(initialContracts);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Load persisted contracts from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsedContracts = JSON.parse(stored) as ContractMetadata[];
        setContracts(parsedContracts);
      }
    } catch (err) {
      console.warn('Failed to load search index from storage:', err);
    }
  }, [storageKey]);

  // Build index whenever contracts change
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setIsLoading(true);
        setError(null);

        if (contracts.length === 0) {
          setIndex(null);
          return;
        }

        const newIndex = buildIndex(contracts);
        const validation = validateIndex(newIndex);

        if (!validation.valid) {
          console.warn('Index validation errors:', validation.errors);
        }

        setIndex(newIndex);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to build index'));
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [contracts, debounceMs]);

  // Persist contracts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(contracts));
    } catch (err) {
      console.warn('Failed to persist search index:', err);
    }
  }, [contracts, storageKey]);

  // Search function
  const search = useCallback(
    (query: string, searchOptions?: SearchOptions): RankedSearchResult[] => {
      if (!index) {
        return [];
      }

      try {
        return searchIndex(query, index, searchOptions);
      } catch (err) {
        console.error('Search failed:', err);
        return [];
      }
    },
    [index],
  );

  // Add contracts
  const addContracts = useCallback((newContracts: ContractMetadata[]) => {
    setContracts((prev) => {
      const contractIds = new Set(prev.map((c) => c.id));
      const filtered = newContracts.filter((c) => !contractIds.has(c.id));
      return [...prev, ...filtered];
    });
  }, []);

  // Remove contracts
  const removeContracts = useCallback((contractIds: string[]) => {
    const idsToRemove = new Set(contractIds);
    setContracts((prev) => prev.filter((c) => !idsToRemove.has(c.id)));
  }, []);

  // Update contracts
  const updateContracts = useCallback((updatedContracts: ContractMetadata[]) => {
    setContracts((prev) => {
      const idMap = new Map(updatedContracts.map((c) => [c.id, c]));
      return prev.map((c) => idMap.get(c.id) || c);
    });
  }, []);

  // Clear index
  const clearIndex = useCallback(() => {
    setContracts([]);
    setIndex(null);
  }, []);

  // Reload index
  const reloadIndex = useCallback(() => {
    if (contracts.length > 0) {
      try {
        setIsLoading(true);
        const newIndex = buildIndex(contracts);
        setIndex(newIndex);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to rebuild index'));
      } finally {
        setIsLoading(false);
      }
    }
  }, [contracts]);

  return {
    index,
    isLoading,
    error,
    contracts,
    search,
    addContracts,
    removeContracts,
    updateContracts,
    clearIndex,
    reloadIndex,
  };
}
