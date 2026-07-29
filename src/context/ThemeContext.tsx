'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'vero.guardian.theme';

interface ThemeContextType {
  /** The user's explicit preference: 'light', 'dark', or 'system'. */
  theme: Theme;
  /** The actual resolved theme applied to the document. */
  resolvedTheme: 'light' | 'dark';
  /** Whether the provider has finished reading localStorage (safe to render theme-dependent UI). */
  mounted: boolean;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Inline script injected into <head> to apply the saved theme before first paint, preventing flash. */
export const themeScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=document.documentElement;if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){d.classList.add('dark');}else{d.classList.remove('dark');}}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');
  const [mounted, setMounted] = useState(false);

  // On mount: read persisted preference from localStorage.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved);
      }
    } catch {
      // Ignore unavailable localStorage and keep the system default.
    }
    setMounted(true);
  }, []);

  // Whenever theme or mount state changes: resolve and apply to <html>.
  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function applyTheme() {
      const resolved: 'light' | 'dark' =
        theme === 'system'
          ? mediaQuery.matches ? 'dark' : 'light'
          : theme;

      setResolvedTheme(resolved);

      const root = window.document.documentElement;
      if (resolved === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }

    applyTheme();
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore unavailable localStorage; the in-memory theme still applies.
    }

    // Only watch the system preference when in 'system' mode.
    if (theme === 'system') {
      mediaQuery.addEventListener('change', applyTheme);
      return () => mediaQuery.removeEventListener('change', applyTheme);
    }
  }, [theme, mounted]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextType>(
    () => ({ theme, resolvedTheme, mounted, setTheme }),
    [theme, resolvedTheme, mounted, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
