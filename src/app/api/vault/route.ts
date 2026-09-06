import { NextResponse } from 'next/server';
import { getVaultSecretStatus } from '@/services/vault-node';
import {
  Vault,
  MemoryVaultStore,
  createHardwareBackedProvider,
  createSoftwareProviderForTests,
} from '@/services/vault';
import { createRateLimiter } from '@/lib/rate-limit';

// 10 req/min per IP — POST actions run AES-GCM key derivation and crypto
// operations; GET does a synchronous status read but shares the same budget
// to prevent enumeration probing.
const rateLimiter = createRateLimiter({ limit: 10 });

function isAuthorized(request: Request): boolean {
  const secret = process.env.VERO_API_SECRET;
  // When no secret is configured (local development), allow the request.
  if (!secret) return true;
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

function safeError(message = 'Internal server error.', status = 500, logError?: unknown) {
  if (logError !== undefined) {
    console.error('[vault]', logError);
  }
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const limited = rateLimiter(request);
  if (limited) return limited;

  if (!isAuthorized(request)) {
    return safeError('Unauthorized.', 401);
  }

  try {
    const status = getVaultSecretStatus('STELLAR_SECRET_KEY');
    return NextResponse.json(status);
  } catch (error) {
    return safeError('Unable to read vault status.', 500, error);
  }
}

export async function POST(request: Request) {
  const limited = rateLimiter(request);
  if (limited) return limited;

  if (!isAuthorized(request)) {
    return safeError('Unauthorized.', 401);
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'encrypt') {
      const { secret, keyId, hardwareBacked, keyMaterial } = body;
      if (!secret || !keyId || !keyMaterial) {
        return safeError('Missing required parameters.', 400);
      }

      const store = new MemoryVaultStore();
      const provider = hardwareBacked
        ? createHardwareBackedProvider(keyId, async () => keyMaterial)
        : createSoftwareProviderForTests(keyMaterial);

      const vault = new Vault({
        store,
        keyProvider: provider,
        allowSoftwareProvider: !hardwareBacked,
      });

      const record = await vault.putSecret('STELLAR_SECRET_KEY', secret);
      return NextResponse.json({ success: true, record });
    }

    if (action === 'verify') {
      const { record, keyMaterial } = body;
      if (!record || !keyMaterial) {
        return safeError('Missing required parameters.', 400);
      }

      const store = new MemoryVaultStore();
      await store.set('STELLAR_SECRET_KEY', record);

      const provider = record.hardwareBacked
        ? createHardwareBackedProvider(record.keyId, async () => keyMaterial)
        : createSoftwareProviderForTests(keyMaterial);

      const vault = new Vault({
        store,
        keyProvider: provider,
        allowSoftwareProvider: !record.hardwareBacked,
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

    return safeError('Invalid action.', 400);
  } catch (error) {
    return safeError('Vault operation failed.', 500, error);
  }
}
