export type UserRole = 'admin' | 'guardian' | 'unauthorized';

import { DEFAULT_HORIZON_URL } from './rpc';
const INACTIVE_MARKER_VALUES: Record<string, true> = {
  false: true,
  '0': true,
  no: true,
  inactive: true,
  unauthorized: true,
};

type RoleMarkerPrefix = 'admin' | 'admins' | 'guardian' | 'guardians';

const ADMIN_MARKER_PREFIXES: readonly RoleMarkerPrefix[] = ['admin', 'admins'];
const GUARDIAN_MARKER_PREFIXES: readonly RoleMarkerPrefix[] = ['guardian', 'guardians'];

function decodeAccountDataValue(encodedValue: string): string | null {
  try {
    const normalizedValue = encodedValue.trim();
    if (
      normalizedValue.length % 4 === 1 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedValue)
    ) {
      return null;
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(normalizedValue, 'base64').toString('utf8');
    }

    if (typeof globalThis.atob === 'function') {
      const binaryValue = globalThis.atob(normalizedValue);
      const bytes = Uint8Array.from(binaryValue, (character) => character.charCodeAt(0));

      if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder().decode(bytes);
      }

      return binaryValue;
    }
  } catch {
    return null;
  }

  return null;
}

function getDecodedValue(data: Record<string, string | undefined>, key: string): string | null {
  const encodedValue = data[key];
  if (typeof encodedValue !== 'string') {
    return null;
  }

  return decodeAccountDataValue(encodedValue);
}

function isActiveMarker(data: Record<string, string | undefined>, key: string): boolean {
  const decodedValue = getDecodedValue(data, key);
  if (decodedValue === null) {
    return false;
  }

  return INACTIVE_MARKER_VALUES[decodedValue.trim().toLowerCase()] !== true;
}

function readRoleFromDataKey(
  data: Record<string, string | undefined>,
  key: string
): UserRole | null {
  const decodedValue = getDecodedValue(data, key)?.trim().toLowerCase();
  if (decodedValue === 'admin' || decodedValue === 'guardian') {
    return decodedValue;
  }

  return null;
}

function readScopedRole(
  data: Record<string, string | undefined>,
  publicKey: string
): UserRole | null {
  const colonRole = readRoleFromDataKey(data, `role:${publicKey}`);
  if (colonRole) {
    return colonRole;
  }

  return readRoleFromDataKey(data, `role_${publicKey}`);
}

function hasScopedActiveRoleMarker(
  data: Record<string, string | undefined>,
  publicKey: string,
  prefixes: readonly RoleMarkerPrefix[]
): boolean {
  for (const prefix of prefixes) {
    if (
      isActiveMarker(data, `${prefix}:${publicKey}`) ||
      isActiveMarker(data, `${prefix}_${publicKey}`)
    ) {
      return true;
    }
  }

  return false;
}

export async function fetchUserRole(
  publicKey: string,
  horizonUrl: string = DEFAULT_HORIZON_URL
): Promise<UserRole> {
  const registryAccount = process.env.NEXT_PUBLIC_ROLE_REGISTRY_ACCOUNT?.trim();
  const allowSelfRegistry = process.env.NEXT_PUBLIC_ALLOW_SELF_REGISTRY === 'true';

  if (!registryAccount && !allowSelfRegistry) {
    console.warn('SECURITY WARNING: NEXT_PUBLIC_ROLE_REGISTRY_ACCOUNT is unset and NEXT_PUBLIC_ALLOW_SELF_REGISTRY is false. Refusing self-account role fallback.');
    return 'unauthorized';
  }

  const accountId = registryAccount || publicKey;
  const response = await fetch(
    `${horizonUrl.replace(/\/+$/, '')}/accounts/${encodeURIComponent(accountId)}`
  );

  if (!response.ok) {
    throw new Error(`Unable to load Stellar role account ${accountId}: ${response.status}`);
  }

  const account = (await response.json()) as { data_attr?: Record<string, string | undefined> };
  const data = account.data_attr ?? {};
  const usesRegistryAccount = Boolean(registryAccount);
  const accountRole = usesRegistryAccount ? null : readRoleFromDataKey(data, 'role');
  const scopedRole = readScopedRole(data, publicKey);

  if (
    hasScopedActiveRoleMarker(data, publicKey, ADMIN_MARKER_PREFIXES) ||
    scopedRole === 'admin' ||
    (!usesRegistryAccount && isActiveMarker(data, 'admin')) ||
    accountRole === 'admin'
  ) {
    return 'admin';
  }

  if (
    hasScopedActiveRoleMarker(data, publicKey, GUARDIAN_MARKER_PREFIXES) ||
    scopedRole === 'guardian' ||
    (!usesRegistryAccount && isActiveMarker(data, 'guardian')) ||
    accountRole === 'guardian'
  ) {
    return 'guardian';
  }

  return 'unauthorized';
}
