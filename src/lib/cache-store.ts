export interface CacheStore {
  buildKey(prefix: string, query: string): string;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
}
