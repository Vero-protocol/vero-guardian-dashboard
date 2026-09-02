import fs from 'fs';
import path from 'path';

export interface PushSubscriptionKeys {
  p256dh?: string;
  auth?: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys?: PushSubscriptionKeys;
  [key: string]: unknown;
}

export interface PushSubscriptionStoreOptions {
  filePath?: string;
  persistToDisk?: boolean;
}

export class PushSubscriptionStore {
  private filePath: string;
  private persistToDisk: boolean;
  private cache: Map<string, PushSubscriptionData> | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: PushSubscriptionStoreOptions = {}) {
    this.filePath =
      options.filePath ||
      process.env.PUSH_SUBSCRIPTIONS_FILE ||
      path.join(process.cwd(), 'data', 'push-subscriptions.json');
    this.persistToDisk = options.persistToDisk ?? true;
  }

  private async ensureInitialized(): Promise<Map<string, PushSubscriptionData>> {
    if (this.cache) {
      return this.cache;
    }

    if (this.initPromise) {
      await this.initPromise;
      return this.cache!;
    }

    this.initPromise = (async () => {
      const map = new Map<string, PushSubscriptionData>();
      if (!this.persistToDisk) {
        this.cache = map;
        return;
      }

      try {
        if (fs.existsSync(this.filePath)) {
          const raw = await fs.promises.readFile(this.filePath, 'utf-8');
          const data = JSON.parse(raw);
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item && typeof item === 'object' && typeof item.endpoint === 'string') {
                map.set(item.endpoint, item as PushSubscriptionData);
              }
            }
          } else if (data && typeof data === 'object') {
            for (const [key, item] of Object.entries(data)) {
              if (item && typeof item === 'object' && typeof (item as any).endpoint === 'string') {
                map.set((item as any).endpoint, item as PushSubscriptionData);
              } else if (typeof key === 'string' && item && typeof item === 'object') {
                map.set(key, { ...item, endpoint: (item as any).endpoint || key } as PushSubscriptionData);
              }
            }
          }
        }
      } catch (err) {
        // Corrupt or unreadable file: start with fresh empty map and warn
        console.warn(`[PushSubscriptionStore] Warning: Failed to read subscriptions from ${this.filePath}:`, err);
      }

      this.cache = map;
    })();

    await this.initPromise;
    this.initPromise = null;
    return this.cache!;
  }

  private async persist(): Promise<void> {
    if (!this.persistToDisk || !this.cache) {
      return;
    }

    try {
      const dir = path.dirname(this.filePath);
      await fs.promises.mkdir(dir, { recursive: true });

      const items = Array.from(this.cache.values());
      const serialized = JSON.stringify(items, null, 2);

      const tmpFile = `${this.filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      await fs.promises.writeFile(tmpFile, serialized, 'utf-8');
      await fs.promises.rename(tmpFile, this.filePath);
    } catch (err) {
      console.warn(`[PushSubscriptionStore] Warning: Failed to persist subscriptions to ${this.filePath}:`, err);
    }
  }

  async save(subscription: PushSubscriptionData): Promise<void> {
    if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.endpoint.trim()) {
      throw new Error('Invalid subscription: missing or empty endpoint');
    }

    const cache = await this.ensureInitialized();
    cache.set(subscription.endpoint, subscription);
    await this.persist();
  }

  async delete(endpoint: string): Promise<boolean> {
    if (!endpoint || typeof endpoint !== 'string') {
      return false;
    }

    const cache = await this.ensureInitialized();
    const exists = cache.has(endpoint);
    if (exists) {
      cache.delete(endpoint);
      await this.persist();
      return true;
    }

    return false;
  }

  async get(endpoint: string): Promise<PushSubscriptionData | null> {
    if (!endpoint || typeof endpoint !== 'string') {
      return null;
    }

    const cache = await this.ensureInitialized();
    return cache.get(endpoint) || null;
  }

  async getAll(): Promise<PushSubscriptionData[]> {
    const cache = await this.ensureInitialized();
    return Array.from(cache.values());
  }

  async count(): Promise<number> {
    const cache = await this.ensureInitialized();
    return cache.size;
  }

  async clear(): Promise<void> {
    const cache = await this.ensureInitialized();
    cache.clear();
    await this.persist();
  }
}

export const pushSubscriptionStore = new PushSubscriptionStore();
