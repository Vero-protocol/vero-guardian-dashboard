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
  signTransaction?: (xdr: string, opts?: { networkPassphrase?: string; network?: string }) => Promise<{ signedTxXdr?: string; error?: string | { message?: string } }>;
}

export const freighterClient = freighterApi as FreighterApiCompat;

export function isFreighterAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.freighter);
}

/** Request access from Freighter and return the granted public key. */
export async function requestFreighterPublicKey(): Promise<string> {
  try{
    
    if (typeof freighterClient.requestAccess === 'function') {
      const access = await freighterClient.requestAccess();
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
      const publicKey = await freighterClient.getPublicKey();
      if (!publicKey) {
        throw new Error('Freighter did not return a wallet public key');
      }
      return publicKey;
    }
  
    throw new Error('Freighter wallet API is unavailable');
  } catch (err) {
		throw new Error(
			getWalletErrorMessage(
				err,
				'Unable to connect to Freighter. Open Freighter and try again.'
			)
		);
	}
}

/** Read the currently connected Freighter address, or null when disconnected. */
export async function readCurrentFreighterPublicKey(): Promise<string | null> {
  if (!isFreighterAvailable()) {
    return null;
  }

  try{

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
  } catch (err) {
		throw new Error(
			getWalletErrorMessage(
				err,
				'Unable to read Freighter wallet information.'
			)
		);
	}

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
  signTransaction: async (xdr: string, opts?: { networkPassphrase?: string }) => {
    if (typeof freighterClient.signTransaction !== 'function') {
      throw new Error('Freighter signTransaction API is unavailable');
    }
   
    try{

      const result = await freighterClient.signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase,
      });
      if (result.error) {
        const msg = typeof result.error === 'string' ? result.error : result.error.message;
        throw new Error(msg ?? 'Freighter failed to sign the transaction');
      }
      if (!result.signedTxXdr) {
        throw new Error('Freighter returned an empty signature');
      }
      return result.signedTxXdr;
    } catch(err){
      throw new Error(
        getWalletErrorMessage(
          err, 'Freighter failed to sign the transaction. Try again!'
        )
      );
    }
  },
};
