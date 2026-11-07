interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export class MediaCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly pending = new Map<string, Promise<T>>();
  private readonly generations = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs = 60_000) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, fetchedAt: Date.now() });
  }

  /**
   * Drops the key's value and its in-flight fetch: a fetch already running when this is called
   * still settles for its own callers, but its result is not stored, and the next caller starts
   * a fresh fetch.
   */
  invalidate(key: string): void {
    this.generations.set(key, this.generationOf(key) + 1);
    this.store.delete(key);
    this.pending.delete(key);
  }

  /** Invalidates every key that holds a value or an in-flight fetch. */
  clear(): void {
    for (const key of new Set([...this.store.keys(), ...this.pending.keys()])) {
      this.invalidate(key);
    }
  }

  async getOrFetch(key: string, fetcher: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== null) return hit;

    const inflight = this.pending.get(key);
    if (inflight) return inflight;

    const generation = this.generationOf(key);
    const promise: Promise<T> = fetcher()
      .then((data) => {
        // An invalidation while this fetch was in flight makes its result stale.
        if (this.generationOf(key) === generation) this.set(key, data);
        return data;
      })
      .finally(() => {
        // After an invalidation a newer fetch may own this key; leave its entry for its callers.
        if (this.pending.get(key) === promise) this.pending.delete(key);
      });
    this.pending.set(key, promise);
    return promise;
  }

  private generationOf(key: string): number {
    return this.generations.get(key) ?? 0;
  }
}
