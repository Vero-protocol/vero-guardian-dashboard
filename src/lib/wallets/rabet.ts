// src/lib/wallets/rabet.ts
'use client';

import type { StellarWalletProvider } from './types';
import { getWalletErrorMessage } from './utils';

interface RabetConnectResult {
  publicKey?: string;
}

interface RabetApi {
  connect: () => Promise<RabetConnectResult>;
  sign: (xdr: string, network: string) => Promise<{ xdr: string; error?: string }>;
}

declare global {
  interface Window {
    rabet?: RabetApi;
  }
}

function getRabet(): RabetApi | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.rabet;
}

export function isRabetAvailable(): boolean {
  return Boolean(getRabet());
}

export const rabetProvider: StellarWalletProvider = {
  id: 'rabet',
  name: 'Rabet',
  isAvailable: isRabetAvailable,
  connect: async () => {
    const rabet = getRabet();
    if (!rabet) {
      throw new Error('Rabet wallet is not installed');
    }

    let result: RabetConnectResult;
    try {
      result = await rabet.connect();
    } catch (error) {
      throw new Error(
        getWalletErrorMessage(error, 'Rabet could not grant wallet access. Open Rabet and try again.')
      );
    }

    if (!result?.publicKey) {
      throw new Error('Rabet did not return a wallet address. Unlock Rabet and try again.');
    }

    return result.publicKey;
  },
  signTransaction: async (xdr: string, opts?: { networkPassphrase?: string }) => {
    const rabet = getRabet();
    if (!rabet) {
      throw new Error('Rabet wallet is not installed');
    }
    const network = opts?.networkPassphrase?.includes('Test SDF Network') ? 'testnet' : 'mainnet';
    try {
      const result = await rabet.sign(xdr, network);
      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.xdr) {
        throw new Error('Rabet returned an empty signature');
      }
      return result.xdr;
    } catch (error) {
      throw new Error(
        getWalletErrorMessage(error, 'Rabet failed to sign the transaction')
      );
    }
  },
};
