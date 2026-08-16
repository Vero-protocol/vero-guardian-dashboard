// src/lib/wallets/freighter.ts
'use client';

import * as freighterApi from '@stellar/freighter-api';
import type { StellarWalletProvider } from './types';
import { getWalletErrorMessage } from './utils';

declare global {
  interface Window {
    freighter?: unknown;
  }
}

interface FreighterResultError {
  message?: string;
}

export interface FreighterWalletWatcher {
  watch: (callback: (params: { address?: string; error?: FreighterResultError }) => void) => {
    error?: FreighterResultError;
  };
  stop: () => void;
}

interface FreighterApiCompat {
  getPublicKey?: () => Promise<string>;
  isConnected?: () => Promise<{ isConnected: boolean; error?: FreighterResultError }>;
  getAddress?: () => Promise<{ address: string; error?: FreighterResultError }>;
  requestAccess?: () => Promise<{ address: string; error?: FreighterResultError }>;
  WatchWalletChanges?: new (timeout?: number) => FreighterWalletWatcher;
}

export const freighterClient = freighterApi as FreighterApiCompat;

export function isFreighterAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.freighter);
}

/** Request access from Freighter and return the granted public key. */
export async function requestFreighterPublicKey(): Promise<string> {
  if (typeof freighterClient.requestAccess === 'function') {
    let access;
    try {
      access = await freighterClient.requestAccess();
    } catch (error) {
      throw new Error(
        getWalletErrorMessage(error, 'Freighter could not grant wallet access. Open Freighter and try again.')
      );
    }
    if (access.error) {
      throw new Error(
        getWalletErrorMessage(access.error, 'Freighter could not grant wallet access. Open Freighter and try again.')
      );
    }

    if (!access.address) {
      throw new Error('Freighter did not return a wallet address. Unlock Freighter and try again.');
    }

    return access.address;
  }

  if (typeof freighterClient.getPublicKey === 'function') {
    let publicKey;
    try {
      publicKey = await freighterClient.getPublicKey();
    } catch (error) {
      throw new Error(
        getWalletErrorMessage(error, 'Freighter wallet API is unavailable')
      );
    }
    if (!publicKey) {
      throw new Error('Freighter did not return a wallet public key');
    }
    return publicKey;
  }

  throw new Error('Freighter wallet API is unavailable');
}

/** Read the currently connected Freighter address, or null when disconnected. */
export async function readCurrentFreighterPublicKey(): Promise<string | null> {
  if (!isFreighterAvailable()) {
    return null;
  }

  if (
    typeof freighterClient.isConnected === 'function' &&
    typeof freighterClient.getAddress === 'function'
  ) {
    const connection = await freighterClient.isConnected();
    if (connection.error) {
      throw new Error(
        getWalletErrorMessage(connection.error, 'Unable to verify Freighter wallet connection.')
      );
    }

    if (!connection.isConnected) {
      return null;
    }

    const address = await freighterClient.getAddress();
    if (address.error) {
      throw new Error(getWalletErrorMessage(address.error, 'Unable to read Freighter wallet address.'));
    }

    return address.address || null;
  }

  if (typeof freighterClient.getPublicKey === 'function') {
    const publicKey = await freighterClient.getPublicKey();
    return publicKey || null;
  }

  return null;
}

export const freighterProvider: StellarWalletProvider = {
  id: 'freighter',
  name: 'Freighter',
  isAvailable: isFreighterAvailable,
  connect: async () => {
    if (!isFreighterAvailable()) {
      throw new Error('Freighter wallet is not installed');
    }
    return requestFreighterPublicKey();
  },
};
