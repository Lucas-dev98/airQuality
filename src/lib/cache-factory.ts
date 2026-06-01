import { env } from '../config/env';
import { logger } from './logger';
import { CacheStore } from './cache-store';
import { MemoryCache } from './memory-cache';
import { RedisCache } from './redis-cache';

let cacheInstance: CacheStore | null = null;

export function getCacheStore(): CacheStore {
  if (cacheInstance) {
    return cacheInstance;
  }

  if (env.REDIS_URL) {
    try {
      cacheInstance = new RedisCache(env.REDIS_URL, env.CACHE_TTL_MS, env.REDIS_PREFIX);
      logger.info('Using Redis cache store');
      return cacheInstance;
    } catch (error) {
      logger.warn({ err: error }, 'Failed to initialize Redis cache, falling back to memory cache');
    }
  }

  cacheInstance = new MemoryCache(env.CACHE_TTL_MS);
  logger.info('Using in-memory cache store');
  return cacheInstance;
}
