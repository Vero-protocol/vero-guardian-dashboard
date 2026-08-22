import { NextResponse } from 'next/server';
import { getVaultSecretStatus } from '@/services/vault-node';
import {
  Vault,
  MemoryVaultStore,
  createHardwareBackedProvider,
  createSoftwareProviderForTests,
} from '@/services/vault';

const GENERIC_ERROR = 'An internal error occurred';

function requireAuth(request: Request): NextResponse | null {
  const secret = process.env.VAULT_API_SECRET;
  if (!secret) {
    console.error('[vault] VAULT_API_SECRET is not configured');
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = header.slice('Bearer '.length).trim();
  if (token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

function genericErrorResponse(error: unknown): NextResponse {
  console.error('[vault]', error);
  return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
}

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const status = getVaultSecretStatus('STELLAR_SECRET_KEY');
    return NextResponse.json(status);
  } catch (error: unknown) {
    return genericErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'encrypt') {
      const { secret, keyId, hardwareBacked, keyMaterial } = body;
      if (!secret || !keyId || !keyMaterial) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
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
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
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
  } catch (error: unknown) {
    return genericErrorResponse(error);
  }
}
