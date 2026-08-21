import * as StellarSdk from '@stellar/stellar-sdk';

export interface NetworkConfig {
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
}

export const DEFAULT_HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
export const DEFAULT_SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
export const DEFAULT_NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

/** Stellar data entry key used to store the consensus threshold on-chain. */
export const CONSENSUS_THRESHOLD_KEY = 'consensus_threshold';

export const defaultNetworkConfig: NetworkConfig = {
  horizonUrl: DEFAULT_HORIZON_URL,
  sorobanRpcUrl: DEFAULT_SOROBAN_RPC_URL,
  networkPassphrase: DEFAULT_NETWORK_PASSPHRASE,
};

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1']);

function isDevBuild(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Returns a user-facing validation error for Horizon/Soroban RPC URLs, or null if valid.
 * Only https is allowed; http is permitted solely for localhost/127.0.0.1 in non-production builds.
 */
export function getUrlValidationError(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL. Enter a full URL including the scheme (e.g. https://...).';
  }

  if (parsed.protocol === 'https:') {
    return null;
  }

  if (
    parsed.protocol === 'http:' &&
    isDevBuild() &&
    LOCALHOST_HOSTS.has(parsed.hostname)
  ) {
    return null;
  }

  if (parsed.protocol === 'http:') {
    return isDevBuild()
      ? 'HTTP is only allowed for localhost or 127.0.0.1 in development. Use HTTPS for all other endpoints.'
      : 'Only HTTPS URLs are allowed for Horizon and Soroban RPC endpoints.';
  }

  return 'Only HTTPS URLs are allowed for Horizon and Soroban RPC endpoints.';
}

export function validateUrl(url: string): boolean {
  return getUrlValidationError(url) === null;
}
