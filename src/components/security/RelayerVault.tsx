'use client';

import {
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  Copy,
  FileJson,
  Check,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export default function RelayerVault(): ReactElement {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'status' | 'encrypt' | 'verify'>('status');

  // Vault Status State
  const [status, setStatus] = useState<{
    configured: boolean;
    hardwareBacked: boolean;
    rawSecretPresent: boolean;
    warning?: string;
  } | null>(null);
  const [isStatusLoading, setIsStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');

  // Encrypt Form State
  const [secret, setSecret] = useState('');
  const [keyId, setKeyId] = useState('vero-guardian-relayer-key');
  const [hardwareBacked, setHardwareBacked] = useState(true);
  const [keyMaterial, setKeyMaterial] = useState('');
  const [encryptedRecord, setEncryptedRecord] = useState<any>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [showKeyMaterial, setShowKeyMaterial] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encryptError, setEncryptError] = useState('');
  const [copied, setCopied] = useState(false);

  // Verify Form State
  const [verifyRecordStr, setVerifyRecordStr] = useState('');
  const [verifyKeyMaterial, setVerifyKeyMaterial] = useState('');
  const [showVerifyKeyMaterial, setShowVerifyKeyMaterial] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; length?: number } | null>(null);
  const [verifyError, setVerifyError] = useState('');

  // Fetch Vault Status
  const fetchStatus = useCallback(async () => {
    setIsStatusLoading(true);
    try {
      const res = await fetch('/api/vault');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setStatusError('');
      } else {
        setStatusError(
          t('relayerVault.statusLoadError', 'Unable to load vault status. Please try again.'),
        );
      }
    } catch {
      setStatusError(
        t('relayerVault.statusLoadError', 'Unable to load vault status. Please try again.'),
      );
    } finally {
      setIsStatusLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle Encrypt
  const handleEncrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    setEncryptError('');
    setEncryptedRecord(null);
    setIsEncrypting(true);

    try {
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'encrypt',
          secret: secret.trim(),
          keyId: keyId.trim(),
          hardwareBacked,
          keyMaterial: keyMaterial.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setEncryptedRecord(data.record);
      } else {
        setEncryptError(data.error || 'Failed to encrypt secret');
      }
    } catch (err: any) {
      setEncryptError(err.message || 'An error occurred during encryption');
    } finally {
      setIsEncrypting(false);
    }
  };

  // Handle Verify
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError('');
    setVerifyResult(null);
    setIsVerifying(true);

    try {
      let parsedRecord;
      try {
        parsedRecord = JSON.parse(verifyRecordStr.trim());
      } catch {
        throw new Error('Invalid JSON format for Vault Record');
      }

      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          record: parsedRecord,
          keyMaterial: verifyKeyMaterial.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setVerifyResult(data);
      } else {
        setVerifyError(data.error || 'Verification failed');
      }
    } catch (err: any) {
      setVerifyError(err.message || 'An error occurred during verification');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopy = () => {
    if (encryptedRecord) {
      navigator.clipboard.writeText(JSON.stringify(encryptedRecord, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="relayer-vault-title">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <h2 id="relayer-vault-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            {t('relayerVault.title', 'Relayer Credential Vault')}
          </h2>
        </div>
        <button
          onClick={fetchStatus}
          disabled={isStatusLoading}
          className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors disabled:opacity-50"
          aria-label={t('common.refresh', 'Refresh status')}
        >
          <RefreshCw className={`h-4 w-4 ${isStatusLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-sm">
        <button
          onClick={() => setActiveTab('status')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'status'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {t('relayerVault.tabStatus', 'Vault Status')}
        </button>
        <button
          onClick={() => setActiveTab('encrypt')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'encrypt'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {t('relayerVault.tabEncrypt', 'Encrypt Key')}
        </button>
        <button
          onClick={() => setActiveTab('verify')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'verify'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {t('relayerVault.tabVerify', 'Verify Retrieval')}
        </button>
      </div>

      {/* Tab Contents */}
      <div className="mt-4">
        {/* TAB 1: STATUS */}
        {activeTab === 'status' && (
          <div className="space-y-4">
            {statusError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-950/40 dark:bg-red-950/20 dark:text-red-300"
              >
                <span className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
                  {statusError}
                </span>
                <button
                  type="button"
                  onClick={fetchStatus}
                  disabled={isStatusLoading}
                  className="shrink-0 rounded-lg border border-red-300 px-2.5 py-1 font-semibold transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950/40"
                >
                  {isStatusLoading
                    ? t('common.retrying', 'Retrying...')
                    : t('common.tryAgain', 'Try again')}
                </button>
              </div>
            )}
            {status ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                  {status.configured ? (
                    <ShieldCheck className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <ShieldAlert className="h-6 w-6 text-amber-500" />
                  )}
                  <div>
                    <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                      {status.configured
                        ? t('relayerVault.statusConfigured', 'Vault Configured')
                        : t('relayerVault.statusNotConfigured', 'Vault Not Configured')}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {status.configured
                        ? t('relayerVault.statusConfiguredDesc', 'STELLAR_SECRET_KEY is loaded securely via vault storage.')
                        : t('relayerVault.statusNotConfiguredDesc', 'STELLAR_SECRET_KEY is missing or unconfigured.')}
                    </p>
                  </div>
                </div>

                {status.configured && (
                  <div className="flex items-center gap-3 p-3 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <Lock className="h-6 w-6 text-indigo-500" />
                    <div>
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                        {status.hardwareBacked
                          ? t('relayerVault.hardwareBacked', 'Hardware-Backed Storage')
                          : t('relayerVault.softwareBacked', 'Software-Based Storage')}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {status.hardwareBacked
                          ? t('relayerVault.hardwareBackedDesc', 'Key material protected via hardware-backed security (e.g., HSM, TPM).')
                          : t('relayerVault.softwareBackedDesc', 'Key material managed inside software environments.')}
                      </p>
                    </div>
                  </div>
                )}

                {status.warning && (
                  <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-800 dark:border-red-950/40 dark:bg-red-950/20 dark:text-red-300 text-xs flex gap-2">
                    <ShieldAlert className="h-5 w-5 shrink-0 text-red-500" />
                    <p>{status.warning}</p>
                  </div>
                )}
              </div>
            ) : !statusError ? (
              <div className="text-sm text-slate-500 animate-pulse">
                {t('relayerVault.loadingStatus', 'Fetching vault status...')}
              </div>
            ) : null}
          </div>
        )}

        {/* TAB 2: ENCRYPT */}
        {activeTab === 'encrypt' && (
          <form onSubmit={handleEncrypt} className="space-y-4">
            <div className="grid gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  {t('relayerVault.secretLabel', 'Stellar Secret Key (to encrypt)')}
                  <div className="relative mt-1">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      required
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      placeholder="S..."
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-10 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                    {t('relayerVault.keyIdLabel', 'Key Provider ID')}
                    <input
                      type="text"
                      required
                      value={keyId}
                      onChange={(e) => setKeyId(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </label>
                </div>

                <div>
                  <span className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">
                    {t('relayerVault.hardwareBackedLabel', 'Hardware Backed')}
                  </span>
                  <div className="flex items-center h-10">
                    <input
                      type="checkbox"
                      id="hardwareBacked"
                      checked={hardwareBacked}
                      onChange={(e) => setHardwareBacked(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                    />
                    <label htmlFor="hardwareBacked" className="ml-2 text-sm text-slate-600 dark:text-slate-400 font-medium">
                      {t('relayerVault.hardwareBackedCheck', 'Hardware-backed provider')}
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 font-medium">
                  {t('relayerVault.keyMaterialLabel', 'Hardware Key Material / Token')}
                  <div className="relative mt-1">
                    <input
                      type={showKeyMaterial ? 'text' : 'password'}
                      required
                      value={keyMaterial}
                      onChange={(e) => setKeyMaterial(e.target.value)}
                      placeholder={t('relayerVault.keyMaterialPlace', 'Password, token, or seed phrase')}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-10 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeyMaterial(!showKeyMaterial)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showKeyMaterial ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isEncrypting}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
            >
              {isEncrypting ? t('relayerVault.encrypting', 'Encrypting...') : t('relayerVault.btnEncrypt', 'Generate Vault Record')}
            </button>

            {encryptError && (
              <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-800 dark:border-red-950/40 dark:bg-red-950/20 dark:text-red-300 text-xs">
                {encryptError}
              </div>
            )}

            {encryptedRecord && (
              <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <FileJson className="h-4 w-4 text-indigo-500" />
                    {t('relayerVault.encryptedRecord', 'Vault Record (JSON)')}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? t('common.copied', 'Copied!') : t('common.copy', 'Copy')}
                  </button>
                </div>
                <pre className="font-mono text-[10px] text-slate-800 dark:text-slate-300 overflow-x-auto p-2 bg-white dark:bg-slate-950 rounded border border-slate-100 dark:border-slate-800 max-h-40">
                  {JSON.stringify(encryptedRecord, null, 2)}
                </pre>
                <p className="text-[10px] text-slate-500">
                  {t('relayerVault.envGuide', 'Copy the JSON record above and add it as the env variable: RELAYER_VAULT_STELLAR_SECRET_KEY')}
                </p>
              </div>
            )}
          </form>
        )}

        {/* TAB 3: VERIFY */}
        {activeTab === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="grid gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  {t('relayerVault.recordLabel', 'Vault Record JSON')}
                  <textarea
                    required
                    rows={4}
                    value={verifyRecordStr}
                    onChange={(e) => setVerifyRecordStr(e.target.value)}
                    placeholder='{"version":1,"algorithm":"AES-256-GCM",...}'
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  {t('relayerVault.keyMaterialLabel', 'Hardware Key Material / Token')}
                  <div className="relative mt-1">
                    <input
                      type={showVerifyKeyMaterial ? 'text' : 'password'}
                      required
                      value={verifyKeyMaterial}
                      onChange={(e) => setVerifyKeyMaterial(e.target.value)}
                      placeholder={t('relayerVault.keyMaterialPlace', 'Password, token, or seed phrase')}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-10 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowVerifyKeyMaterial(!showVerifyKeyMaterial)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showVerifyKeyMaterial ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isVerifying}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
            >
              {isVerifying ? t('relayerVault.verifying', 'Verifying...') : t('relayerVault.btnVerify', 'Verify Key Retrieval')}
            </button>

            {verifyError && (
              <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-800 dark:border-red-950/40 dark:bg-red-950/20 dark:text-red-300 text-xs">
                {verifyError}
              </div>
            )}

            {verifyResult && (
              <div className="flex items-center gap-3 p-3 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                {verifyResult.success ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                ) : (
                  <ShieldAlert className="h-6 w-6 text-red-500" />
                )}
                <div>
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                    {verifyResult.success
                      ? t('relayerVault.verifySuccess', 'Verification Successful')
                      : t('relayerVault.verifyFailed', 'Verification Failed')}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {verifyResult.success
                      ? t('relayerVault.verifySuccessDesc', '✓ Decrypted Stellar key matches format requirements. Key remains securely in memory.')
                      : t('relayerVault.verifyFailedDesc', 'Failed to retrieve key matching format requirements.')}
                  </p>
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
