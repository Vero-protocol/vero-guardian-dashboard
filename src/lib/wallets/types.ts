// src/lib/wallets/types.ts

/** Identifiers for the standard Stellar wallet providers the dashboard supports. */
export type WalletProviderId = 'freighter' | 'rabet';

/**
 * A pluggable adapter around a standard Stellar wallet provider. Adding support
 * for a new wallet is a matter of implementing this interface and registering
 * it in `src/lib/wallets/index.ts`.
 */
export interface StellarWalletProvider {
  /** Stable identifier, persisted to localStorage as the active provider. */
  id: WalletProviderId;
  /** Human-readable name shown in the wallet picker. */
  name: string;
  /** Whether the wallet is detected in the current browser. */
  isAvailable: () => boolean;
  /** Request access and resolve with the connected public key. Throws on failure. */
  connect: () => Promise<string>;
  /** Request the wallet to sign the given XDR transaction envelope. */
  signTransaction?: (xdr: string, opts?: { networkPassphrase?: string; network?: string }) => Promise<string>;
}

/** Serializable provider metadata exposed to UI components. */
export interface WalletProviderInfo {
  id: WalletProviderId;
  name: string;
  isAvailable: boolean;
}
