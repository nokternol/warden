import type { ContentType } from '@contract/schemas';
import { MediaCache } from '@server/kernel/cache';
import { getChildLogger } from '@server/kernel/logger';
import type {
  RadarrMovie,
  RadarrProvider,
  SonarrProvider,
  SonarrSeries,
} from '@server/modules/providers';
import type { MediaSourceFactory, SourceInstance } from './mediaSourceFactory';

const log = getChildLogger('SourceReadCache');

/** The raw row each content type's owning provider returns. */
interface SourceRow {
  movie: RadarrMovie;
  series: SonarrSeries;
}

export interface SourceRead<C extends ContentType> {
  providerId: number;
  name: string;
  rows: SourceRow[C][];
}

export interface SourceReadError {
  providerId: number;
  provider: string;
  error: string;
}

/** One instance's read: its rows, or why it could not be read. */
type Read = { rows: unknown[] } | { error: string };

/**
 * The cache of the latest read of each active Radarr/Sonarr instance: its rows, or why it could
 * not be read.
 *
 * Instances are chosen by `MediaSourceFactory.activeInstances`; each instance's read is kept in a
 * private `MediaCache` under its own key, so it is held for the cache's TTL (60 s) and concurrent
 * asks share one upstream fetch. It hands out raw rows, never items: callers bind rows into items
 * for each evaluation.
 *
 * A feature that needs to know what the library holds asks this cache. Only a feature about to
 * act refreshes, and it acts on the read its refresh returned.
 */
export class SourceReadCache {
  /** Each instance's read, keyed `<contentType>:<providerId>`. Errors are kept too, so asks
   *  during an outage don't each wait out a timeout. */
  private readonly cache = new MediaCache<Read>();

  constructor(
    private readonly deps: { mediaSourceFactory: Pick<MediaSourceFactory, 'activeInstances'> }
  ) {}

  /** Every active instance of `contentType`: the rows of each that answered, and an error for each
   *  that could not be read. Never fails; no active instance is an empty answer. */
  async readEach<C extends ContentType>(
    contentType: C
  ): Promise<{ reads: SourceRead<C>[]; errors: SourceReadError[] }> {
    const instances = await this.deps.mediaSourceFactory.activeInstances(contentType);
    const reads: SourceRead<C>[] = [];
    const errors: SourceReadError[] = [];
    await Promise.all(
      instances.map(async (instance) => {
        const { providerId, name } = instance;
        const read = await this.read(contentType, instance);
        if ('error' in read) errors.push({ providerId, provider: name, error: read.error });
        else reads.push({ providerId, name, rows: read.rows as SourceRow[C][] });
      })
    );
    return { reads, errors };
  }

  /** Every active instance's rows; rejects, naming each instance and why, if any could not be read. */
  async readAll<C extends ContentType>(contentType: C): Promise<SourceRead<C>[]> {
    const { reads, errors } = await this.readEach(contentType);
    if (errors.length > 0) {
      throw new Error(errors.map((e) => `${e.provider}: ${e.error}`).join('; '));
    }
    return reads;
  }

  /** One instance's latest read: its rows, or the message saying why it could not be read. */
  private read<C extends ContentType>(contentType: C, instance: SourceInstance<C>): Promise<Read> {
    const { providerId, name, provider } = instance;
    return this.cache.getOrFetch(`${contentType}:${providerId}`, async () => {
      try {
        const rows =
          contentType === 'movie'
            ? await (provider as RadarrProvider).getMovies()
            : await (provider as SonarrProvider).getSeries();
        return { rows };
      } catch (err) {
        log.warn('Source read failed', { provider: name, err });
        return {
          error: `Couldn't be reached: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
      }
    });
  }
}
