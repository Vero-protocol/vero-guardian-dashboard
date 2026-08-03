'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProtocolEventType =
  | 'vote'
  | 'task_registered'
  | 'reputation_change'
  | 'wallet_connected'
  | 'wallet_disconnected'
  | 'transaction'
  | string;

export interface ProtocolEvent {
  id: string;
  type: ProtocolEventType;
  timestamp: string;
  actor?: string;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ProtocolEventInput {
  type: ProtocolEventType;
  actor?: string;
  resource?: string;
  resourceId?: string | number;
  metadata?: Record<string, unknown>;
}

export interface UseEventsOptions {
  /** Maximum number of events retained in the timeline. Default: 100. */
  maxEvents?: number;
}

export interface UseEventsResult {
  /** Ordered timeline of events — newest first. */
  timeline: readonly ProtocolEvent[];
  /** Emit a new protocol event onto the bus. */
  emit: (event: ProtocolEventInput) => void;
  /** Clear all retained events. */
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  'privatekey', 'secretkey', 'seed', 'seedphrase', 'mnemonic',
  'password', 'token', 'accesstoken', 'refreshtoken',
  'authorization', 'apikey', 'secret',
]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ''));
}

function sanitizeMetadata(
  raw: Record<string, unknown> | undefined,
): ProtocolEvent['metadata'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const result: ProtocolEvent['metadata'] = {};
  for (const [key, val] of Object.entries(raw)) {
    if (isSensitiveKey(key)) continue;
    if (val === null || typeof val === 'boolean' || typeof val === 'number') {
      result[key] = val;
    } else if (typeof val === 'string') {
      result[key] = val.slice(0, 512);
    }
    // drop objects, arrays, functions
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeString(value: unknown, maxLength = 256): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : undefined;
}

function makeId(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function sanitizeEvent(input: ProtocolEventInput): ProtocolEvent {
  return {
    id: makeId(),
    type: sanitizeString(input.type) ?? 'unknown',
    timestamp: new Date().toISOString(),
    actor: sanitizeString(input.actor),
    resource: sanitizeString(input.resource),
    resourceId: sanitizeString(String(input.resourceId ?? '')),
    metadata: sanitizeMetadata(input.metadata),
  };
}

// ---------------------------------------------------------------------------
// Event bus (module-level singleton so all hook instances share state)
// ---------------------------------------------------------------------------

type BusListener = (event: ProtocolEvent) => void;

const listeners = new Set<BusListener>();

function busSubscribe(listener: BusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function busPublish(event: ProtocolEvent): void {
  for (const listener of listeners) {
    try { listener(event); } catch { /* isolate listener errors */ }
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const DEFAULT_MAX_EVENTS = 100;

type Action =
  | { type: 'APPEND'; event: ProtocolEvent; max: number }
  | { type: 'CLEAR' };

function reducer(state: ProtocolEvent[], action: Action): ProtocolEvent[] {
  switch (action.type) {
    case 'APPEND': {
      const next = [action.event, ...state];
      return next.length > action.max ? next.slice(0, action.max) : next;
    }
    case 'CLEAR':
      return [];
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEvents(options: UseEventsOptions = {}): UseEventsResult {
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  const maxRef = useRef(maxEvents);
  maxRef.current = maxEvents;

  const [timeline, dispatch] = useReducer(reducer, []);

  useEffect(() => {
    return busSubscribe((event) => {
      dispatch({ type: 'APPEND', event, max: maxRef.current });
    });
  }, []);

  const emit = useCallback((input: ProtocolEventInput) => {
    busPublish(sanitizeEvent(input));
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  return { timeline, emit, clear };
}
