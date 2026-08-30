import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PushNotificationToggle from '../PushNotificationToggle';

describe('PushNotificationToggle', () => {
  const requestPermission = jest.fn();
  const subscribe = jest.fn();
  const getSubscription = jest.fn();
  const unsubscribe = jest.fn();

  beforeEach(() => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'dGVzdA==';

    requestPermission.mockReset();
    requestPermission.mockResolvedValue('granted');
    subscribe.mockReset();
    subscribe.mockResolvedValue({});
    unsubscribe.mockReset();
    unsubscribe.mockResolvedValue(true);
    getSubscription.mockReset();
    getSubscription.mockResolvedValue(null);

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'default',
        requestPermission,
      },
    });

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: jest.fn().mockResolvedValue({
          active: {},
          ready: Promise.resolve({
            pushManager: {
              subscribe,
              getSubscription,
            },
            showNotification: jest.fn(),
          }),
        }),
      },
    });

    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;
  });

  test('requests permission and saves the push subscription when enabled', async () => {
    render(<PushNotificationToggle />);

    fireEvent.click(screen.getByRole('button', { name: /enable alerts/i }));

    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    await waitFor(() => expect(subscribe).toHaveBeenCalled());
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/push',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      ),
    );
  });

  test('unsubscribes and deletes push subscription when already enabled and clicked', async () => {
    const mockExistingSub = {
      endpoint: 'https://example.com/push/active-sub',
      unsubscribe,
      toJSON: () => ({ endpoint: 'https://example.com/push/active-sub' }),
    };

    getSubscription.mockResolvedValue(mockExistingSub);

    render(<PushNotificationToggle />);

    // Wait for the initial subscription check to complete and button to display alerts on / disable alerts
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disable alerts/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /disable alerts/i }));

    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/push?endpoint='),
        expect.objectContaining({
          method: 'DELETE',
        }),
      ),
    );

    // After unsubscription, button should show enable alerts again
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enable alerts/i })).toBeInTheDocument();
    });
  });
});
