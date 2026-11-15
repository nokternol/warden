import type { MediaSourceFactory } from '@server/modules/media/mediaSourceFactory';
import { SourceReadCache } from '@server/modules/media/sourceReadCache';
import type { RadarrMovie } from '@server/modules/providers';
import { describe, expect, it } from 'vitest';

const movie = (id: number, title: string) => ({ id, title }) as RadarrMovie;

/** A Radarr instance whose connection answers `rows` (or throws it) and counts each upstream read. */
const radarrInstance = (providerId: number, name: string, rows: RadarrMovie[] | Error) => {
  const instance = {
    providerId,
    name,
    reads: 0,
    provider: {
      getMovies: async () => {
        instance.reads++;
        if (rows instanceof Error) throw rows;
        return rows;
      },
    },
  };
  return instance;
};

const cacheOver = (instances: ReturnType<typeof radarrInstance>[]) =>
  new SourceReadCache({
    mediaSourceFactory: {
      activeInstances: (async () => instances) as unknown as MediaSourceFactory['activeInstances'],
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
