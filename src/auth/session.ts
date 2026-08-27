/**
 * Inactive wallet session management and encryption (issue #15)
 */

type SessionCallback = () => void;

const STORAGE_KEY = 'vero_wallet_publicKey';
const PROVIDER_STORAGE_KEY = 'vero_wallet_provider';
const LAST_ACTIVE_KEY = 'vero_wallet_last_active';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
const IDLE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
const THROTTLE_LIMIT_MS = 10 * 1000; // 10 seconds

class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(key: string) { return this.store[key] || null; }
  setItem(key: string, value: string) { this.store[key] = value; }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
}

const safeSessionStorage = typeof window !== 'undefined' && window.sessionStorage
  ? window.sessionStorage
  : new MemoryStorage();

let cachedKey: CryptoKey | null = null;

function getCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    return window.crypto;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && (globalThis.crypto as any).subtle) {
    return globalThis.crypto as unknown as Crypto;
  }
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto as unknown as Crypto;
  }
  throw new Error('Web Crypto API is not available.');
}

let keyPromise: Promise<CryptoKey> | null = null;

const SESSION_KEY_DB_NAME = 'vero-session';
const SESSION_KEY_STORE_NAME = 'keys';
const SESSION_KEY_RECORD_ID = 'session-aes-gcm-v1';

interface StoredSessionKeyRecord {
  id: string;
  key: CryptoKey;
  algorithm: 'AES-GCM';
}

function openSessionKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = indexedDB.open(SESSION_KEY_DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(SESSION_KEY_STORE_NAME, {
        keyPath: 'id',
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open session key store.'));
  });
}

function readStoredSessionKey(
  database: IDBDatabase,
): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      SESSION_KEY_STORE_NAME,
      'readonly',
    );
    const request = transaction
      .objectStore(SESSION_KEY_STORE_NAME)
      .get(SESSION_KEY_RECORD_ID);

    request.onsuccess = () => {
      const record = request.result as
        | StoredSessionKeyRecord
        | undefined;
      resolve(record?.key ?? null);
    };

    request.onerror = () =>
      reject(
        request.error ?? new Error('Unable to read session encryption key.'),
      );
  });
}

function storeSessionKey(
  database: IDBDatabase,
  key: CryptoKey,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      SESSION_KEY_STORE_NAME,
      'readwrite',
    );

    transaction.objectStore(SESSION_KEY_STORE_NAME).put({
      id: SESSION_KEY_RECORD_ID,
      key,
      algorithm: 'AES-GCM',
    } satisfies StoredSessionKeyRecord);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ?? new Error('Unable to store session encryption key.'),
      );
  });
}

async function getEncryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  if (keyPromise) return keyPromise;

  keyPromise = (async () => {
    const crypto = getCrypto();

    // Use IndexedDB when available so the session key is not stored
    // in sessionStorage.
    if (typeof indexedDB !== 'undefined') {
      try {
        const database = await openSessionKeyDatabase();
        const storedKey = await readStoredSessionKey(database);

        if (storedKey) {
        if (typeof database.close === "function") { database.close(); }
          cachedKey = storedKey;
          return storedKey;
        }

        const generatedKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        );

        await storeSessionKey(database, generatedKey);
        if (typeof database.close === "function") { database.close(); }

        cachedKey = generatedKey;
        return generatedKey;
      } catch (error) {
        console.error(
          'Failed to access session encryption key in IndexedDB:',
          error,
        );
        throw error;
      }
    }

    // IndexedDB is unavailable in environments such as Jest/Node.
    // Keep the key in memory for the lifetime of this module.
    const generatedKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );

    cachedKey = generatedKey;
    return generatedKey;
  })();

  return keyPromise;
}
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function encryptSessionData(value: string): Promise<string> {
  const crypto = getCrypto();
  const key = await getEncryptionKey();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const plaintext = new TextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    plaintext as any
  );

  const payload = {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };

  return JSON.stringify(payload);
}

export async function decryptSessionData(encrypted: string): Promise<string> {
  const payload = JSON.parse(encrypted);
  if (!payload.iv || !payload.ciphertext) {
    throw new Error('Invalid encrypted payload structure');
  }

  const crypto = getCrypto();
  const key = await getEncryptionKey();
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    ciphertext as any
  );

  return new TextDecoder().decode(decrypted);
}

export async function getSessionItem(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem(key);
  if (!value) return null;
  try {
    return await decryptSessionData(value);
  } catch (e) {
    // Legacy values may be stored as plaintext.
    // Return them unchanged when they are not encrypted payloads.
    if (!value.trim().startsWith('{')) {
      return value;
    }

    console.error(`Failed to decrypt session item for key ${key}:`, e);
    return null;
  }
}

export async function setSessionItem(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const encrypted = await encryptSessionData(value);
  localStorage.setItem(key, encrypted);
}

export function removeSessionItem(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
}

export class SessionManager {
  private listeners: Set<SessionCallback> = new Set();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastSavedTime = 0;
  private isChecking = false;
  private cleanupListeners?: () => void;
  private activeUpdatePromise: Promise<void> | null = null;

  subscribe(callback: SessionCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyLogout() {
    this.listeners.forEach((callback) => callback());
  }

  startMonitoring(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (this.isChecking) return Promise.resolve();
    this.isChecking = true;

    // Reset last active to now on start
    const initialUpdate = this.updateLastActive(true);

    const handleActivity = () => {
      void this.updateLastActive();
    };

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Check every 10 seconds
    this.checkInterval = setInterval(() => {
      void this.checkIdleTimeout();
    }, 10000);

    this.cleanupListeners = () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
      this.isChecking = false;
    };

    return initialUpdate;
  }

  stopMonitoring() {
    if (this.cleanupListeners) {
      this.cleanupListeners();
      this.cleanupListeners = undefined;
    }

    this.isChecking = false;
  }

  async checkIdleTimeout() {
    try {
      const lastActiveStr = await getSessionItem(LAST_ACTIVE_KEY);
      if (!lastActiveStr) {
        // If logged in but last active key is missing, initialize it
        await this.updateLastActive(true);
        return;
      }

      const lastActive = parseInt(lastActiveStr, 10);
      const now = Date.now();

      if (now - lastActive >= IDLE_LIMIT_MS) {
        this.notifyLogout();
      }
    } catch (e) {
      console.error('Failed to check idle timeout:', e);
    }
  }

  async updateLastActive(force = false): Promise<void> {
    if (this.activeUpdatePromise) {
      return this.activeUpdatePromise;
    }

    const now = Date.now();
    if (force || now - this.lastSavedTime >= THROTTLE_LIMIT_MS) {
      this.lastSavedTime = now;
      this.activeUpdatePromise = (async () => {
        try {
          await setSessionItem(LAST_ACTIVE_KEY, now.toString());
        } catch (err) {
          console.error('Failed to update last active timestamp:', err);
        } finally {
          this.activeUpdatePromise = null;
        }
      })();
      return this.activeUpdatePromise;
    }
  }

  // Exposed for testing purposes
  clearCache() {
    cachedKey = null;
    keyPromise = null;
    this.activeUpdatePromise = null;
    this.listeners.clear();
    safeSessionStorage.removeItem('vero_session_key');
  }
}

export const sessionManager = new SessionManager();
