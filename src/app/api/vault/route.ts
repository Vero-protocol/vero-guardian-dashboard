import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/app/api/rate-limiter';
import { getVaultSecretStatus } from '@/services/vault-node';
import {
  Vault,
  MemoryVaultStore,
  createHardwareBackedProvider,
  createSoftwareProviderForTests,
} from '@/services/vault';

export async function GET() {
  try {
    const status = getVaultSecretStatus('STELLAR_SECRET_KEY');
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(getClientIp(request));
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
