"use client";

import { useEffect, useRef } from 'react';
import { useEvents, type ProtocolEvent } from '@/hooks/useEvents';
import { appendAuditEvent } from '@/utils/logger';

type Listener = () => void;
const listeners = new Set<Listener>();

export function addActivityLogListener(fn: Listener): void {
  listeners.add(fn);
}

export function removeActivityLogListener(fn: Listener): void {
  listeners.delete(fn);
}

function notifyListeners(): void {
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch {
      // ignore
    }
  }
}

export interface UseActivityStreamOptions {
  /** If false, the hook will not append events. Default true. */
  enabled?: boolean;
}

/**
 * Subscribes to the in-memory protocol event bus and mirrors events to the
 * persistent audit logger. Avoids double-logging of `transaction` events which
 * are already recorded by the `TransactionFeed` component.
 */
export function useActivityStream(options: UseActivityStreamOptions = {}): void {
  const { enabled = true } = options;
  const { timeline } = useEvents();
  const lastSeenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // timeline is newest-first; process any events we haven't seen yet in
    // chronological order.
    const lastSeenId = lastSeenRef.current;
    const newEvents: ProtocolEvent[] = [];
    for (let i = timeline.length - 1; i >= 0; i--) {
      const ev = timeline[i];
      if (lastSeenId && ev.id === lastSeenId) break;
      newEvents.push(ev);
    }

    if (newEvents.length === 0) {
      if (timeline[0]?.id) lastSeenRef.current = timeline[0].id;
      return;
    }

    (async () => {
      for (const ev of newEvents) {
        // Skip transaction because TransactionFeed already logs these.
        if (ev.type === 'transaction') continue;

        try {
          await appendAuditEvent({
            id: undefined,
            timestamp: ev.timestamp,
            type: ev.type,
            actor: ev.actor ?? null,
            action: ev.type,
            resource: ev.resource ?? null,
            resourceId: ev.resourceId ?? null,
            metadata: ev.metadata ?? undefined,
          });
          // notify any exporters so they can append new encrypted records
          notifyListeners();
        } catch (error) {
          // swallow errors to avoid breaking UI
          // eslint-disable-next-line no-console
          console.error('useActivityStream: failed to append audit event', error);
        }
      }

      lastSeenRef.current = timeline[0]?.id ?? lastSeenRef.current;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, enabled]);
}
