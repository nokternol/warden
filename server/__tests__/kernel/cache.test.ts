/**
 * MediaCache unit tests.
 *
 * Run: vitest run --project server
 */
import { MediaCache } from '@server/kernel/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('MediaCache.getOrFetch', () => {
  let cache: MediaCache<string[]>;

  beforeEach(() => {
    cache = new MediaCache<string[]>(1000);
  });

  it('returns the cached value without calling the fetcher on a hit', async () => {
    cache.set('movies', ['a', 'b']);
    const fetcher = vi.fn<() => Promise<string[]>>().mockResolvedValue(['c']);
    const result = await cache.getOrFetch('movies', fetcher);
    expect(result).toEqual(['a', 'b']);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('calls the fetcher on a miss, returns data, and populates the cache', async () => {
    const fetcher = vi.fn<() => Promise<string[]>>().mockResolvedValue(['x', 'y']);
    const result = await cache.getOrFetch('movies', fetcher);
    expect(result).toEqual(['x', 'y']);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cache.get('movies')).toEqual(['x', 'y']);
  });

  it('two concurrent misses coalesce: fetcher called once, both callers receive the data', async () => {
    const fetcher = vi.fn<() => Promise<string[]>>().mockResolvedValue(['z']);
    const [r1, r2] = await Promise.all([
      cache.getOrFetch('movies', fetcher),
      cache.getOrFetch('movies', fetcher),
    ]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(r1).toEqual(['z']);
    expect(r2).toEqual(['z']);
  });

  it('cleans up the pending entry on rejection so the next caller retries', async () => {
    const fetcher = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(['ok']);

    await expect(cache.getOrFetch('movies', fetcher)).rejects.toThrow('network');

    const result = await cache.getOrFetch('movies', fetcher);
    expect(result).toEqual(['ok']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not populate the cache after a failed fetch', async () => {
    const fetcher = vi.fn<() => Promise<string[]>>().mockRejectedValue(new Error('fail'));
    await expect(cache.getOrFetch('movies', fetcher)).rejects.toThrow('fail');
    expect(cache.get('movies')).toBeNull();
  });
});

describe('MediaCache', () => {
  let cache: MediaCache<string[]>;

  beforeEach(() => {
    cache = new MediaCache<string[]>(1000); // 1s TTL for tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for a key that has never been set', () => {
    expect(cache.get('movies')).toBeNull();
  });

  it('returns data immediately after set', () => {
    cache.set('movies', ['a', 'b']);
    expect(cache.get('movies')).toEqual(['a', 'b']);
  });

  it('returns data within TTL', () => {
    cache.set('movies', ['a']);
    vi.advanceTimersByTime(999);
    expect(cache.get('movies')).toEqual(['a']);
  });

  it('returns null after TTL expires', () => {
    cache.set('movies', ['a']);
    vi.advanceTimersByTime(1001);
    expect(cache.get('movies')).toBeNull();
  });

  it('invalidate removes the entry before TTL', () => {
    cache.set('movies', ['a']);
    cache.invalidate('movies');
    expect(cache.get('movies')).toBeNull();
  });

  it('invalidate is a no-op for unknown keys', () => {
    expect(() => cache.invalidate('unknown')).not.toThrow();
  });

  it('stores independent entries per key', () => {
    cache.set('movies', ['m1']);
    cache.set('series', ['s1']);
    expect(cache.get('movies')).toEqual(['m1']);
    expect(cache.get('series')).toEqual(['s1']);
  });

  it('invalidating one key does not affect others', () => {
    cache.set('movies', ['m1']);
    cache.set('series', ['s1']);
    cache.invalidate('movies');
    expect(cache.get('movies')).toBeNull();
    expect(cache.get('series')).toEqual(['s1']);
  });
});

/** A promise whose settlement the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('MediaCache invalidation during an in-flight fetch', () => {
  let cache: MediaCache<string[]>;

  beforeEach(() => {
    cache = new MediaCache<string[]>(1000);
  });

  it('does not store the stale result, and the next getOrFetch refetches', async () => {
    const stale = deferred<string[]>();
    const first = cache.getOrFetch('movies', () => stale.promise);

    cache.invalidate('movies');
    stale.resolve(['old']);
    await first;

    expect(cache.get('movies')).toBeNull();
    const fresh = vi.fn<() => Promise<string[]>>().mockResolvedValue(['new']);
    expect(await cache.getOrFetch('movies', fresh)).toEqual(['new']);
    expect(fresh).toHaveBeenCalledOnce();
  });

  it('a settling stale fetch does not drop the fetch that replaced it', async () => {
    const fetchA = deferred<string[]>();
    const fetchB = deferred<string[]>();
    const a = cache.getOrFetch('movies', () => fetchA.promise);
    cache.invalidate('movies');
    const b = cache.getOrFetch('movies', () => fetchB.promise);

    fetchA.resolve(['old']);
    await a;

    const third = vi.fn<() => Promise<string[]>>().mockResolvedValue(['third']);
    const c = cache.getOrFetch('movies', third);
    fetchB.resolve(['new']);
    expect(await c).toEqual(['new']);
    expect(await b).toEqual(['new']);
    expect(third).not.toHaveBeenCalled();
  });

  it('a stale fetch that rejects does not drop the fetch that replaced it', async () => {
    const fetchA = deferred<string[]>();
    const fetchB = deferred<string[]>();
    const a = cache.getOrFetch('movies', () => fetchA.promise);
    cache.invalidate('movies');
    const b = cache.getOrFetch('movies', () => fetchB.promise);

    fetchA.reject(new Error('upstream down'));
    await expect(a).rejects.toThrow('upstream down');

    const third = vi.fn<() => Promise<string[]>>().mockResolvedValue(['third']);
    const c = cache.getOrFetch('movies', third);
    fetchB.resolve(['new']);
    expect(await c).toEqual(['new']);
    expect(await b).toEqual(['new']);
    expect(third).not.toHaveBeenCalled();
  });

  it('clear() empties every key and drops every in-flight fetch', async () => {
    cache.set('movies', ['m']);
    const inflight = deferred<string[]>();
    const series = cache.getOrFetch('series', () => inflight.promise);

    cache.clear();
    inflight.resolve(['stale']);
    await series;

    expect(cache.get('movies')).toBeNull();
    expect(cache.get('series')).toBeNull();
  });
});
