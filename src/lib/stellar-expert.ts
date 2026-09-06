// src/lib/stellar-expert.ts
/**
 * Generate a Stellar Expert explorer URL for a given transaction hash.
 * Returns an empty string if the hash is falsy or not a string.
 */
export function getStellarExplorerTxUrl(hash: string): string {
  if (!hash || typeof hash !== 'string') return '';
  // Ensure hash is trimmed and lowercased for consistency
  const cleanHash = hash.trim().toLowerCase();
  return `https://stellar.expert/explorer/public/tx/${cleanHash}`;
}
