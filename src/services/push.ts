
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
const ENCRYPTION_KEY = 'vero_push_encryption';

async function encryptData(data: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return btoa(data);
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('vero-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    encoder.encode(data),
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decryptData(encryptedData: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return atob(encryptedData);
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('vero-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const dataBuffer = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    dataBuffer,
  );

  return new TextDecoder().decode(decrypted);
}

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
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore cleanup failures.
    }
    return null;
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
