import Redis from 'ioredis';
import { CacheStore } from './cache-store';

export class RedisCache implements CacheStore {
  private readonly client: Redis;

  constructor(redisUrl: string, private readonly ttlMs: number, private readonly prefix: string) {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
  }

  buildKey(prefix: string, query: string): string {
    return `${this.prefix}:${prefix}:${query.toLowerCase().trim()}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'PX', this.ttlMs);
  }
}
