'use client';

/**
 * SearchInput Component
 * Input field with real-time search suggestions
 */

import { Search, Loader2, AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isLoading?: boolean;
  error?: Error | null;
  onFocus?: () => void;
  onBlur?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = t("search.placeholder", { defaultValue: "Search contracts, functions, or on-chain data..." }),
  isLoading = false,
  error = null,
  onFocus,
  onBlur,
  disabled = false,
  autoFocus = false,
  ariaLabel = 'Search on-chain state',
}: SearchInputProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (error) {
      setHasError(true);
      const timer = setTimeout(() => setHasError(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">{ariaLabel}</span>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            onFocus={onFocus}
            onBlur={onBlur}
            aria-label={ariaLabel}
            aria-invalid={hasError}
            aria-describedby={error ? 'search-error' : undefined}
            className={`w-full rounded-xl border-2 bg-white px-10 py-3 text-sm font-medium text-slate-900 outline-none transition duration-200 dark:bg-slate-900 dark:text-white ${
              hasError
                ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-600'
                : 'border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700'
            } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-text'}`}
          />
          {isLoading && (
            <Loader2
              className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-indigo-500 dark:text-indigo-400"
              aria-hidden="true"
            />
          )}
        </div>
      </label>

      {error && (
        <div
          id="search-error"
          className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error.message}</span>
        </div>
      )}
    </div>
  );
}
