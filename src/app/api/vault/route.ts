import { NextResponse } from 'next/server';
import { getVaultSecretStatus } from '@/services/vault-node';
import {
  Vault,
  MemoryVaultStore,
  createHardwareBackedProvider,
  createSoftwareProviderForTests,
} from '@/services/vault';
import { VaultPostSchema } from '@/app/api/schemas';

export async function GET() {
  try {
    const status = getVaultSecretStatus('STELLAR_SECRET_KEY');
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const parsed = VaultPostSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      { error: firstIssue?.message ?? 'Invalid action' },
      { status: 400 },
    );
  }

  try {
    const { action } = parsed.data;

    if (action === 'encrypt') {
      const { secret, keyId, hardwareBacked, keyMaterial } = parsed.data;

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

    const { record, keyMaterial } = parsed.data;

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}