import { CacheStore } from './cache-store';

export class MemoryCache implements CacheStore {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  buildKey(prefix: string, query: string): string {
    return `${prefix}:${query.toLowerCase().trim()}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    if (!hit) {
      return null;
    }

    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return hit.value as T;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}
