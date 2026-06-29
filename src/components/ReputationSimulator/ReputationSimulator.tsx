'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACTION_DELTAS,
  type SimulatorAction,
  simulateMultipleActions,
} from './StateStateStateStateStatereputationSimulator';

interface Props {
  /** Current on-chain reputation score from getReputation(). */
  currentScore: number;
}

const ACTION_I18N_KEYS: Record<SimulatorAction, string> = {
  approve_vote: 'reputation.approveVote',
  dispute_vote: 'reputation.disputeVote',
  critical_finding: 'reputation.criticalFinding',
  high_finding: 'reputation.highFinding',
  medium_finding: 'reputation.mediumFinding',
  complete_audit: 'reputation.completeAudit',
  submit_validation: 'reputation.submitValidation',
};

export function ReputationSimulator({ currentScore }: Props) {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<Partial<Record<SimulatorAction, number>>>({});

  const { projectedScore, delta } = simulateMultipleActions(currentScore, counts);

  function setCount(action: SimulatorAction, value: number) {
    setCounts((prev) => ({ ...prev, [action]: Math.max(0, Math.trunc(value)) }));
  }

  return (
    <div className="rounded-xl border p-4 shadow-sm space-y-4">
      <h2 className="font-semibold text-lg">{t('reputation.heading')}</h2>

      <div className="grid gap-2">
        {(Object.keys(ACTION_I18N_KEYS) as SimulatorAction[]).map((action) => (
          <div key={action} className="flex items-center justify-between gap-4">
            <span className="text-sm flex-1">
              {t(ACTION_I18N_KEYS[action])}{' '}
              <span className={ACTION_DELTAS[action] >= 0 ? 'text-green-600' : 'text-red-500'}>
                ({ACTION_DELTAS[action] >= 0 ? '+' : ''}{ACTION_DELTAS[action]} pts)
              </span>
            </span>
            <input
              aria-label={`${t(ACTION_I18N_KEYS[action])} count`}
              type="number"
              min={0}
              value={counts[action] ?? 0}
              onChange={(e) => setCount(action, Number(e.target.value))}
              className="w-20 rounded border px-2 py-1 text-sm text-right"
            />
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500">{t('reputation.currentScore')}</span>
          <span className="font-medium">{currentScore}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{t('reputation.netChange')}</span>
          <span className={delta >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
            {delta >= 0 ? '+' : ''}{delta}
          </span>
        </div>
        <div className="flex justify-between border-t pt-1">
          <span className="text-gray-700 font-medium">{t('reputation.projectedScore')}</span>
          <span className="font-bold">{projectedScore}</span>
        </div>
      </div>
    </div>
  );
}

export default ReputationSimulator;
