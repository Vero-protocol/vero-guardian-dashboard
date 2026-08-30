
type PushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushNotification = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
};

const STORAGE_KEY = 'vero_push_subscriptions';

/**
 * localStorage key under which the per-installation AES-GCM key is persisted
 * as a JWK blob. Each browser/device generates its own key on first use, so
 * the key is never derivable from any static string in the source code.
 */
const PUSH_KEY_STORAGE = 'vero_push_key';

// ---------------------------------------------------------------------------
// Crypto helpers (mirrored from src/auth/session.ts)
// ---------------------------------------------------------------------------

function getCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto;
  }
  if (typeof globalThis !== 'undefined' && (globalThis.crypto as any)?.subtle) {
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
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Per-installation AES-GCM key (randomly generated, persisted in localStorage)
// ---------------------------------------------------------------------------

let cachedPushKey: CryptoKey | null = null;
let pushKeyPromise: Promise<CryptoKey> | null = null;

export async function getPushEncryptionKey(): Promise<CryptoKey> {
  if (cachedPushKey) return cachedPushKey;
  if (pushKeyPromise) return pushKeyPromise;

  pushKeyPromise = (async () => {
    const crypto = getCrypto();

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PUSH_KEY_STORAGE);
      if (stored) {
        try {
          const jwk = JSON.parse(stored);
          cachedPushKey = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt'],
          );
          pushKeyPromise = null;
          return cachedPushKey;
        } catch {
          // Stored key is corrupt — fall through to generate a new one.
        }
      }
    }

    // Generate a fresh, random, per-installation key.
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // extractable so we can persist it as JWK
      ['encrypt', 'decrypt'],
    );

    if (typeof window !== 'undefined') {
      try {
        const exported = await crypto.subtle.exportKey('jwk', key);
        localStorage.setItem(PUSH_KEY_STORAGE, JSON.stringify(exported));
      } catch {
        // Ignore persistence failures; the key still works for this session.
      }
    }

    cachedPushKey = key;
    pushKeyPromise = null;
    return key;
  })();

  return pushKeyPromise;
}

/** Exposed so tests can reset module-level state between runs. */
export function clearPushKeyCache(): void {
  cachedPushKey = null;
  pushKeyPromise = null;
}

// ---------------------------------------------------------------------------
// Encrypt / decrypt using the per-installation key
//
// Payload format: JSON { iv: "<base64>", ciphertext: "<base64>" }
//
// BREAKING CHANGE: Previously stored push subscriptions were encrypted with
// an AES key derived via PBKDF2 from the hardcoded password
// 'vero_push_encryption' and salt 'vero-salt'.  Because that static key
// provided no real confidentiality (anyone reading the public source code
// could derive the same key), it has been retired.  Any blob that does NOT
// match the new JSON payload format is treated as an old/invalid entry and
// silently discarded, which forces a fresh push subscription.
// ---------------------------------------------------------------------------

export async function encryptData(data: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return btoa(data);
  }

  const crypto = getCrypto();
  const key = await getPushEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(data),
  );

  return JSON.stringify({
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  });
}

export async function decryptData(encrypted: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return atob(encrypted);
  }

  // Old-format detection: the legacy PBKDF2-derived blobs were stored as a
  // raw base64 string (IV prepended to ciphertext), not as a JSON object.
  // Detect this by checking whether the stored value is valid JSON with the
  // expected shape; if not, throw so the caller can treat it as invalid.
  let payload: { iv: string; ciphertext: string };
  try {
    const parsed = JSON.parse(encrypted);
    if (!parsed.iv || !parsed.ciphertext) {
      throw new Error('Missing iv or ciphertext fields');
    }
    payload = parsed as { iv: string; ciphertext: string };
  } catch {
    throw new Error(
      'Unrecognised encrypted payload — likely a legacy PBKDF2-derived blob. ' +
      'Discarding to force a fresh push subscription.',
    );
  }

  const crypto = getCrypto();
  const key = await getPushEncryptionKey();
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
      ciphertext as BufferSource,
    );

  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// Public API — unchanged surface
// ---------------------------------------------------------------------------

export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const serialized = JSON.stringify(subscription);
  const encrypted = await encryptData(serialized);
  try {
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch {
    // Ignore storage failures in private or disabled-storage contexts.
  }
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  let encrypted: string | null = null;
  try {
    encrypted = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!encrypted) {
    return null;
  }

  try {
    const decrypted = await decryptData(encrypted);
    return JSON.parse(decrypted) as PushSubscription;
  } catch {
    // Covers both legacy PBKDF2 blobs and any other decryption failures.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore cleanup failures.
    }
    return null;
  }
}

export async function deletePushSubscription(endpoint?: string): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  let targetEndpoint = endpoint;
  if (!targetEndpoint) {
    const current = await getPushSubscription();
    targetEndpoint = current?.endpoint;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures
  }

  if (!targetEndpoint) {
    return true;
  }

  try {
    const response = await fetch(`/api/push?endpoint=${encodeURIComponent(targetEndpoint)}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendPushNotification(
  subscription: PushSubscription,
  notification: PushNotification,
): Promise<boolean> {
  try {
    const response = await fetch('/api/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscription,
        notification,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function showLocalNotification(
  notification: PushNotification,
): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return;
    }
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) {
    await registration.showNotification(notification.title, {
      body: notification.body,
      icon: notification.icon,
      tag: notification.tag,
      data: notification.data,
    });
  } else {
    new Notification(notification.title, {
      body: notification.body,
      icon: notification.icon,
      tag: notification.tag,
      data: notification.data,
    });
  }
}
