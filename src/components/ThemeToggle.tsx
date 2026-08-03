'use client';

import type { ReactElement } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '@/context/ThemeContext';

/** Cycle order: light → dark → system → light */
const CYCLE: Theme[] = ['light', 'dark', 'system'];

function next(current: Theme): Theme {
  const idx = CYCLE.indexOf(current);
  return CYCLE[(idx + 1) % CYCLE.length];
}

const ICONS: Record<Theme, ReactElement> = {
  light: <Sun className="w-5 h-5 text-amber-500 dark:text-amber-400" aria-hidden="true" />,
  dark: <Moon className="w-5 h-5 text-violet-500 dark:text-violet-400" aria-hidden="true" />,
  system: <Monitor className="w-5 h-5 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />,
};

export default function ThemeToggle(): ReactElement {
  const { t } = useTranslation();
  const { theme, setTheme, mounted } = useTheme();

  // Render a same-size invisible placeholder before mount to avoid layout shift.
  if (!mounted) {
    return (
      <div
        className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 opacity-0"
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(next(theme))}
      aria-label={t('theme.ariaLabel', { theme })}
      title={t('theme.ariaLabel', { theme })}
      className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
    >
      {ICONS[theme]}
    </button>
  );
}
