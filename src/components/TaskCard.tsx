'use client';

import { useMemo, useState, useCallback } from 'react';
import { CheckCircle2, Clock, AlertCircle, Shield, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TaskFilters from './StateStateStateStateStateTaskFilters';
import { useTaskFilters } from '@/hooks/useTaskFilters';
import { useToast } from '@/components/Toast';

export interface TaskCardTask {
  id: string;
  title?: string;
  titleKey?: string;
  status: 'completed' | 'pending' | 'in-progress';
  is_done?: boolean;
  reward: string;
  priority: 'high' | 'medium' | 'low';
  votes?: number;
}

interface TaskCardProps {
  tasks?: TaskCardTask[];
  submitVote?: (taskId: string) => Promise<{ status: string; txHash?: string }>;
}

const mockTasks: TaskCardTask[] = [
  {
    id: '1',
    titleKey: 'tasks.verifyMultiSig',
    status: 'in-progress',
    reward: '50 VERO',
    priority: 'high',
    votes: 3,
  },
  {
    id: '2',
    titleKey: 'tasks.auditGas',
    status: 'pending',
    reward: '35 VERO',
    priority: 'medium',
    votes: 0,
  },
  {
    id: '3',
    titleKey: 'tasks.validateRateLimit',
    status: 'completed',
    is_done: true,
    reward: '40 VERO',
    priority: 'high',
    votes: 5,
  },
  {
    id: '4',
    title: 'Review governance proposal update',
    status: 'pending',
    reward: '60 VERO',
    priority: 'high',
  },
  {
    id: '5',
    title: 'Test contract upgrade migration',
    status: 'in-progress',
    reward: '45 VERO',
    priority: 'medium',
  },
  {
    id: '6',
    title: 'Document API rate limit changes',
    status: 'completed',
    is_done: true,
    reward: '20 VERO',
    priority: 'low',
  },
];

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function defaultSubmitVote(_taskId: string): Promise<{ status: string; txHash?: string }> {
  await delay(1500);
  if (Math.random() < 0.15) {
    throw new Error('Soroban transaction failed: consensus timeout');
  }
  return { status: 'success', txHash: `0x${Math.random().toString(16).slice(2, 10)}` };
}

export function matchesFilter(task: TaskCardTask, status: string, priority: string): boolean {
  const resolvedStatus = task.is_done ? 'completed' : task.status;
  if (status !== 'all' && resolvedStatus !== status) return false;
  if (priority !== 'all' && task.priority !== priority) return false;
  return true;
}

export default function TaskCard({ tasks = mockTasks, submitVote = defaultSubmitVote }: TaskCardProps) {
  const { t } = useTranslation();
  const { filters } = useTaskFilters();
  const { showToast } = useToast();

  const [pendingVotes, setPendingVotes] = useState<Record<string, boolean>>({});
  const [optimisticVotes, setOptimisticVotes] = useState<Record<string, number>>({});
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, TaskCardTask['status']>>({});

  const filteredTasks = useMemo(
    () => tasks.filter((task) => matchesFilter(task, filters.status, filters.priority)),
    [tasks, filters.status, filters.priority],
  );

  const handleVerify = useCallback(
    async (task: TaskCardTask) => {
      const taskId = task.id;
      if (pendingVotes[taskId]) return;

      const prevStatus = optimisticStatus[taskId] ?? task.status;
      const prevVotes = task.votes ?? 0;
      const optimisticDelta = optimisticVotes[taskId] ?? 0;

      setPendingVotes((p) => ({ ...p, [taskId]: true }));
      setOptimisticVotes((v) => ({ ...v, [taskId]: optimisticDelta + 1 }));
      if (prevStatus === 'pending') {
        setOptimisticStatus((s) => ({ ...s, [taskId]: 'in-progress' }));
      }

      try {
        const result = await submitVote(taskId);
        if (result.status === 'success') {
          showToast(
            t('tasks.verify.toast.success', { txHash: result.txHash?.slice(0, 8) ?? '…' }),
            'success',
          );
        }
      } catch {
        setOptimisticVotes((v) => ({ ...v, [taskId]: optimisticDelta }));
        if (prevStatus === 'pending') {
          setOptimisticStatus((s) => ({ ...s, [taskId]: 'pending' }));
        }
        showToast(t('tasks.verify.toast.error'), 'error');
      } finally {
        setPendingVotes((p) => {
          const next = { ...p };
          delete next[taskId];
          return next;
        });
      }
    },
    [pendingVotes, optimisticVotes, optimisticStatus, submitVote, showToast, t],
  );

  const getStatusIcon = (status: TaskCardTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />;
      case 'in-progress':
        return <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-pulse" aria-hidden="true" />;
      case 'pending':
        return <AlertCircle className="w-5 h-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />;
    }
  };

  const getPriorityBadge = (priority: TaskCardTask['priority']) => {
    const styles = {
      high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
      medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
      low: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${styles[priority]}`}>
        {t(`tasks.priority.${priority}`)}
      </span>
    );
  };

  const getStatusLabel = (status: TaskCardTask['status']) => {
    if (status === 'in-progress') {
      return t('tasks.status.inProgress');
    }
    return t(`tasks.status.${status}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{t('tasks.heading')}</h2>
      </div>

      <TaskFilters />

      {filteredTasks.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
          {t('tasks.filter.noResults')}
        </p>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const baseStatus = task.is_done ? 'completed' : task.status;
            const status = optimisticStatus[task.id] ?? baseStatus;
            const title = task.title ?? t(task.titleKey ?? '');
            const isPending = pendingVotes[task.id] ?? false;
            const canVote = !task.is_done && status !== 'completed' && !isPending;
            const voteCount = (task.votes ?? 0) + (optimisticVotes[task.id] ?? 0);

            return (
              <div
                key={task.id}
                className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-600 transition-colors shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 w-full">
                    {getStatusIcon(status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-slate-900 dark:text-white">{title}</h3>
                        {getPriorityBadge(task.priority)}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {t('common.status')}:{' '}
                        <span
                          className={`capitalize font-medium ${
                            status === 'completed'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : status === 'in-progress'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {getStatusLabel(status)}
                        </span>
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {t('tasks.votes', { count: voteCount })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <span className="block text-lg font-semibold text-indigo-600 dark:text-indigo-400">{task.reward}</span>
                    {isPending ? (
                      <button
                        type="button"
                        disabled
                        className="rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 cursor-wait transition-colors flex items-center gap-2"
                      >
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        {t('tasks.verify.pending')}
                      </button>
                    ) : canVote ? (
                      <button
                        type="button"
                        onClick={() => handleVerify(task)}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                        aria-label={`Verify quality for ${title}`}
                      >
                        {t('tasks.verify.action')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
