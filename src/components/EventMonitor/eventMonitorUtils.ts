import { Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRightLeft,
  ClipboardCheck,
  HelpCircle,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ThumbsUp,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { ProtocolEventType } from '@/hooks/useEvents';

export interface EventTypeOption {
  type: ProtocolEventType | 'all';
  labelKey: string;
  icon: LucideIcon;
  color: string;
}

export const EVENT_TYPE_OPTIONS: EventTypeOption[] = [
  { type: 'all', labelKey: 'eventMonitor.all', icon: Timer, color: 'text-slate-600 dark:text-slate-400' },
  { type: 'vote', labelKey: 'eventMonitor.typeVote', icon: ClipboardCheck, color: 'text-indigo-600 dark:text-indigo-400' },
  { type: 'task_registered', labelKey: 'eventMonitor.typeTask', icon: ClipboardCheck, color: 'text-emerald-600 dark:text-emerald-400' },
  { type: 'task_verified', labelKey: 'eventMonitor.typeTaskVerified', icon: ShieldCheck, color: 'text-teal-600 dark:text-teal-400' },
  { type: 'task_completed', labelKey: 'eventMonitor.typeTaskCompleted', icon: ThumbsUp, color: 'text-emerald-600 dark:text-emerald-400' },
  { type: 'reputation_change', labelKey: 'eventMonitor.typeReputation', icon: TrendingUp, color: 'text-amber-600 dark:text-amber-400' },
  { type: 'wallet_connected', labelKey: 'eventMonitor.typeWalletConnected', icon: Wallet, color: 'text-green-600 dark:text-green-400' },
  { type: 'wallet_disconnected', labelKey: 'eventMonitor.typeWalletDisconnected', icon: LogOut, color: 'text-red-600 dark:text-red-400' },
  { type: 'transaction', labelKey: 'eventMonitor.typeTransaction', icon: ArrowRightLeft, color: 'text-sky-600 dark:text-sky-400' },
  { type: 'emergency_halt', labelKey: 'eventMonitor.typeEmergencyHalt', icon: ShieldAlert, color: 'text-rose-600 dark:text-rose-400' },
  { type: 'force_sync', labelKey: 'eventMonitor.typeForceSync', icon: RefreshCw, color: 'text-violet-600 dark:text-violet-400' },
];

export function getEventTypeOption(type: ProtocolEventType): EventTypeOption {
  return EVENT_TYPE_OPTIONS.find((opt) => opt.type === type) ?? {
    type,
    labelKey: 'eventMonitor.typeUnknown',
    icon: HelpCircle,
    color: 'text-slate-500 dark:text-slate-400',
  };
}

export function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function filterEvents<T extends { type: string }>(
  events: readonly T[],
  filterType: string,
): readonly T[] {
  if (filterType === 'all') return events;
  return events.filter((event) => event.type === filterType);
}

export const DEFAULT_VISIBLE_EVENTS = 50;
