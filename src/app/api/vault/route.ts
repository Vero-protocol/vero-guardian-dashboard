import { NextResponse } from 'next/server';
import { getVaultSecretStatus } from '@/services/vault-node';
import {
  Vault,
  MemoryVaultStore,
  createHardwareBackedProvider,
  createSoftwareProviderForTests,
} from '@/services/vault';

/**
 * Require an authorized caller before processing vault encrypt/verify.
 * Uses VAULT_API_SECRET via Authorization: Bearer <secret>.
 * Fail closed if the secret is not configured.
 */
function requireAuth(request: Request): NextResponse | null {
  const expected = process.env.VAULT_API_SECRET;
  if (!expected) {
    console.error('[vault] VAULT_API_SECRET is not configured — rejecting request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null; // authorized
}

function genericErrorResponse(error: unknown, context: string) {
  // Log full details server-side only — never return error.message to the client
  console.error(`[vault] ${context}:`, error);
  return NextResponse.json(
    { error: 'An internal error occurred' },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const unauthorized = requireAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const status = getVaultSecretStatus('STELLAR_SECRET_KEY');
    return NextResponse.json(status);
  } catch (error) {
    return genericErrorResponse(error, 'GET status failed');
  }
}

export async function POST(request: Request) {
  const unauthorized = requireAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'encrypt') {
      const { secret, keyId, hardwareBacked, keyMaterial } = body;
      if (!secret || !keyId || !keyMaterial) {
        return NextResponse.json(
          { error: 'Missing required parameters' },
          { status: 400 },
        );
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
        return NextResponse.json(
          { error: 'Missing required parameters' },
          { status: 400 },
        );
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

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return genericErrorResponse(error, 'POST failed');
  }
}
