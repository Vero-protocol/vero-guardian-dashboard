'use client';

import { X, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAlerts, type AlertType } from '@/context/AlertContext';

const TYPE_PRIORITY: Record<AlertType, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function alertStyles(type: AlertType): string {
  switch (type) {
    case 'critical':
      return 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200';
    case 'warning':
      return 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200';
    case 'info':
      return 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200';
  }
}

function AlertIcon({ type }: { type: AlertType }) {
  if (type === 'info') {
    return <Info className="w-5 h-5 shrink-0" aria-hidden="true" />;
  }
  return <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />;
}

export function AlertBanner() {
  const { alerts, dismissAlert } = useAlerts();
  const { t } = useTranslation();

  const active = alerts.length === 0
    ? null
    : alerts.reduce((best, a) =>
        TYPE_PRIORITY[a.type] < TYPE_PRIORITY[best.type] ? a : best,
      );

  if (!active) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex items-start gap-3 px-4 py-3 sticky top-[64px] z-50 border-b ${alertStyles(active.type)}`}
    >
      <AlertIcon type={active.type} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{active.title}</p>
        {active.message && (
          <p className="text-sm opacity-90 mt-0.5">{active.message}</p>
        )}
      </div>
      {active.dismissable && (
        <button
          onClick={() => dismissAlert(active.id)}
          aria-label={t('alertBanner.dismissAlert', 'Dismiss alert')}
          className="shrink-0 opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded p-0.5"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default AlertBanner;
