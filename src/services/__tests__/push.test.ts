import { webcrypto } from 'crypto';
import { TextDecoder, TextEncoder } from 'util';
import {
  getPushEncryptionKey,
  clearPushKeyCache,
  encryptData,
  decryptData,
  savePushSubscription,
  getPushSubscription,
  deletePushSubscription,
} from '../push';

// ---------------------------------------------------------------------------
// Environment setup — mirrors src/auth/__tests__/session.test.ts
// ---------------------------------------------------------------------------

Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder });
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder });

Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
  writable: true,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSub() {
  return {
    endpoint: 'https://example.com/push/abc123',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('push encryption', () => {
  beforeEach(() => {
    localStorage.clear();
    clearPushKeyCache();
  });

  // --- Key generation -------------------------------------------------------

  test('getPushEncryptionKey returns a CryptoKey', async () => {
    const key = await getPushEncryptionKey();
    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM' });
    expect(key.usages).toContain('encrypt');
    expect(key.usages).toContain('decrypt');
  });

  test('getPushEncryptionKey persists the key as JWK in localStorage', async () => {
    await getPushEncryptionKey();
    const stored = localStorage.getItem('vero_push_key');
    expect(stored).not.toBeNull();
    const jwk = JSON.parse(stored!);
    expect(jwk.kty).toBe('oct');
    expect(jwk.alg).toBe('A256GCM');
  });

  test('getPushEncryptionKey returns the same key on repeated calls (cached)', async () => {
    const key1 = await getPushEncryptionKey();
    const key2 = await getPushEncryptionKey();
    expect(key1).toBe(key2); // same object reference — from in-memory cache
  });

  test('getPushEncryptionKey reloads the persisted key after cache is cleared', async () => {
    // First call — generates and stores
    await getPushEncryptionKey();
    const stored = localStorage.getItem('vero_push_key');

    // Clear in-memory cache only (localStorage still has the JWK)
    clearPushKeyCache();

    // Second call — should re-import from localStorage
    const reloaded = await getPushEncryptionKey();
    expect(reloaded).toBeDefined();

    // The JWK in storage should be unchanged
    expect(localStorage.getItem('vero_push_key')).toBe(stored);
  });

  test('getPushEncryptionKey generates a new key when localStorage is empty', async () => {
    // First key
    await getPushEncryptionKey();
    const firstStored = localStorage.getItem('vero_push_key');

    // Wipe everything and start fresh
    localStorage.clear();
    clearPushKeyCache();

    await getPushEncryptionKey();
    const secondStored = localStorage.getItem('vero_push_key');

    // Both are valid JWKs but have different key material
    expect(firstStored).not.toBeNull();
    expect(secondStored).not.toBeNull();
    expect(firstStored).not.toBe(secondStored);
  });

  // --- encrypt / decrypt round-trip -----------------------------------------

  test('encryptData produces a JSON payload with iv and ciphertext fields', async () => {
    const payload = await encryptData('hello world');
    const parsed = JSON.parse(payload);
    expect(parsed).toHaveProperty('iv');
    expect(parsed).toHaveProperty('ciphertext');
    expect(typeof parsed.iv).toBe('string');
    expect(typeof parsed.ciphertext).toBe('string');
  });

  test('encryptData does not embed the plaintext in the output', async () => {
    const secret = 'my-super-secret-push-data';
    const payload = await encryptData(secret);
    expect(payload).not.toContain(secret);
  });

  test('encryptData + decryptData round-trips correctly', async () => {
    const original = 'round-trip test value';
    const encrypted = await encryptData(original);
    const decrypted = await decryptData(encrypted);
    expect(decrypted).toBe(original);
  });

  test('each encryptData call produces a different ciphertext (random IV)', async () => {
    const plain = 'same plaintext';
    const enc1 = await encryptData(plain);
    const enc2 = await encryptData(plain);
    expect(enc1).not.toBe(enc2);
    // But both decrypt to the same value
    expect(await decryptData(enc1)).toBe(plain);
    expect(await decryptData(enc2)).toBe(plain);
  });

  // --- Legacy / old-format blob handling ------------------------------------

  test('decryptData throws on a legacy PBKDF2-format blob (raw base64, not JSON)', async () => {
    // The old code stored a raw base64 string: btoa of IV+ciphertext bytes.
    // Simulate that by storing a plain base64 string that is not valid JSON.
    const legacyBlob = btoa('some-raw-binary-looking-data-that-is-not-json');
    await expect(decryptData(legacyBlob)).rejects.toThrow();
  });

  test('decryptData throws on JSON that lacks iv or ciphertext fields', async () => {
    const badPayload = JSON.stringify({ foo: 'bar' });
    await expect(decryptData(badPayload)).rejects.toThrow();
  });

  // --- savePushSubscription / getPushSubscription ---------------------------

  test('savePushSubscription encrypts and getPushSubscription decrypts correctly', async () => {
    const sub = makeSub();
    await savePushSubscription(sub);

    // Raw localStorage value should be encrypted JSON, not plaintext
    const raw = localStorage.getItem('vero_push_subscriptions');
    expect(raw).not.toBeNull();
    expect(raw).not.toContain(sub.endpoint);

    const retrieved = await getPushSubscription();
    expect(retrieved).toEqual(sub);
  });

  test('getPushSubscription returns null when nothing is stored', async () => {
    const result = await getPushSubscription();
    expect(result).toBeNull();
  });

  test('getPushSubscription returns null and clears storage for a legacy PBKDF2 blob', async () => {
    // Inject a legacy-style raw base64 blob directly into localStorage
    const legacyBlob = btoa('legacy-raw-data-not-json');
    localStorage.setItem('vero_push_subscriptions', legacyBlob);

    const result = await getPushSubscription();
    expect(result).toBeNull();
    // Storage entry should have been cleaned up
    expect(localStorage.getItem('vero_push_subscriptions')).toBeNull();
  });

  test('getPushSubscription returns null and clears storage when decryption fails (wrong key)', async () => {
    const sub = makeSub();
    await savePushSubscription(sub);

    // Rotate the key — simulates a different installation / cleared key
    localStorage.removeItem('vero_push_key');
    clearPushKeyCache();

    const result = await getPushSubscription();
    expect(result).toBeNull();
    expect(localStorage.getItem('vero_push_subscriptions')).toBeNull();
  });

  // --- deletePushSubscription -----------------------------------------------

  test('deletePushSubscription clears localStorage and calls DELETE /api/push', async () => {
    const sub = makeSub();
    await savePushSubscription(sub);
    expect(localStorage.getItem('vero_push_subscriptions')).not.toBeNull();

    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    const result = await deletePushSubscription();
    expect(result).toBe(true);
    expect(localStorage.getItem('vero_push_subscriptions')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`,
      { method: 'DELETE' },
    );
  });

  test('deletePushSubscription accepts explicit endpoint parameter', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    const explicitEndpoint = 'https://example.com/push/custom-endpoint';
    const result = await deletePushSubscription(explicitEndpoint);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/push?endpoint=${encodeURIComponent(explicitEndpoint)}`,
      { method: 'DELETE' },
    );
  });
});

