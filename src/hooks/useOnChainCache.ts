'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useChainState } from '@/hooks/useChainState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseOnChainCacheOptions<T> {
  cacheKey: string;
  fetcher: (signal?: AbortSignal) => Promise<T>;
  revalidateOnMount?: boolean;
  dedupIntervalMs?: number;
  onError?: (error: Error) => void;
  onSuccess?: (data: T) => void;
}

export interface UseOnChainCacheResult<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: (data: T) => void;
  revalidate: () => Promise<T | undefined>;
  syncVersion: number;
}

// ---------------------------------------------------------------------------
// Module-level cache store (shared across hook instances)
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T | undefined;
  error: Error | undefined;
  promise: Promise<T> | null;
  promiseCreatedAt: number;
  version: number;
  isValidating: boolean;
}

const store = new Map<string, CacheEntry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function getEntry<T>(key: string): CacheEntry<T> {
  let entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    entry = {
      data: undefined,
      error: undefined,
      promise: null,
      promiseCreatedAt: 0,
      version: 0,
      isValidating: false,
    };
    store.set(key, entry);
  }
  return entry;
}

function setEntry(key: string, patch: Partial<Omit<CacheEntry<unknown>, 'version'>>): void {
  const entry = getEntry(key);
  Object.assign(entry, patch);
  entry.version += 1;
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribeToEntry(key: string, onChange: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onChange);
  return () => {
    set!.delete(onChange);
    if (set!.size === 0) listeners.delete(key);
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEFAULT_DEDUP_INTERVAL_MS = 2_000;

export function useOnChainCache<T>(
  options: UseOnChainCacheOptions<T>,
): UseOnChainCacheResult<T> {
  const {
    cacheKey,
    fetcher,
    revalidateOnMount = true,
    dedupIntervalMs = DEFAULT_DEDUP_INTERVAL_MS,
    onError,
    onSuccess,
  } = options;

  const { syncVersion } = useChainState({ cacheKey });

  // Subscribe to cache entry version changes so the component re-renders
  // when the module-level cache is updated from any hook instance.
  const cacheVersion = useSyncExternalStore(
    (onChange) => subscribeToEntry(cacheKey, onChange),
    () => getEntry<T>(cacheKey).version,
    () => 0,
  );

  // Keep mutable refs so the async callback always reads the latest values
  // without requiring the consumer to memoise the fetcher/onError/onSuccess.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const dedupIntervalMsRef = useRef(dedupIntervalMs);
  dedupIntervalMsRef.current = dedupIntervalMs;

  // Read version purely to force reactive re-renders; the actual value is
  // consumed from the module-level entry below.
  void cacheVersion;

  const revalidate = useCallback(async (): Promise<T | undefined> => {
    const now = Date.now();
    const entry = getEntry<T>(cacheKey);

    if (entry.promise && now - entry.promiseCreatedAt < dedupIntervalMsRef.current) {
      try {
        return await entry.promise;
      } catch {
        return undefined;
      }
    }

    setEntry(cacheKey, { isValidating: true });

    const promise = fetcherRef.current();
    setEntry(cacheKey, { promise, promiseCreatedAt: now });

    try {
      const data = await promise;
      setEntry(cacheKey, { data, error: undefined, promise: null, isValidating: false });
      onSuccessRef.current?.(data);
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setEntry(cacheKey, { error, promise: null, isValidating: false });
      onErrorRef.current?.(error);
      return undefined;
    }
  }, [cacheKey]);

  const mutate = useCallback(
    (data: T): void => {
      setEntry(cacheKey, { data, error: undefined });
    },
    [cacheKey],
  );

  // Auto-fetch on mount and re-fetch when the chain invalidation version
  // increments (e.g. a WebSocket event or force-sync triggered a refresh).
  const initialLoadHandledRef = useRef(false);

  useEffect(() => {
    if (!initialLoadHandledRef.current) {
      initialLoadHandledRef.current = true;
      if (revalidateOnMount) {
        void revalidate();
      }
      return;
    }

    void revalidate();
  }, [syncVersion, revalidate, revalidateOnMount]);

  const entry = getEntry<T>(cacheKey);

  return {
    data: entry.data,
    error: entry.error,
    isLoading: entry.isValidating && entry.data === undefined,
    isValidating: entry.isValidating,
    mutate,
    revalidate,
    syncVersion,
  };
}
