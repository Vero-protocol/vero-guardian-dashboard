'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildGatewayUrl, isValidIpfsHash } from './ipfsDocViewer';

export interface IPFSDocViewerProps {
  /** Pre-set IPFS CID to load immediately. */
  initialHash?: string;
  /** Override the default IPFS gateway (https://ipfs.io/ipfs/). */
  gateway?: string;
}

export function IPFSDocViewer({ initialHash = '', gateway }: IPFSDocViewerProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState(initialHash);
  const [activeHash, setActiveHash] = useState(isValidIpfsHash(initialHash) ? initialHash : '');

  function handleLoad() {
    const trimmed = input.trim();
    if (!isValidIpfsHash(trimmed)) return;
    setActiveHash(trimmed);
  }

  const isInputValid = isValidIpfsHash(input.trim());
  const docUrl = activeHash ? buildGatewayUrl(activeHash, gateway) : '';

  return (
    <div className="rounded-xl border p-4 shadow-sm space-y-3">
      <h2 className="font-semibold text-lg">{t('ipfsDocViewer.heading')}</h2>

      <div className="flex gap-2">
        <input
          aria-label={t('ipfsDocViewer.inputAriaLabel')}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('ipfsDocViewer.placeholder')}
          className="flex-1 rounded border px-3 py-2 text-sm font-mono"
        />
        <button
          onClick={handleLoad}
          disabled={!isInputValid}
          className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {t('ipfsDocViewer.load')}
        </button>
      </div>

      {input.trim() && !isInputValid && (
        <p role="alert" className="text-sm text-red-600">
          {t('ipfsDocViewer.invalidHash')}
        </p>
      )}

      {docUrl && (
        <iframe
          key={docUrl}
          src={docUrl}
          title={t('ipfsDocViewer.iframeTitle', { hash: activeHash })}
          className="w-full h-96 rounded border"
          // allow-same-origin is intentionally omitted: combined with
          // allow-scripts it would let framed content (an arbitrary,
          // attacker-uploadable IPFS document) escape the sandbox and
          // access its own origin as if unsandboxed.
          sandbox="allow-scripts"
        />
      )}

      {!docUrl && (
        <p className="text-sm text-gray-500">{t('ipfsDocViewer.empty')}</p>
      )}
    </div>
  );
}

export default IPFSDocViewer;
