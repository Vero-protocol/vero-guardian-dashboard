import { webcrypto } from 'crypto';
import { TextDecoder, TextEncoder } from 'util';
import {
  sessionManager,
  encryptSessionData,
  decryptSessionData,
  getSessionItem,
  setSessionItem,
  removeSessionItem
} from '../session';

Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder });
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder });

// Setup global crypto for Node environment
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
  writable: true
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true
  });
}

describe('session encryption and management', () => {
  beforeEach(() => {
    sessionManager.stopMonitoring();
    localStorage.clear();
    sessionStorage.clear();
    sessionManager.clearCache();
  });

  afterEach(() => {
    sessionManager.stopMonitoring();
    localStorage.clear();
    sessionStorage.clear();
  });

  test('encryptSessionData and decryptSessionData encrypts and decrypts strings correctly', async () => {
    const originalText = 'my-super-secret-stellar-key';
    const encrypted = await encryptSessionData(originalText);
    
    // Encrypted string should be valid JSON and contain ciphertext and iv
    expect(encrypted).toContain('ciphertext');
    expect(encrypted).toContain('iv');
    expect(encrypted).not.toContain(originalText);

    const decrypted = await decryptSessionData(encrypted);
    expect(decrypted).toBe(originalText);
  });

  test('setSessionItem encrypts and getSessionItem decrypts correctly from localStorage', async () => {
    const key = 'test_key';
    const value = 'test_value';

    await setSessionItem(key, value);

    // Verify localStorage has encrypted value
    const rawLocalValue = localStorage.getItem(key);
    expect(rawLocalValue).not.toBeNull();
    expect(rawLocalValue).toContain('ciphertext');
    expect(rawLocalValue).not.toContain(value);

    // Verify getSessionItem successfully decrypts it
    const decrypted = await getSessionItem(key);
    expect(decrypted).toBe(value);
  });

  test('getSessionItem falls back to plain text for unencrypted legacy values', async () => {
    const key = 'legacy_key';
    const value = 'legacy_plaintext_value';

    // Store plaintext directly
    localStorage.setItem(key, value);

    // Verify getSessionItem returns the plaintext directly
    const retrieved = await getSessionItem(key);
    expect(retrieved).toBe(value);
  });

  test('removeSessionItem deletes key from localStorage', async () => {
    const key = 'delete_key';
    await setSessionItem(key, 'delete_me');
    expect(localStorage.getItem(key)).not.toBeNull();

    removeSessionItem(key);
    expect(localStorage.getItem(key)).toBeNull();
  });
test('SessionManager notifies subscribers on logout', async () => {
const logoutSpy = jest.fn();
  const unsubscribe = sessionManager.subscribe(logoutSpy);

  await sessionManager.startMonitoring();



  (sessionManager as any).notifyLogout();

  expect(logoutSpy).toHaveBeenCalledTimes(1);

  unsubscribe();
});

test('SessionManager triggers logout after 15 minutes of inactivity', async () => {
    const logoutSpy = jest.fn();
    const unsubscribe = sessionManager.subscribe(logoutSpy);
    const dateNowSpy = jest.spyOn(Date, 'now');

    try {
      dateNowSpy.mockReturnValue(1000000);

      await sessionManager.startMonitoring();

      const lastActiveInitial = await getSessionItem('vero_wallet_last_active');
      expect(lastActiveInitial).not.toBeNull();

      dateNowSpy.mockReturnValue(1000000 + 15 * 60 * 1000 + 1);

      await sessionManager.checkIdleTimeout();

      expect(logoutSpy).toHaveBeenCalled();

      unsubscribe();
    } finally {
      sessionManager.stopMonitoring();
      dateNowSpy.mockRestore();
    }
  });

test('SessionManager activity reset updates last active timestamp', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now');

    try {
      dateNowSpy.mockReturnValue(2000000);

      await sessionManager.startMonitoring();

      const initialTimestampStr = await getSessionItem('vero_wallet_last_active');
      expect(initialTimestampStr).not.toBeNull();

      const initialTimestamp = parseInt(initialTimestampStr!, 10);

      // Within throttle window: timestamp should remain unchanged.
      dateNowSpy.mockReturnValue(initialTimestamp + 5_000);
      window.dispatchEvent(new Event('scroll'));

      const update1 = (sessionManager as any).activeUpdatePromise;
      if (update1) await update1;

      const check1TimestampStr = await getSessionItem('vero_wallet_last_active');
      expect(parseInt(check1TimestampStr!, 10)).toBe(initialTimestamp);

      // Beyond throttle window: timestamp should update.
      dateNowSpy.mockReturnValue(initialTimestamp + 11_000);
      window.dispatchEvent(new Event('click'));

      const update2 = (sessionManager as any).activeUpdatePromise;
      if (update2) await update2;

      const check2TimestampStr = await getSessionItem('vero_wallet_last_active');
      expect(parseInt(check2TimestampStr!, 10)).toBeGreaterThan(initialTimestamp);
    } finally {
      sessionManager.stopMonitoring();
      dateNowSpy.mockRestore();
    }
  });

  });
