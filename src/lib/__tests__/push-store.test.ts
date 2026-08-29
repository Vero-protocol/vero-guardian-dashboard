import fs from 'fs';
import path from 'path';
import os from 'os';
import { PushSubscriptionStore, type PushSubscriptionData } from '../push-store';

describe('PushSubscriptionStore', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'push-store-test-'));
    testFile = path.join(tempDir, 'subscriptions.json');
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  function makeSubscription(id: string): PushSubscriptionData {
    return {
      endpoint: `https://push.example.com/endpoint/${id}`,
      keys: {
        p256dh: `key-p256dh-${id}`,
        auth: `auth-${id}`,
      },
    };
  }

  test('saves and retrieves a subscription', async () => {
    const store = new PushSubscriptionStore({ filePath: testFile });
    const sub = makeSubscription('1');

    await store.save(sub);

    const count = await store.count();
    expect(count).toBe(1);

    const retrieved = await store.get(sub.endpoint);
    expect(retrieved).toEqual(sub);
  });

  test('throws when saving a subscription with missing or empty endpoint', async () => {
    const store = new PushSubscriptionStore({ filePath: testFile });

    await expect(store.save({} as any)).rejects.toThrow('Invalid subscription: missing or empty endpoint');
    await expect(store.save({ endpoint: '   ' } as any)).rejects.toThrow('Invalid subscription: missing or empty endpoint');
  });

  test('updates an existing subscription with the same endpoint', async () => {
    const store = new PushSubscriptionStore({ filePath: testFile });
    const sub1 = makeSubscription('update');
    await store.save(sub1);

    const sub2: PushSubscriptionData = {
      ...sub1,
      keys: { p256dh: 'updated-key', auth: 'updated-auth' },
      expirationTime: 123456789,
    };
    await store.save(sub2);

    expect(await store.count()).toBe(1);
    const retrieved = await store.get(sub1.endpoint);
    expect(retrieved?.keys?.p256dh).toBe('updated-key');
    expect(retrieved?.expirationTime).toBe(123456789);
  });

  test('persists data to disk and reloads on new store instance', async () => {
    const store1 = new PushSubscriptionStore({ filePath: testFile });
    const subA = makeSubscription('a');
    const subB = makeSubscription('b');

    await store1.save(subA);
    await store1.save(subB);

    expect(await store1.count()).toBe(2);

    // Verify file exists on disk
    expect(fs.existsSync(testFile)).toBe(true);

    // Create a new instance pointing to the same file
    const store2 = new PushSubscriptionStore({ filePath: testFile });
    expect(await store2.count()).toBe(2);

    const all = await store2.getAll();
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.endpoint === subA.endpoint)).toEqual(subA);
    expect(all.find((s) => s.endpoint === subB.endpoint)).toEqual(subB);
  });

  test('deletes a subscription by endpoint', async () => {
    const store = new PushSubscriptionStore({ filePath: testFile });
    const subA = makeSubscription('del-a');
    const subB = makeSubscription('del-b');

    await store.save(subA);
    await store.save(subB);

    const removed = await store.delete(subA.endpoint);
    expect(removed).toBe(true);
    expect(await store.count()).toBe(1);
    expect(await store.get(subA.endpoint)).toBeNull();

    // Verify deletion persisted
    const storeReloaded = new PushSubscriptionStore({ filePath: testFile });
    expect(await storeReloaded.count()).toBe(1);
    expect(await storeReloaded.get(subA.endpoint)).toBeNull();
    expect(await storeReloaded.get(subB.endpoint)).toEqual(subB);
  });

  test('delete returns false if endpoint does not exist', async () => {
    const store = new PushSubscriptionStore({ filePath: testFile });
    const removed = await store.delete('https://non-existent.example.com');
    expect(removed).toBe(false);
  });

  test('clears all subscriptions', async () => {
    const store = new PushSubscriptionStore({ filePath: testFile });
    await store.save(makeSubscription('clear-1'));
    await store.save(makeSubscription('clear-2'));
    expect(await store.count()).toBe(2);

    await store.clear();
    expect(await store.count()).toBe(0);

    const storeReloaded = new PushSubscriptionStore({ filePath: testFile });
    expect(await storeReloaded.count()).toBe(0);
  });

  test('handles corrupt JSON on disk gracefully by initializing an empty store', async () => {
    await fs.promises.mkdir(tempDir, { recursive: true });
    await fs.promises.writeFile(testFile, 'INVALID_JSON_CONTENT{{{', 'utf-8');

    const store = new PushSubscriptionStore({ filePath: testFile });
    expect(await store.count()).toBe(0);

    const sub = makeSubscription('recovery');
    await store.save(sub);
    expect(await store.count()).toBe(1);
  });

  test('in-memory mode (persistToDisk: false) operates without creating a file', async () => {
    const store = new PushSubscriptionStore({ filePath: testFile, persistToDisk: false });
    await store.save(makeSubscription('mem-1'));
    expect(await store.count()).toBe(1);
    expect(fs.existsSync(testFile)).toBe(false);
  });
});
