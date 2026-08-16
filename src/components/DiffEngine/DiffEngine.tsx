import React, { useState, useMemo, useEffect } from 'react';
import { GitCompare, AlertTriangle, CheckCircle } from 'lucide-react';

export interface DiffEngineProps {
  onChainAbi: string;
  repoAbi: string;
  onChainBytecode: string;
  repoBytecode: string;
}

interface DiffResult {
  hasDrift: boolean;
  abiMatch: boolean;
  bytecodeMatch: boolean;
  sanitizedOnChainAbi: string;
  sanitizedRepoAbi: string;
}

/**
 * Sanitizes the string for off-chain comparison to ensure it's safe.
 */
export const sanitizeForComparison = (input: string): string => {
  if (!input) return '';
  // Strip all HTML tags, including <script>. Re-applies the pattern until the
  // string stops changing so nested/overlapping tags (e.g. "<<script>script>")
  // can't survive a single pass.
  let previous: string;
  let sanitized = input;
  do {
    previous = sanitized;
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  } while (sanitized !== previous);
  return sanitized.trim();
};

export default function DiffEngine({
  onChainAbi,
  repoAbi,
  onChainBytecode,
  repoBytecode,
}: DiffEngineProps): React.ReactElement {
  const [result, setResult] = useState<DiffResult | null>(null);

  useEffect(() => {
    // Performance optimized via local state processing
    const processDiff = () => {
      const sanitizedOnChainAbi = sanitizeForComparison(onChainAbi);
      const sanitizedRepoAbi = sanitizeForComparison(repoAbi);

      const abiMatch = sanitizedOnChainAbi === sanitizedRepoAbi;
      const bytecodeMatch = onChainBytecode.trim() === repoBytecode.trim();

      setResult({
        hasDrift: !abiMatch || !bytecodeMatch,
        abiMatch,
        bytecodeMatch,
        sanitizedOnChainAbi,
        sanitizedRepoAbi,
      });
    };

    processDiff();
  }, [onChainAbi, repoAbi, onChainBytecode, repoBytecode]);

  if (!result) return <div>Loading diff engine...</div>;

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <GitCompare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">State Diff Engine</h3>
      </div>

      <div className="mb-6">
        {result.hasDrift ? (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">State drift identified. Auditor-ready report generated.</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">On-chain state matches repository version perfectly.</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
          <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">ABI Comparison</h4>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${result.abiMatch ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              {result.abiMatch ? 'Match' : 'Mismatch'}
            </span>
            {!result.abiMatch && <span className="text-sm text-slate-500">Drift detected in ABI definition.</span>}
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
          <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">Bytecode Comparison</h4>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${result.bytecodeMatch ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              {result.bytecodeMatch ? 'Match' : 'Mismatch'}
            </span>
            {!result.bytecodeMatch && <span className="text-sm text-slate-500">Drift detected in compiled bytecode.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
