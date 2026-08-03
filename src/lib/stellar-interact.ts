import * as StellarSdk from '@stellar/stellar-sdk';

const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

function decodeBase64(value: string): string {
  if (typeof atob === 'function') {
    return atob(value);
  }
  return Buffer.from(value, 'base64').toString();
}

/** Fetch Guardian reputation score from contract data entries. */
export async function getReputation(publicKey: string): Promise<number> {
  const account = await server.loadAccount(publicKey);
  const entry = (account.data_attr as Record<string, string>)['vero_reputation'];
  if (!entry) {
    return 0;
  }

  const decodedReputation = decodeBase64(entry).trim();
  const reputation = Number(decodedReputation);
  if (!Number.isInteger(reputation) || reputation < 0) {
    throw new Error('Stellar reputation data is invalid. Refresh the page or contact support if this continues.');
  }
  return reputation;
}
