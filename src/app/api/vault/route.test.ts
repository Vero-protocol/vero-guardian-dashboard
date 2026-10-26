/**
 * @jest-environment node
 */

import { GET, POST } from './route';
import * as vaultNode from '@/services/vault-node';

jest.mock('@/services/vault-node', () => {
  const actual = jest.requireActual('@/services/vault-node');
  return {
    ...actual,
    getVaultSecretStatus: jest.fn((...args: unknown[]) =>
      actual.getVaultSecretStatus(...args),
    ),
  };
});

describe('/api/vault', () => {
  const validStellarSecret = `S${'A'.repeat(55)}`;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    delete process.env.VAULT_API_KEY;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.VAULT_API_KEY;
    jest.restoreAllMocks();
  });

  test('POST rejects unauthenticated requests with 401', async () => {
    const response = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.1',
        },
        body: JSON.stringify({
          action: 'encrypt',
          secret: validStellarSecret,
          keyId: 'test-key',
          hardwareBacked: true,
          keyMaterial: 'passphrase-material-1234',
        }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized.');
  });

  test('POST rejects non-admin role headers with 403', async () => {
    const response = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.2',
          'x-vero-role': 'guardian',
        },
        body: JSON.stringify({
          action: 'encrypt',
          secret: validStellarSecret,
          keyId: 'test-key',
          hardwareBacked: true,
          keyMaterial: 'passphrase-material-1234',
        }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden: admin access required.');
  });

  test('POST allows authorized admin encrypt and verify roundtrip', async () => {
    const encryptResponse = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.3',
          'x-vero-role': 'admin',
        },
        body: JSON.stringify({
          action: 'encrypt',
          secret: validStellarSecret,
          keyId: 'test-key',
          hardwareBacked: true,
          keyMaterial: 'passphrase-material-1234',
        }),
      }),
    );

    const encryptPayload = await encryptResponse.json();
    expect(encryptResponse.status).toBe(200);
    expect(encryptPayload.success).toBe(true);
    expect(encryptPayload.record).toBeDefined();

    const verifyResponse = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.4',
          'x-vero-role': 'admin',
        },
        body: JSON.stringify({
          action: 'verify',
          record: encryptPayload.record,
          keyMaterial: 'passphrase-material-1234',
        }),
      }),
    );

    const verifyPayload = await verifyResponse.json();
    expect(verifyResponse.status).toBe(200);
    expect(verifyPayload).toEqual({ success: true, length: 56 });
  });

  test('POST supports VAULT_API_KEY bearer authentication when configured', async () => {
    process.env.VAULT_API_KEY = 'super-secret-vault-token';

    const unauthorizedResponse = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.5',
          'x-vero-role': 'admin',
        },
        body: JSON.stringify({
          action: 'encrypt',
          secret: validStellarSecret,
          keyId: 'test-key',
          hardwareBacked: true,
          keyMaterial: 'passphrase-material-1234',
        }),
      }),
    );
    expect(unauthorizedResponse.status).toBe(401);

    const authorizedResponse = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.6',
          Authorization: 'Bearer super-secret-vault-token',
        },
        body: JSON.stringify({
          action: 'encrypt',
          secret: validStellarSecret,
          keyId: 'test-key',
          hardwareBacked: true,
          keyMaterial: 'passphrase-material-1234',
        }),
      }),
    );
    expect(authorizedResponse.status).toBe(200);
  });

  test('POST sanitizes internal crypto errors instead of leaking raw error.message', async () => {
    const response = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.0.0.7',
          'x-vero-role': 'admin',
        },
        body: JSON.stringify({
          action: 'verify',
          record: {
            version: 1,
            algorithm: 'AES-256-GCM',
            keyId: 'test-key',
            hardwareBacked: true,
            iv: Buffer.alloc(12, 1).toString('base64'),
            authTag: Buffer.alloc(16, 2).toString('base64'),
            ciphertext: Buffer.from('corrupted').toString('base64'),
            createdAt: '2026-06-20T12:00:00Z',
          },
          keyMaterial: 'wrong-key-material',
        }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: 'Vault operation failed.' });
    expect(JSON.stringify(payload)).not.toMatch(/Unsupported state|unable to authenticate data|STELLAR_SECRET_KEY/i);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  test('GET sanitizes internal errors instead of leaking raw error.message', async () => {
    (vaultNode.getVaultSecretStatus as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Internal fs path /etc/relayer/secret.key unreadable');
    });

    const response = await GET(
      new Request('http://localhost/api/vault', {
        headers: { 'x-forwarded-for': '10.0.0.8' },
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: 'Failed to retrieve vault status.' });
    expect(JSON.stringify(payload)).not.toContain('/etc/relayer/secret.key');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
