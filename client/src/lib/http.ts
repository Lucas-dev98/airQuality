type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type GetJsonOptions = {
  timeoutMs?: number;
  clientId?: string;
  method?: HttpMethod;
  body?: unknown;
  cacheTtlMs?: number;
  retries?: number;
  useCache?: boolean;
};

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_RETRIES = 1;
const MAX_CACHE_ENTRIES = 300;

const responseCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildRequestKey(url: string, method: HttpMethod, clientId?: string): string {
  return `${method}:${url}:${clientId || 'anonymous'}`;
}

function pruneCache() {
  if (responseCache.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const now = Date.now();
  for (const [key, entry] of responseCache.entries()) {
    if (entry.expiresAt <= now) {
      responseCache.delete(key);
    }
  }

  while (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    responseCache.delete(oldestKey);
  }
}

function readFromCache<T>(key: string): T | null {
  const item = responseCache.get(key);
  if (!item) {
    return null;
  }

  if (item.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }

  return item.value as T;
}

function saveToCache(key: string, value: unknown, ttlMs: number) {
  responseCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
  pruneCache();
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) {
    return null;
  }

  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(header);
  if (Number.isNaN(asDate)) {
    return null;
  }

  const delta = asDate - Date.now();
  return delta > 0 ? delta : null;
}

export async function getJson<T>(url: string, options?: GetJsonOptions): Promise<T> {
  const method = (options?.method || 'GET') as HttpMethod;
  const isGet = method === 'GET';
  const useCache = isGet && options?.useCache !== false;
  const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const retries = options?.retries ?? DEFAULT_RETRIES;
  const requestKey = buildRequestKey(url, method, options?.clientId);

  if (useCache) {
    const cached = readFromCache<T>(requestKey);
    if (cached) {
      return cached;
    }

    const inflight = inflightRequests.get(requestKey);
    if (inflight) {
      return inflight as Promise<T>;
    }
  }

  const runRequest = async (): Promise<T> => {
    let attempt = 0;

    while (true) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), options?.timeoutMs || DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(options?.clientId ? { 'x-client-id': options.clientId } : {}),
          },
          body: options?.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (response.ok) {
          if (useCache) {
            saveToCache(requestKey, payload, cacheTtlMs);
          }
          return payload as T;
        }

        const status = response.status;
        if (status === 429 && attempt < retries) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
          const fallbackBackoff = Math.min(8000, 600 * (2 ** attempt)) + Math.floor(Math.random() * 250);
          await wait(retryAfterMs ?? fallbackBackoff);
          attempt += 1;
          continue;
        }

        const responseError = (payload as { error?: string } | null)?.error;
        throw new Error(responseError || `Falha na consulta da API (HTTP ${status}).`);
      } finally {
        window.clearTimeout(timeout);
      }
    }
  };

  const requestPromise = runRequest().finally(() => {
    inflightRequests.delete(requestKey);
  });

  if (useCache) {
    inflightRequests.set(requestKey, requestPromise as Promise<unknown>);
  }

  return requestPromise;
}
