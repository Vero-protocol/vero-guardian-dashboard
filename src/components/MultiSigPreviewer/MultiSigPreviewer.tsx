'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  computeThreshold,
  parseProposalXdr,
  simulateProposal,
  type MultiSigSigner,
  type ParsedProposal,
  type SimulationResult,
  type SignerThreshold,
} from './multiSigPreviewerState';
import { DEFAULT_SOROBAN_RPC_URL, DEFAULT_NETWORK_PASSPHRASE } from '@/services/rpc';

export interface MultiSigPreviewerProps {
  networkPassphrase?: string;
  sorobanRpcUrl?: string;
}

export function MultiSigPreviewer({
  networkPassphrase = DEFAULT_NETWORK_PASSPHRASE,
  sorobanRpcUrl = DEFAULT_SOROBAN_RPC_URL,
}: MultiSigPreviewerProps) {
  const { t } = useTranslation();
  const [xdr, setXdr] = useState('');
  const [requiredThreshold, setRequiredThreshold] = useState(2);
  const [signers, setSigners] = useState<MultiSigSigner[]>([
    { publicKey: '', weight: 1, signed: false },
  ]);
  const [proposal, setProposal] = useState<ParsedProposal | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [threshold, setThreshold] = useState<SignerThreshold | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  function handleXdrChange(value: string) {
    setXdr(value);
    setProposal(null);
    setSimulation(null);
    setParseError(null);
  }

  function handleToggleSigned(index: number) {
    const updated = signers.map((s, i) =>
      i === index ? { ...s, signed: !s.signed } : s,
    );
    setSigners(updated);
    setThreshold(computeThreshold(updated, requiredThreshold));
  }

  function handleAddSigner() {
    setSigners((prev) => [...prev, { publicKey: '', weight: 1, signed: false }]);
  }

  function handleRemoveSigner(index: number) {
    const updated = signers.filter((_, i) => i !== index);
    setSigners(updated);
    setThreshold(computeThreshold(updated, requiredThreshold));
  }

  async function handlePreview() {
    const trimmed = xdr.trim();
    if (!trimmed) return;

    setParseError(null);
    setProposal(null);
    setSimulation(null);

    let parsed: ParsedProposal;
    try {
      parsed = parseProposalXdr(trimmed, networkPassphrase);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse XDR');
      return;
    }

    setProposal(parsed);
    setThreshold(computeThreshold(signers, requiredThreshold));
    setLoading(true);

    try {
      const sim = await simulateProposal(trimmed, networkPassphrase, sorobanRpcUrl);
      setSimulation(sim);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border p-4 shadow-sm space-y-4">
      <h2 className="font-semibold text-lg">{t('multiSig.heading')}</h2>

      {/* XDR Input */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="xdr-input">
          {t('multiSig.xdrLabel')}
        </label>
        <textarea
          id="xdr-input"
          value={xdr}
          onChange={(e) => handleXdrChange(e.target.value)}
          placeholder={t('multiSig.xdrPlaceholder')}
          rows={3}
          className="w-full rounded border px-3 py-2 text-sm font-mono"
        />
        {parseError && (
          <p role="alert" className="text-sm text-red-600">{parseError}</p>
        )}
      </div>

      {/* Threshold */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="threshold-input">
          {t('multiSig.threshold')}
        </label>
        <input
          id="threshold-input"
          type="number"
          min={1}
          value={requiredThreshold}
          onChange={(e) => setRequiredThreshold(Math.max(1, Number(e.target.value)))}
          className="w-20 rounded border px-2 py-1 text-sm"
        />
      </div>

      {/* Signer list */}
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('multiSig.signers')}</p>
        {signers.map((signer, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              aria-label={`${t('multiSig.signerKey')} ${index + 1}`}
              type="text"
              value={signer.publicKey}
              onChange={(e) => {
                const updated = signers.map((s, i) =>
                  i === index ? { ...s, publicKey: e.target.value } : s,
                );
                setSigners(updated);
              }}
              placeholder={t('multiSig.signerPlaceholder')}
              className="flex-1 rounded border px-2 py-1 text-sm font-mono"
            />
            <input
              aria-label={`${t('multiSig.weight')} ${index + 1}`}
              type="number"
              min={1}
              value={signer.weight}
              onChange={(e) => {
                const updated = signers.map((s, i) =>
                  i === index ? { ...s, weight: Math.max(1, Number(e.target.value)) } : s,
                );
                setSigners(updated);
              }}
              className="w-16 rounded border px-2 py-1 text-sm"
            />
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={signer.signed}
                onChange={() => handleToggleSigned(index)}
                aria-label={`${t('multiSig.signed')} ${index + 1}`}
              />
              {t('multiSig.signed')}
            </label>
            {signers.length > 1 && (
              <button
                onClick={() => handleRemoveSigner(index)}
                aria-label={`${t('multiSig.removeSigner')} ${index + 1}`}
                className="text-red-500 text-sm"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          onClick={handleAddSigner}
          className="text-sm text-indigo-600 hover:underline"
        >
          + {t('multiSig.addSigner')}
        </button>
      </div>

      {/* Preview button */}
      <button
        onClick={handlePreview}
        disabled={!xdr.trim() || loading}
        className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {loading ? t('multiSig.simulating') : t('multiSig.preview')}
      </button>

      {/* Results */}
      {proposal && (
        <div className="rounded-lg bg-gray-50 p-3 space-y-2 text-sm">
          <p><span className="font-medium">{t('multiSig.source')}:</span> {proposal.sourceAccount}</p>
          <p><span className="font-medium">{t('multiSig.fee')}:</span> {proposal.fee} stroops</p>
          <p><span className="font-medium">{t('multiSig.operations')}:</span> {proposal.operationCount}</p>
          <ul className="list-disc pl-5 space-y-1">
            {proposal.operations.map((op, i) => (
              <li key={i} className="font-mono">{op}</li>
            ))}
          </ul>
        </div>
      )}

      {threshold && (
        <div className={`rounded-lg p-3 text-sm ${threshold.met ? 'bg-green-50' : 'bg-yellow-50'}`}>
          <p className="font-medium">
            {t('multiSig.signerWeight')}: {threshold.current} / {threshold.required}{' '}
            {threshold.met
              ? <span className="text-green-700">✓ {t('multiSig.thresholdMet')}</span>
              : <span className="text-yellow-700">⚠ {t('multiSig.thresholdNotMet')}</span>}
          </p>
        </div>
      )}

      {simulation && (
        <div className={`rounded-lg p-3 text-sm ${simulation.success ? 'bg-green-50' : 'bg-red-50'}`}>
          {simulation.success ? (
            <p className="text-green-700">
              ✓ {t('multiSig.simSuccess')} — {t('multiSig.fee')}: {simulation.fee} stroops
            </p>
          ) : (
            <p role="alert" className="text-red-700">
              ✗ {t('multiSig.simError')}: {simulation.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default MultiSigPreviewer;
