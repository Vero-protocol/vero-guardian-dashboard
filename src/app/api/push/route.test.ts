/**
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { GET, POST, DELETE } from './route';
import { pushSubscriptionStore } from '@/lib/push-store';

describe('/api/push', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'push-route-test-'));
    testFile = path.join(tempDir, 'subscriptions.json');
    process.env.PUSH_SUBSCRIPTIONS_FILE = testFile;
    await pushSubscriptionStore.clear();
  });

  afterEach(async () => {
    delete process.env.PUSH_SUBSCRIPTIONS_FILE;
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  test('POST stores subscription and returns count', async () => {
    const request = new Request('http://localhost/api/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '127.0.0.1',
      },
      body: JSON.stringify({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/sub1',
          keys: {
            p256dh: 'BNcRdreStoreTestKey',
            auth: 'authSecret123',
          },
        },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.count).toBe(1);
  });

  test('POST rejects missing subscription or missing endpoint', async () => {
    const badRequest1 = new Request('http://localhost/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.2' },
      body: JSON.stringify({}),
    });
    const res1 = await POST(badRequest1);
    expect(res1.status).toBe(400);

    const badRequest2 = new Request('http://localhost/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.3' },
      body: JSON.stringify({ subscription: { endpoint: '   ' } }),
    });
    const res2 = await POST(badRequest2);
    expect(res2.status).toBe(400);
  });

  test('GET returns subscription count', async () => {
    // Initial count should be 0
    const req1 = new Request('http://localhost/api/push', {
      headers: { 'x-forwarded-for': '127.0.0.4' },
    });
    const res1 = await GET(req1);
    const data1 = await res1.json();
    expect(res1.status).toBe(200);
    expect(data1.ok).toBe(true);
    expect(data1.count).toBe(0);

    // Save one subscription
    await pushSubscriptionStore.save({
      endpoint: 'https://fcm.googleapis.com/fcm/send/sub-get-test',
    });

    const req2 = new Request('http://localhost/api/push', {
      headers: { 'x-forwarded-for': '127.0.0.5' },
    });
    const res2 = await GET(req2);
    const data2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(data2.ok).toBe(true);
    expect(data2.count).toBe(1);
  });

  test('DELETE removes subscription via body endpoint', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/delete-test-1';
    await pushSubscriptionStore.save({ endpoint });
    expect(await pushSubscriptionStore.count()).toBe(1);

    const request = new Request('http://localhost/api/push', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '127.0.0.6',
      },
      body: JSON.stringify({ endpoint }),
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.removed).toBe(true);
    expect(data.count).toBe(0);
  });

  test('DELETE removes subscription via URL query parameter', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/delete-test-2';
    await pushSubscriptionStore.save({ endpoint });
    expect(await pushSubscriptionStore.count()).toBe(1);

    const request = new Request(`http://localhost/api/push?endpoint=${encodeURIComponent(endpoint)}`, {
      method: 'DELETE',
      headers: {
        'x-forwarded-for': '127.0.0.7',
      },
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.removed).toBe(true);
    expect(data.count).toBe(0);
  });

  test('DELETE returns 400 if endpoint is missing', async () => {
    const request = new Request('http://localhost/api/push', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '127.0.0.8',
      },
      body: JSON.stringify({}),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Missing push subscription endpoint.');
  });
});
