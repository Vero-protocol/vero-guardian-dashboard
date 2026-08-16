/**
 * @jest-environment node
 */

import { POST, GET } from './route';

// Mock the vault services so we don't need real crypto in tests.
jest.mock('@/services/vault', () => ({
  Vault: jest.fn(),
  MemoryVaultStore: jest.fn(),
  createHardwareBackedProvider: jest.fn(),
  createSoftwareProviderForTests: jest.fn(),
}));

jest.mock('@/services/vault-node', () => ({
  getVaultSecretStatus: jest.fn(() => ({ exists: true })),
}));

describe('/api/vault', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET returns vault secret status', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ exists: true });
  });

  test('POST rejects invalid action', async () => {
    const response = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        body: JSON.stringify({ action: 'unknown' }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('POST rejects encrypt without secret', async () => {
    const response = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        body: JSON.stringify({
          action: 'encrypt',
          keyId: 'key-1',
          keyMaterial: 'material',
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('POST rejects encrypt without keyMaterial', async () => {
    const response = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        body: JSON.stringify({
          action: 'encrypt',
          secret: 'S...secret',
          keyId: 'key-1',
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('POST rejects verify without record', async () => {
    const response = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        body: JSON.stringify({
          action: 'verify',
          keyMaterial: 'material',
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('POST rejects malformed record in verify', async () => {
    const response = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        body: JSON.stringify({
          action: 'verify',
          record: { version: 99 },
          keyMaterial: 'material',
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('POST rejects non-JSON body', async () => {
    const response = await POST(
      new Request('http://localhost/api/vault', {
        method: 'POST',
        body: 'not json',
      }),
    );

    expect(response.status).toBe(400);
  });
});