import { DomainEventBus } from '@server/kernel/eventBus';
import type { MediaSourceFactory } from '@server/modules/media/mediaSourceFactory';
import { SourceReadCache } from '@server/modules/media/sourceReadCache';
import type { RadarrMovie } from '@server/modules/providers';
import { describe, expect, it } from 'vitest';

const movie = (id: number, title: string) => ({ id, title }) as RadarrMovie;

/**
 * A Radarr instance whose connection answers `rows`, throws it, or (`'hang'`) never answers, and
 * counts each upstream read. `rows` can be changed to change what upstream holds.
 */
const radarrInstance = (providerId: number, name: string, rows: RadarrMovie[] | Error | 'hang') => {
  const instance = {
    providerId,
    name,
    rows,
    reads: 0,
    provider: {
      getMovies: async () => {
        instance.reads++;
        if (instance.rows instanceof Error) throw instance.rows;
        if (instance.rows === 'hang') return new Promise<RadarrMovie[]>(() => {});
        return instance.rows;
      },
    },
  };
  return instance;
};

const cacheOver = (
  instances: ReturnType<typeof radarrInstance>[],
  eventBus = new DomainEventBus()
) =>
  new SourceReadCache({
    eventBus,
    mediaSourceFactory: {
      activeInstances: (async (contentType: string) =>
        contentType === 'movie'
          ? instances
          : []) as unknown as MediaSourceFactory['activeInstances'],
    },
  });

describe('SourceReadCache.readEach', () => {
  it("returns each active Radarr instance's rows by provider id, reading upstream once inside the TTL", async () => {
    const hd = radarrInstance(1, 'Radarr', [movie(10, 'Alien')]);
    const uhd = radarrInstance(2, 'Radarr 4k', [movie(20, 'Heat'), movie(21, 'Ran')]);
    const cache = cacheOver([hd, uhd]);

    await cache.readEach('movie');
    const { reads } = await cache.readEach('movie');

    expect(Object.fromEntries(reads.map((r) => [r.providerId, r.rows]))).toEqual({
      1: [movie(10, 'Alien')],
      2: [movie(20, 'Heat'), movie(21, 'Ran')],
    });
    expect(reads.find((r) => r.providerId === 2)?.name).toBe('Radarr 4k');
    expect([hd.reads, uhd.reads]).toEqual([1, 1]);
  });

  it('answers a failing instance with an error carrying its provider id and name, and still answers the others', async () => {
    const down = radarrInstance(1, 'Radarr', new Error('ECONNREFUSED'));
    const up = radarrInstance(2, 'Radarr 4k', [movie(20, 'Heat')]);

    await expect(cacheOver([down, up]).readEach('movie')).resolves.toEqual({
      reads: [{ providerId: 2, name: 'Radarr 4k', rows: [movie(20, 'Heat')] }],
      errors: [{ providerId: 1, provider: 'Radarr', error: "Couldn't be reached: ECONNREFUSED" }],
    });
  });
});

describe('SourceReadCache.readAll', () => {
  it('rejects, naming the instance and why, when any instance failed', async () => {
    const down = radarrInstance(1, 'Radarr', new Error('ECONNREFUSED'));
    const up = radarrInstance(2, 'Radarr 4k', [movie(20, 'Heat')]);

    await expect(cacheOver([down, up]).readAll('movie')).rejects.toThrow(
      "Radarr: Couldn't be reached: ECONNREFUSED"
    );
  });
});

describe('SourceReadCache.readOne', () => {
  it('reads only that instance, so a sibling that never answers neither delays nor fails it', async () => {
    const sibling = radarrInstance(1, 'Radarr', 'hang');
    const own = radarrInstance(2, 'Radarr 4k', [movie(20, 'Heat')]);

    await expect(cacheOver([sibling, own]).readOne(2)).resolves.toEqual({
      providerId: 2,
      name: 'Radarr 4k',
      rows: [movie(20, 'Heat')],
    });
    expect(sibling.reads).toBe(0);
  });

  it('rejects with "not an active provider" for an id no active instance has', async () => {
    const cache = cacheOver([radarrInstance(1, 'Radarr', [movie(10, 'Alien')])]);

    await expect(cache.readOne(9)).rejects.toThrow('Provider instance 9 is not an active provider');
  });
});

describe('SourceReadCache refresh', () => {
  it('re-reads upstream inside the TTL and returns the new rows', async () => {
    const radarr = radarrInstance(1, 'Radarr', [movie(10, 'Alien')]);
    const cache = cacheOver([radarr]);
    await cache.readEach('movie');

    radarr.rows = [movie(10, 'Alien'), movie(11, 'Aliens')];
    const { reads } = await cache.readEach('movie', { refresh: true });

    expect(reads[0].rows).toEqual([movie(10, 'Alien'), movie(11, 'Aliens')]);
  });
});

describe('SourceReadCache clearing', () => {
  it.each([
    ['media:changed', (bus: DomainEventBus) => bus.emit('media:changed', {})],
    ['provider:changed', (bus: DomainEventBus) => bus.emit('provider:changed', {})],
    ['clear()', (_bus: DomainEventBus, cache: SourceReadCache) => cache.clear()],
  ] as const)('%s makes the next read fresh', async (_name, clearIt) => {
    const radarr = radarrInstance(1, 'Radarr', [movie(10, 'Alien')]);
    const bus = new DomainEventBus();
    const cache = cacheOver([radarr], bus);
    await cache.readEach('movie');

    radarr.rows = [movie(11, 'Aliens')];
    clearIt(bus, cache);
    const { reads } = await cache.readEach('movie');

    expect(reads[0].rows).toEqual([movie(11, 'Aliens')]);
  });
});
