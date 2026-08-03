'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidateChainState } from '@/hooks/useChainState';
import { busPublish, sanitizeEvent } from './useEvents';

export type TaskEventType = 'task_verified' | 'task_completed';

export interface TaskChainEvent {
  type: TaskEventType;
  taskId: string;
  taskTitle: string;
  timestamp: string;
}

export interface UseTaskChainEventsOptions {
  intervalMs?: number;
  enabled?: boolean;
}

export interface UseTaskChainEventsResult {
  isPolling: boolean;
  lastEvent: TaskChainEvent | null;
  pollCount: number;
}

const SIMULATED_TASK_IDS = ['1', '2', '3'];
const TASK_TITLE_KEYS: Record<string, string> = {
  '1': 'Verify multi-sig transaction security',
  '2': 'Audit gas optimization changes',
  '3': 'Validate rate limiting implementation',
};

function simulateOnChainCheck(
  completedTaskIds: Set<string>,
): TaskChainEvent | null {
  const available = SIMULATED_TASK_IDS.filter(
    (id) => !completedTaskIds.has(id),
  );
  if (available.length === 0) return null;

  const picked = available[Math.floor(Math.random() * available.length)];
  return {
    type: 'task_verified',
    taskId: picked,
    taskTitle: TASK_TITLE_KEYS[picked] ?? `Task #${picked}`,
    timestamp: new Date().toISOString(),
  };
}

export function getBusPublishForTest(): typeof busPublish {
  return busPublish;
}

export function useTaskChainEvents(
  options: UseTaskChainEventsOptions = {},
): UseTaskChainEventsResult {
  const {
    intervalMs = 3_000,
    enabled = true,
  } = options;

  const [isPolling, setIsPolling] = useState(false);
  const [lastEvent, setLastEvent] = useState<TaskChainEvent | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const completedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    const event = simulateOnChainCheck(completedRef.current);
    if (!event) return;

    completedRef.current.add(event.taskId);
    setLastEvent(event);
    setPollCount((c) => c + 1);

    busPublish(sanitizeEvent({
      type: event.type,
      actor: 'system',
      resource: event.taskTitle,
      resourceId: event.taskId,
      metadata: { taskId: event.taskId },
    }));

    invalidateChainState(['tasks', `task:${event.taskId}`], 'polling');
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    setIsPolling(true);
    timerRef.current = setInterval(tick, intervalMs);

    return () => {
      setIsPolling(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, intervalMs, tick]);

  return { isPolling, lastEvent, pollCount };
}
