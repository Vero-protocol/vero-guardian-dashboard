'use client';

import { AlertTriangle, ShieldCheck, ShieldOff } from 'lucide-react';
import { useCallback, useMemo, useState, type ChangeEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { parseVulnerabilityResults, summarizeVulnerabilities } from './StateStateStateStateStatevulnerabilityParser';
import VulnerabilityList from './StateStateStateStateStateVulnerabilityList';
import type { VulnerabilityFinding, VulnerabilityParseResult, VulnerabilitySummary } from './StateStateStateStateStatetypes';

export interface SecurityScannerSnapshot {
  findings: VulnerabilityFinding[];
  criticalCount: number;
  totalCount: number;
  parseError: string | null;
}

interface SecurityScannerResultsProps {
  results?: unknown;
  allowInput?: boolean;
  heading?: string;
}

function toSnapshot(parseResult: VulnerabilityParseResult, summary: VulnerabilitySummary): SecurityScannerSnapshot {
  return {
    findings: parseResult.findings,
    criticalCount: summary.criticalCount,
    totalCount: summary.totalCount,
    parseError: parseResult.error,
  };
}

export function getSecurityScannerSnapshot(results: unknown): SecurityScannerSnapshot {
  const parseResult = parseVulnerabilityResults(results);
  return toSnapshot(parseResult, summarizeVulnerabilities(parseResult.findings));
}

export default function SecurityScannerResults({
  results,
  allowInput = true,
  heading,
}: SecurityScannerResultsProps): ReactElement {
  const { t } = useTranslation();
  const resolvedHeading = heading ?? t('securityScanner.heading');
  const [scannerInput, setScannerInput] = useState('');
  const scannerSource = scannerInput.trim() ? scannerInput : results ?? '';
  const parseResult = useMemo(() => parseVulnerabilityResults(scannerSource), [scannerSource]);
  const summary = useMemo(() => summarizeVulnerabilities(parseResult.findings), [parseResult.findings]);
  const snapshot = useMemo(() => toSnapshot(parseResult, summary), [parseResult, summary]);

  const handleScannerInputChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setScannerInput(event.target.value);
  }, []);

  return (
    <section aria-labelledby="security-scanner-results-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <h2 id="security-scanner-results-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            {resolvedHeading}
          </h2>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {snapshot.totalCount} {t('securityScanner.total')}
          </span>
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {snapshot.criticalCount} {t('securityScanner.critical')}
          </span>
        </div>
      </div>

      {allowInput ? (
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('securityScanner.scannerJson')}
          </span>
          <textarea
            value={scannerInput}
            onChange={handleScannerInputChange}
            rows={6}
            spellCheck={false}
            placeholder={t('securityScanner.placeholder')}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
      ) : null}

      {snapshot.parseError ? (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          <ShieldOff className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{snapshot.parseError}</p>
        </div>
      ) : null}

      {!snapshot.parseError && snapshot.criticalCount > 0 ? (
        <div
          role="status"
          className="flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            {t('securityScanner.criticalAlert')}
          </p>
        </div>
      ) : null}

      {!snapshot.parseError ? <VulnerabilityList findings={snapshot.findings} /> : null}
    </section>
  );
}
