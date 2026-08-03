import React, { useEffect, useState } from 'react';
import { Download, Copy } from 'lucide-react';
import { fetchProofHistory } from '@/services/proofService';
import type { ProofRecord } from '@/types/proof';
import { useTranslation } from 'react-i18next';

/**
 * Premium styled table displaying ZK‑proof submission history.
 * Includes copy‑to‑clipboard for proof hash and download button for proof blob.
 */
const ProofHistoryTable: React.FC = () => {
  const { t } = useTranslation();
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchProofHistory();
        setProofs(data);
      } catch (e: any) {
        setError(e.message ?? t('proofs.failedLoad'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [t]);

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash).catch(() => {
      // ignore clipboard errors for now
    });
  };

  const handleDownload = (proof: ProofRecord) => {
    const blob = new Blob([proof.proofBlob], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proof.taskId}-${proof.timestamp}.proof`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="text-gray-500">{t('proofs.loading')}</div>;
  }

  if (error) {
    return <div className="text-red-600">{t('proofs.error', { message: error })}</div>;
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4 overflow-x-auto">
      <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">{t('proofs.heading')}</h3>
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-700">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium text-slate-600 dark:text-slate-300">{t('proofs.timestamp')}</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-slate-600 dark:text-slate-300">{t('proofs.taskId')}</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-slate-600 dark:text-slate-300">{t('proofs.proofHash')}</th>
            <th className="px-4 py-2 text-center text-sm font-medium text-slate-600 dark:text-slate-300">{t('proofs.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-600">
          {proofs.map((p) => (
            <tr key={p.proofHash} className="hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <td className="px-4 py-2 text-sm text-slate-800 dark:text-slate-200">{new Date(p.timestamp).toLocaleString()}</td>
              <td className="px-4 py-2 text-sm text-slate-800 dark:text-slate-200">{p.taskId}</td>
              <td className="px-4 py-2 text-sm text-slate-800 dark:text-slate-200 break-all">{p.proofHash}</td>
              <td className="px-4 py-2 text-center space-x-2">
                <button
                  onClick={() => handleCopy(p.proofHash)}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  aria-label={t('proofs.copyHash')}
                >
                  <Copy size={16} className="text-slate-600 dark:text-slate-300" />
                </button>
                <button
                  onClick={() => handleDownload(p)}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  aria-label={t('proofs.download')}
                >
                  <Download size={16} className="text-slate-600 dark:text-slate-300" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProofHistoryTable;
