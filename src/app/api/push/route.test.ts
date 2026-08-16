/**
 * @jest-environment node
 */

import { POST, GET } from './route';

describe('/api/push', () => {
  test('accepts a valid push subscription with keys', async () => {
    const response = await POST(
      new Request('http://localhost/api/push', {
        method: 'POST',
        body: JSON.stringify({
          subscription: {
            endpoint: 'https://fcm.googleapis.com/push/abc123',
            expirationTime: null,
            keys: {
              p256dh: 'BOrL9K...base64key',
              auth: 'base64auth',
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(typeof payload.count).toBe('number');
  });

  test('accepts a subscription without expirationTime', async () => {
    const response = await POST(
      new Request('http://localhost/api/push', {
        method: 'POST',
        body: JSON.stringify({
          subscription: {
            endpoint: 'https://fcm.googleapis.com/push/def456',
            keys: {
              p256dh: 'key-data',
              auth: 'auth-data',
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
  });

  test('rejects push subscription with missing endpoint', async () => {
    const response = await POST(
      new Request('http://localhost/api/push', {
        method: 'POST',
        body: JSON.stringify({
          subscription: {
            keys: { p256dh: 'key', auth: 'auth' },
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('rejects an invalid endpoint URL', async () => {
    const response = await POST(
      new Request('http://localhost/api/push', {
        method: 'POST',
        body: JSON.stringify({
          subscription: {
            endpoint: 'not-a-url',
            keys: { p256dh: 'key', auth: 'auth' },
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('rejects a subscription with empty keys fields', async () => {
    const response = await POST(
      new Request('http://localhost/api/push', {
        method: 'POST',
        body: JSON.stringify({
          subscription: {
            endpoint: 'https://fcm.googleapis.com/push/ghi789',
            keys: { p256dh: '', auth: '' },
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test('rejects malformed JSON payload', async () => {
    const response = await POST(
      new Request('http://localhost/api/push', {
        method: 'POST',
        body: 'broken',
      }),
    );

    expect(response.status).toBe(400);
  });

  test('GET returns ok with count', async () => {
    const response = await GET();
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(typeof payload.count).toBe('number');
  });
});