export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Lightweight in-memory LRU cache with optional TTL for frequent
 * context-search queries, tool results, and parsed markdown fragments.
 */
export class MemoryLruCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;

  constructor(maxEntries = 100, defaultTtlMs = 5 * 60_000) {
    this.maxEntries = Math.max(1, maxEntries);
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Promote to most-recently-used
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, {
      value,
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export const contextSearchCache = new MemoryLruCache<unknown>(80, 3 * 60_000);
export const agentToolReadCache = new MemoryLruCache<{ ok: boolean; output: string }>(
  60,
  15_000,
);

export async function warmStaticAssetCache(urls: string[]): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const cache = await window.caches.open('luna-static-v1');
    await Promise.all(
      urls.map(async (url) => {
        try {
          const hit = await cache.match(url);
          if (!hit) {
            await cache.add(url);
          }
        } catch {
          // ignore individual asset fetch errors when offline
        }
      }),
    );
  } catch {
    // ignore Cache API restriction in private contexts
  }
}
