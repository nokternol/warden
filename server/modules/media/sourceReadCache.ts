import type { ContentType } from '@contract/schemas';
import { MediaCache } from '@server/kernel/cache';
import type {
  RadarrMovie,
  RadarrProvider,
  SonarrProvider,
  SonarrSeries,
} from '@server/modules/providers';
import type { MediaSourceFactory } from './mediaSourceFactory';

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
  /** Each instance's rows, keyed `<contentType>:<providerId>`. */
  private readonly cache = new MediaCache<unknown[]>();

  constructor(
    private readonly deps: { mediaSourceFactory: Pick<MediaSourceFactory, 'activeInstances'> }
  ) {}

  async readEach<C extends ContentType>(
    contentType: C
  ): Promise<{ reads: SourceRead<C>[]; errors: SourceReadError[] }> {
    const instances = await this.deps.mediaSourceFactory.activeInstances(contentType);
    const reads = await Promise.all(
      instances.map(async ({ providerId, name, provider }) => {
        const rows = await this.cache.getOrFetch(`${contentType}:${providerId}`, () =>
          contentType === 'movie'
            ? (provider as RadarrProvider).getMovies()
            : (provider as SonarrProvider).getSeries()
        );
        return { providerId, name, rows: rows as SourceRow[C][] };
      })
    );
    return { reads, errors: [] };
  }
}
