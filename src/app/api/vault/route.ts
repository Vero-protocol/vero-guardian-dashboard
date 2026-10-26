import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import * as vaultNode from '@/services/vault-node';
import {
  Vault,
  MemoryVaultStore,
  createHardwareBackedProvider,
  createSoftwareProviderForTests,
  type VaultRecord,
} from '@/services/vault';
import { createRateLimiter } from '@/lib/rate-limit';

// 10 req/min per IP — POST actions run AES-GCM key derivation and crypto
// operations; GET does a synchronous status read but shares the same budget
// to prevent enumeration probing.
const rateLimiter = createRateLimiter({ limit: 10 });

function safeEqualStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}

function authorizeVaultRequest(
  request: Request,
  options: { requireAuth: boolean },
): NextResponse | null {
  const configuredToken = process.env.VAULT_API_KEY?.trim();
  const providedToken =
    extractBearerToken(request.headers.get('authorization')) ??
    request.headers.get('x-api-key')?.trim() ??
    null;

  let hasValidToken = false;
  if (configuredToken) {
    if (!providedToken || !safeEqualStrings(providedToken, configuredToken)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    hasValidToken = true;
  } else if (providedToken) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const rawRole =
    request.headers.get('x-vero-role') ?? request.headers.get('x-user-role');
  const normalizedRole = rawRole?.trim().toLowerCase();

  if (normalizedRole && normalizedRole !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden: admin access required.' },
      { status: 403 },
    );
  }

  if (options.requireAuth && normalizedRole !== 'admin' && !hasValidToken) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  return null;
}

export async function GET(request: Request) {
  const limited = rateLimiter(request);
  if (limited) return limited;

  const authError = authorizeVaultRequest(request, { requireAuth: false });
  if (authError) return authError;

  try {
    const status = vaultNode.getVaultSecretStatus('STELLAR_SECRET_KEY');
    return NextResponse.json(status);
  } catch (error) {
    console.error('[api/vault] Failed to retrieve vault status:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve vault status.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const limited = rateLimiter(request);
  if (limited) return limited;

  const authError = authorizeVaultRequest(request, { requireAuth: true });
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'Invalid request payload.' },
        { status: 400 },
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Invalid request payload.' },
      { status: 400 },
    );
  }

  try {
    const { action } = body;

    if (action === 'encrypt') {
      const { secret, keyId, hardwareBacked, keyMaterial } = body;
      if (
        typeof secret !== 'string' ||
        !secret ||
        typeof keyId !== 'string' ||
        !keyId ||
        typeof keyMaterial !== 'string' ||
        !keyMaterial
      ) {
        return NextResponse.json(
          { error: 'Missing required parameters' },
          { status: 400 },
        );
      }

      const isHardwareBacked = Boolean(hardwareBacked);
      const store = new MemoryVaultStore();
      const provider = isHardwareBacked
        ? createHardwareBackedProvider(keyId, async () => keyMaterial)
        : createSoftwareProviderForTests(keyMaterial);

      const vault = new Vault({
        store,
        keyProvider: provider,
        allowSoftwareProvider: !isHardwareBacked,
      });

      const record = await vault.putSecret('STELLAR_SECRET_KEY', secret);
      return NextResponse.json({ success: true, record });
    }

    if (action === 'verify') {
      const { record, keyMaterial } = body;
      if (
        !record ||
        typeof record !== 'object' ||
        typeof keyMaterial !== 'string' ||
        !keyMaterial
      ) {
        return NextResponse.json(
          { error: 'Missing required parameters' },
          { status: 400 },
        );
      }

      const vaultRecord = record as VaultRecord;
      const store = new MemoryVaultStore();
      await store.set('STELLAR_SECRET_KEY', vaultRecord);

      const provider = vaultRecord.hardwareBacked
        ? createHardwareBackedProvider(vaultRecord.keyId, async () => keyMaterial)
        : createSoftwareProviderForTests(keyMaterial);

      const vault = new Vault({
        store,
        keyProvider: provider,
        allowSoftwareProvider: !vaultRecord.hardwareBacked,
      });

      let verified = false;
      let length = 0;
      await vault.withSecret('STELLAR_SECRET_KEY', (secretBuffer) => {
        const secretStr = secretBuffer.toString('utf8');
        if (secretStr.startsWith('S') && secretStr.length === 56) {
          verified = true;
          length = secretStr.length;
        }
      });

      return NextResponse.json({ success: verified, length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[api/vault] Vault operation failed:', error);
    return NextResponse.json(
      { error: 'Vault operation failed.' },
      { status: 500 },
    );
  }
}
