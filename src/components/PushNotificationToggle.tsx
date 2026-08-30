'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPushSubscription, savePushSubscription, deletePushSubscription } from '@/services/push';

async function urlBase64ToUint8Array(base64String: string): Promise<Uint8Array> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
}

async function cachePushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  try {
    await savePushSubscription(subscription as any);
  } catch {
    // Push registration should still continue if local cache storage is unavailable.
  }
}

function serializePushSubscription(subscription: PushSubscription): PushSubscriptionJSON {
  return typeof subscription.toJSON === 'function'
    ? subscription.toJSON()
    : (subscription as unknown as PushSubscriptionJSON);
}

export default function PushNotificationToggle() {
  const { t } = useTranslation();
  const [isSupported, setIsSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator,
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    return registration;
  }, []);

  const subscribeToPush = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    if (typeof window.Notification === 'undefined') {
      return;
    }

    const registration = await registerServiceWorker();
    const readyRegistration = registration
      ? await ((registration as ServiceWorkerRegistration & { ready?: Promise<ServiceWorkerRegistration> }).ready ??
          navigator.serviceWorker.ready)
      : null;
    const pushManager = registration?.pushManager ?? readyRegistration?.pushManager;

    if (!pushManager) {
      return;
    }

    const permission = window.Notification.permission;
    if (permission !== 'granted') {
      const nextPermission = await window.Notification.requestPermission();
      if (nextPermission !== 'granted') {
        setError(t('pushNotification.permissionDenied'));
        return;
      }
    }

    const existingSubscription = await pushManager.getSubscription();
    if (existingSubscription) {
      await cachePushSubscription(serializePushSubscription(existingSubscription));
      setIsSubscribed(true);
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setError(t('pushNotification.notConfigured'));
      return;
    }

    const applicationServerKey = await urlBase64ToUint8Array(vapidPublicKey);
    const applicationServerKeyBuffer = applicationServerKey.buffer.slice(
      applicationServerKey.byteOffset,
      applicationServerKey.byteOffset + applicationServerKey.byteLength,
    ) as ArrayBuffer;
    const subscription = await pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKeyBuffer,
    });

    const subscriptionPayload = serializePushSubscription(subscription);
    await cachePushSubscription(subscriptionPayload);

    const response = await fetch('/api/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subscription: subscriptionPayload }),
    });

    if (!response.ok) {
      throw new Error('Unable to save push subscription.');
    }

    setIsSubscribed(true);
    setError(null);
  }, [registerServiceWorker, t]);

  const unsubscribeFromPush = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let endpoint: string | undefined;

    const registration = await registerServiceWorker();
    const readyRegistration = registration
      ? await ((registration as ServiceWorkerRegistration & { ready?: Promise<ServiceWorkerRegistration> }).ready ??
          navigator.serviceWorker.ready)
      : null;
    const pushManager = registration?.pushManager ?? readyRegistration?.pushManager;

    if (pushManager) {
      const existingSubscription = await pushManager.getSubscription();
      if (existingSubscription) {
        endpoint = existingSubscription.endpoint;
        try {
          await existingSubscription.unsubscribe();
        } catch {
          // Continue removing subscription even if browser unsubscribe throws
        }
      }
    }

    await deletePushSubscription(endpoint);
    setIsSubscribed(false);
    setError(null);
  }, [registerServiceWorker]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const supportsNotifications =
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator;
    setIsSupported(supportsNotifications);

    if (!supportsNotifications) {
      return;
    }

    const checkSubscription = async () => {
      const localSubscription = await getPushSubscription();
      if (localSubscription) {
        setIsSubscribed(true);
        return;
      }

      const registration = await registerServiceWorker();
      if (registration?.pushManager) {
        const swSubscription = await registration.pushManager.getSubscription();
        setIsSubscribed(Boolean(swSubscription));
        if (swSubscription) {
          await cachePushSubscription(serializePushSubscription(swSubscription));
        }
      }
    };

    checkSubscription().catch(() => {
      setError(t('pushNotification.initError'));
    });
  }, [registerServiceWorker, t]);

  if (!isSupported) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setIsLoading(true);
          const action = isSubscribed ? unsubscribeFromPush() : subscribeToPush();
          void action
            .catch(() => {
              setError(
                isSubscribed
                  ? t('pushNotification.disableError', { defaultValue: 'Unable to disable push notifications.' })
                  : t('pushNotification.enableError'),
              );
            })
            .finally(() => {
              setIsLoading(false);
            });
        }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-label={isSubscribed ? t('pushNotification.disableAlerts') : t('pushNotification.enableAlerts')}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : isSubscribed ? (
          <BellOff className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Bell className="w-4 h-4" aria-hidden="true" />
        )}
        <span className="text-sm font-medium">{isSubscribed ? t('pushNotification.alertsOn') : t('pushNotification.enableAlerts')}</span>
      </button>
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
