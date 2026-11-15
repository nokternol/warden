import type { ContentType } from '@contract/schemas';
import { MetadataProviderType } from '@server/database/schema';
import { api } from '@server/kernel/api';
import { MediaCache } from '@server/kernel/cache';
import type { DrizzleDb } from '@server/kernel/db';
import type { DomainEventBus } from '@server/kernel/eventBus';
import { getChildLogger } from '@server/kernel/logger';
import {
  type IProviderFactory,
  type JellyfinItem,
  type JellyfinProvider,
  type PlexMediaItem,
  type PlexProvider,
  ProviderFactory,
  type ProviderSettingsService,
  type RadarrMovie,
  type RadarrProfile,
  type RadarrProvider,
  type RadarrTag,
  type SonarrProfile,
  type SonarrProvider,
  type SonarrSeries,
  type SonarrTag,
  isMediaSourceType,
} from '@server/modules/providers';
import { type FilterReadiness, filterAnswer, findingsFor } from './filterReadiness';
import { type LibraryCache, type LibraryCopy, copiesSource, recordsFor } from './libraryCache';
import { paginateItems } from './media.pagination';
import { sortMedia } from './media.sort';
import { resolutionTier } from './mediaFieldProvider';
import { itemKey } from './mediaItem';
import type { MediaQueryEngine } from './mediaQueryEngine';
import { resetMediaData } from './mediaReset';
import type { MediaSource } from './mediaSource';
import { sourceOwnership } from './mediaSourceFactory';
import { type Filter, type NormalizedMovie, type NormalizedSeries, getRule } from './ruleRegistry';

const log = getChildLogger('MediaProcedures');

/** The bus events on which the media procedures clear every cache they own. */
const CLEARED_ON = ['media:changed', 'provider:changed'] as const;

// ─── Handler-local helpers ────────────────────────────────────────────────────

function computeYearRange(items: Array<{ year?: number }>): {
  min: number | null;
  max: number | null;
} {
  const years = items
    .map((m) => m.year)
    .filter((y): y is number => y !== undefined && y !== null && y >= 1888);
  if (years.length === 0) return { min: null, max: null };
  return { min: Math.min(...years), max: Math.max(...years) };
}

// ─── Handler cradle ────────────────────────────────────────────────────────────

interface MediaCradle {
  providerSettingsService: ProviderSettingsService;
  providerFactory?: IProviderFactory;
  mediaQueryEngine: MediaQueryEngine;
  eventBus: DomainEventBus;
  filterReadiness: Pick<FilterReadiness, 'readFacts'>;
  libraryCache: Pick<LibraryCache, 'read'>;
  db?: DrizzleDb;
}

/** How a browse page is ordered and which slice of the matches it holds. */
interface BrowseView {
  sort: string;
  page: number;
  pageSize: number;
}

export interface MediaError {
  provider: string;
  error: string;
}

interface MovieSublist {
  providerId: number;
  movies: RadarrMovie[];
}

interface SeriesSublist {
  providerId: number;
  series: SonarrSeries[];
}

type DecoratedTag = RadarrTag & {
  providerId: number;
  providerName: string;
};

type DecoratedProfile = RadarrProfile & {
  providerId: number;
  providerName: string;
};

/**
 * Groups matched copies into titles by the title group the catalog refresh recorded, so browse
 * says a copy belongs to a title by the same rule as every other feature. Filter semantics are
 * ANY: grouping happens after matching, so a title appears if at least one of its copies matched.
 * The representative is the first matched copy in the current sort order.
 */
function groupByTitle<R>(
  sorted: Array<{ copy: LibraryCopy; record: R }>
): Array<R & { sourceCount: number; sourceProviderIds: number[] }> {
  const groups = new Map<number, Array<{ copy: LibraryCopy; record: R }>>();
  for (const entry of sorted) {
    const copies = groups.get(entry.copy.mediaIdentityId);
    if (copies) copies.push(entry);
    else groups.set(entry.copy.mediaIdentityId, [entry]);
  }
  return [...groups.values()].map((copies) => ({
    ...copies[0].record,
    sourceCount: copies.length,
    sourceProviderIds: copies.map((c) => c.copy.providerId),
  }));
}

/** Copies split by the instance holding them, in the order the library lists them. */
function byInstance<C extends ContentType>(copies: LibraryCopy<C>[]) {
  const sublists = new Map<number, LibraryCopy<C>['record'][]>();
  for (const { providerId, record } of copies) {
    const records = sublists.get(providerId) ?? [];
    records.push(record);
    sublists.set(providerId, records);
  }
  return [...sublists.entries()].map(([providerId, records]) => ({ providerId, records }));
}

export function createMediaProcedures(cradle: MediaCradle) {
  const { providerSettingsService, mediaQueryEngine } = cradle;
  const factory = cradle.providerFactory ?? new ProviderFactory();

  // Caches are owned by this factory invocation — same inputs produce isolated state.
  const tagsCache = new MediaCache<{
    radarr: DecoratedTag[];
    sonarr: DecoratedTag[];
  }>();
  const qualityProfilesCache = new MediaCache<{
    radarr: DecoratedProfile[];
    sonarr: DecoratedProfile[];
  }>();
  const languageProfilesCache = new MediaCache<DecoratedProfile[]>();
  const genresCache = new MediaCache<{ movies: string[]; series: string[] }>();
  const networksCache = new MediaCache<string[]>();
  const studioCache = new MediaCache<string[]>();
  const releaseGroupsCache = new MediaCache<string[]>();
  const collectionNamesCache = new MediaCache<string[]>();
  const fileContainerCache = new MediaCache<string[]>();
  const videoCodecCache = new MediaCache<string[]>();
  const audioCodecCache = new MediaCache<string[]>();
  const fileResolutionCache = new MediaCache<string[]>();
  const labelsCache = new MediaCache<string[]>();
  const plexItemsCache = new MediaCache<PlexMediaItem[]>();
  const jellyfinItemsCache = new MediaCache<JellyfinItem[]>();

  /** Each active Radarr instance's copies, kept separate so browse can attribute them. */
  async function getMovies(): Promise<{ sublists: MovieSublist[]; errors: MediaError[] }> {
    const { copies } = await cradle.libraryCache.read();
    return {
      sublists: byInstance(copies.movie).map(({ providerId, records }) => ({
        providerId,
        movies: records,
      })),
      errors: [],
    };
  }

  /** Each active Sonarr instance's copies, kept separate so browse can attribute them. */
  async function getSeries(): Promise<{ sublists: SeriesSublist[]; errors: MediaError[] }> {
    const { copies } = await cradle.libraryCache.read();
    return {
      sublists: byInstance(copies.series).map(({ providerId, records }) => ({
        providerId,
        series: records,
      })),
      errors: [],
    };
  }

  /** Every active Plex instance's flattened library — shared by every Plex-sourced
   *  lookup (studio, file-tech fields, labels) so each fetches Plex once, not once
   *  per lookup route. */
  async function getPlexItems(): Promise<PlexMediaItem[]> {
    return plexItemsCache.getOrFetch('plexItems', async () => {
      const providers = await providerSettingsService.findActiveByTypes([
        MetadataProviderType.PLEX,
      ]);
      const all: PlexMediaItem[] = [];
      await Promise.all(
        providers.map(async (provider) => {
          try {
            const plex = factory.create(provider, log) as PlexProvider;
            all.push(...(await plex.getAllItems()));
          } catch (err) {
            log.warn('Plex fetch failed', { provider: provider.name, err });
          }
        })
      );
      return all;
    });
  }

  /** Every active Jellyfin instance's flattened library — shared by every
   *  Jellyfin-sourced lookup, same one-fetch-per-route-set shape as getPlexItems. */
  async function getJellyfinItems(): Promise<JellyfinItem[]> {
    return jellyfinItemsCache.getOrFetch('jellyfinItems', async () => {
      const providers = await providerSettingsService.findActiveByTypes([
        MetadataProviderType.JELLYFIN,
      ]);
      const all: JellyfinItem[] = [];
      await Promise.all(
        providers.map(async (provider) => {
          try {
            const jellyfin = factory.create(provider, log) as JellyfinProvider;
            all.push(...(await jellyfin.getAllItems()));
          } catch (err) {
            log.warn('Jellyfin fetch failed', { provider: provider.name, err });
          }
        })
      );
      return all;
    });
  }

  function values(v: string | string[] | undefined): string[] {
    return v === undefined ? [] : Array.isArray(v) ? v : [v];
  }

  /** Dedupe+sort a string projection over every fetched Plex and Jellyfin item —
   *  the shape every file-tech/studio/label lookup route shares. Per the spec,
   *  Jellyfin joins these rules as an additional producer alongside Plex, so
   *  every route aggregates both configured servers' already-fetched library
   *  data rather than just one. */
  function mediaServerStringLookup(
    cache: MediaCache<string[]>,
    cacheKey: string,
    pickPlex: (item: PlexMediaItem) => string | string[] | undefined,
    pickJellyfin: (item: JellyfinItem) => string | string[] | undefined
  ) {
    return () =>
      cache.getOrFetch(cacheKey, async () => {
        const [plexItems, jellyfinItems] = await Promise.all([getPlexItems(), getJellyfinItems()]);
        const all = [
          ...plexItems.flatMap((item) => values(pickPlex(item))),
          ...jellyfinItems.flatMap((item) => values(pickJellyfin(item))),
        ];
        return [...new Set(all)].sort();
      });
  }

  /** Why the page's filters may not select what they describe, and what the page does about it. */
  async function readiness(filters: Filter[], contentType: ContentType) {
    const findings = findingsFor(await cradle.filterReadiness.readFacts(), {
      contentType,
      filters,
    });
    return { findings, mediaPage: filterAnswer(findings).mediaPage };
  }

  /** One page of the titles of `contentType` whose copies match `filters`. */
  async function browse<C extends ContentType>(
    contentType: C,
    filters: Filter[],
    view: BrowseView
  ) {
    const library = await cradle.libraryCache.read();
    const copies = library.copies[contentType] as LibraryCopy<C>[];
    const yearRange = computeYearRange(copies.map((c) => c.record));
    const matched = await mediaQueryEngine.evaluate({
      source: copiesSource(copies),
      contentType,
      clauses: [{ filters, role: 'include' }],
    });
    const matchedKeys = new Set(matched.map((m) => itemKey(m)));
    const entries = copies
      .filter((copy) => matchedKeys.has(itemKey(copy.item)))
      .map((copy) => {
        const { title, sortTitle, year } = copy.record as {
          title: string;
          sortTitle?: string;
          year?: number;
        };
        return { copy, record: copy.record, title, sortTitle, year };
      });
    const sorted = sortMedia(entries, view.sort, (e) =>
      contentType === 'movie'
        ? (e.record as RadarrMovie).hasFile
        : (e.record as SonarrSeries).monitored
    );
    return {
      ...paginateItems(groupByTitle(sorted), { page: view.page, pageSize: view.pageSize }),
      yearRange,
      errors: [] as MediaError[],
      records: recordsFor(library, contentType),
      ...(await readiness(filters, contentType)),
    };
  }

  /**
   * Every cache this instance owns. A cache added here must go in this array, which the
   * handler below clears. What clears them:
   * - `media:changed`: upstream library data changed by Warden (an automation task that
   *   declares `affects: 'media'` and has acted, or a system data job with changes).
   * - `provider:changed`: a provider was created, updated or deleted, so its library joined,
   *   changed or left.
   * - The 60s expiry: changes Warden can't see, such as edits in Radarr's own UI, upstream
   *   background commands finishing, or an upstream service recovering by itself.
   * A failed provider fetch is cached as a partial or empty result (an error entry, or an
   * empty list) until the expiry or a provider edit, so requests during an outage don't each
   * wait on the dead upstream (`media.cache.failuresCached.integration.test.ts`).
   * The Radarr and Sonarr libraries themselves are not here: they are read through
   * `SourceReadCache`, which clears itself on the same events.
   */
  const caches: Array<{ clear(): void }> = [
    tagsCache,
    qualityProfilesCache,
    languageProfilesCache,
    genresCache,
    networksCache,
    studioCache,
    releaseGroupsCache,
    collectionNamesCache,
    fileContainerCache,
    videoCodecCache,
    audioCodecCache,
    fileResolutionCache,
    labelsCache,
    plexItemsCache,
    jellyfinItemsCache,
  ];

  /** Bus listener: catches its own errors, since a throw would re-enter the event's sender. */
  function clearCaches(): void {
    try {
      for (const cache of caches) cache.clear();
    } catch (err) {
      log.error('Clearing the media caches failed', { err });
    }
  }

  for (const event of CLEARED_ON) cradle.eventBus.on(event, clearCaches);

  const procedures = {
    browse: {
      movie: api.media.browse.movie.handler(({ input: { filters = [], ...view } }) =>
        browse('movie', filters, view)
      ),
      series: api.media.browse.series.handler(({ input: { filters = [], ...view } }) =>
        browse('series', filters, view)
      ),
    },

    tags: api.media.tags.handler(() =>
      tagsCache.getOrFetch('tags', async () => {
        const providers = await providerSettingsService.findActiveByTypes([
          MetadataProviderType.RADARR,
          MetadataProviderType.SONARR,
        ]);

        const radarrTags: DecoratedTag[] = [];
        const sonarrTags: DecoratedTag[] = [];

        await Promise.all(
          providers.map(async (provider) => {
            try {
              if (provider.type === MetadataProviderType.RADARR) {
                const radarr = factory.create(provider, log) as RadarrProvider;
                const tags = await radarr.getTags();
                radarrTags.push(
                  ...tags.map((t) => ({
                    ...t,
                    providerId: provider.id,
                    providerName: provider.name,
                  }))
                );
              } else if (provider.type === MetadataProviderType.SONARR) {
                const sonarr = factory.create(provider, log) as SonarrProvider;
                const tags = await sonarr.getTags();
                sonarrTags.push(
                  ...tags.map((t) => ({
                    ...t,
                    providerId: provider.id,
                    providerName: provider.name,
                  }))
                );
              }
            } catch (err) {
              log.warn('Tags fetch failed', { provider: provider.name, err });
            }
          })
        );

        return { radarr: radarrTags, sonarr: sonarrTags };
      })
    ),

    qualityProfiles: api.media.qualityProfiles.handler(() =>
      qualityProfilesCache.getOrFetch('qualityProfiles', async () => {
        const providers = await providerSettingsService.findActiveByTypes([
          MetadataProviderType.RADARR,
          MetadataProviderType.SONARR,
        ]);

        const radarrProfiles: DecoratedProfile[] = [];
        const sonarrProfiles: DecoratedProfile[] = [];

        await Promise.all(
          providers.map(async (provider) => {
            try {
              if (provider.type === MetadataProviderType.RADARR) {
                const radarr = factory.create(provider, log) as RadarrProvider;
                const profiles = await radarr.getProfiles();
                radarrProfiles.push(
                  ...profiles.map((p) => ({
                    ...p,
                    providerId: provider.id,
                    providerName: provider.name,
                  }))
                );
              } else if (provider.type === MetadataProviderType.SONARR) {
                const sonarr = factory.create(provider, log) as SonarrProvider;
                const profiles = await sonarr.getProfiles();
                sonarrProfiles.push(
                  ...profiles.map((p) => ({
                    ...p,
                    providerId: provider.id,
                    providerName: provider.name,
                  }))
                );
              }
            } catch (err) {
              log.warn('Quality profiles fetch failed', { provider: provider.name, err });
            }
          })
        );

        return { radarr: radarrProfiles, sonarr: sonarrProfiles };
      })
    ),

    languageProfiles: api.media.languageProfiles.handler(() =>
      languageProfilesCache.getOrFetch('languageProfiles', async () => {
        const providers = await providerSettingsService.findActiveByTypes([
          MetadataProviderType.SONARR,
        ]);

        const profiles: DecoratedProfile[] = [];

        await Promise.all(
          providers.map(async (provider) => {
            try {
              const sonarr = factory.create(provider, log) as SonarrProvider;
              const languageProfiles = await sonarr.getLanguageProfiles();
              profiles.push(
                ...languageProfiles.map((p) => ({
                  ...p,
                  providerId: provider.id,
                  providerName: provider.name,
                }))
              );
            } catch (err) {
              log.warn('Language profiles fetch failed', { provider: provider.name, err });
            }
          })
        );

        return profiles;
      })
    ),

    genres: api.media.genres.handler(() =>
      genresCache.getOrFetch('genres', async () => {
        const [{ sublists: movieSublists }, { sublists: seriesSublists }] = await Promise.all([
          getMovies(),
          getSeries(),
        ]);
        const movies = movieSublists.flatMap((s) => s.movies);
        const series = seriesSublists.flatMap((s) => s.series);
        return {
          movies: [...new Set(movies.flatMap((m) => m.genres ?? []))].sort(),
          series: [...new Set(series.flatMap((s) => s.genres ?? []))].sort(),
        };
      })
    ),

    networks: api.media.networks.handler(() =>
      networksCache.getOrFetch('networks', async () => {
        const { sublists } = await getSeries();
        const all = sublists.flatMap((s) => s.series);
        return [...new Set(all.map((s) => s.network).filter((n): n is string => !!n))].sort();
      })
    ),

    studio: api.media.studio.handler(
      mediaServerStringLookup(
        studioCache,
        'studio',
        (i) => i.studio,
        (i) => i.Studios?.map((s) => s.Name)
      )
    ),

    releaseGroups: api.media.releaseGroups.handler(() =>
      releaseGroupsCache.getOrFetch('releaseGroups', async () => {
        const { sublists } = await getMovies();
        const all = sublists.flatMap((s) => s.movies);
        return [...new Set(all.flatMap((m) => m.statistics?.releaseGroups ?? []))].sort();
      })
    ),

    collectionNames: api.media.collectionNames.handler(() =>
      collectionNamesCache.getOrFetch('collectionNames', async () => {
        const { sublists } = await getMovies();
        const all = sublists.flatMap((s) => s.movies);
        return [
          ...new Set(all.map((m) => m.collection?.name).filter((n): n is string => !!n)),
        ].sort();
      })
    ),

    fileContainers: api.media.fileContainers.handler(
      mediaServerStringLookup(
        fileContainerCache,
        'fileContainer',
        (i) => i.Media?.[0]?.container,
        (i) => i.MediaSources?.[0]?.Container
      )
    ),

    videoCodecs: api.media.videoCodecs.handler(
      mediaServerStringLookup(
        videoCodecCache,
        'videoCodec',
        (i) => i.Media?.[0]?.videoCodec,
        (i) => i.MediaSources?.[0]?.MediaStreams?.find((s) => s.Type === 'Video')?.Codec
      )
    ),

    audioCodecs: api.media.audioCodecs.handler(
      mediaServerStringLookup(
        audioCodecCache,
        'audioCodec',
        (i) => i.Media?.[0]?.audioCodec,
        (i) => i.MediaSources?.[0]?.MediaStreams?.find((s) => s.Type === 'Audio')?.Codec
      )
    ),

    fileResolutions: api.media.fileResolutions.handler(
      mediaServerStringLookup(
        fileResolutionCache,
        'fileResolution',
        (i) => i.Media?.[0]?.videoResolution,
        (i) =>
          resolutionTier(i.MediaSources?.[0]?.MediaStreams?.find((s) => s.Type === 'Video')?.Height)
      )
    ),

    labels: api.media.labels.handler(
      mediaServerStringLookup(
        labelsCache,
        'labels',
        (i) => i.Label?.map((l) => l.tag),
        (i) => i.Tags
      )
    ),

    sources: api.media.sources.handler(async () => {
      const providers = await providerSettingsService.list();
      return sourceOwnership(providers.filter((p) => p.isActive));
    }),

    reset: api.media.reset.handler(async () => {
      if (!cradle.db) {
        throw new Error('resetMedia requires a database handle');
      }
      const result = await resetMediaData(cradle.db);
      log.warn('Media data reset', { deletedIdentities: result.deletedIdentities });
      return result;
    }),
  };

  /** Unsubscribes this instance's cache clearing from the bus; for instances built per test. */
  function dispose(): void {
    for (const event of CLEARED_ON) cradle.eventBus.off(event, clearCaches);
  }

  return { procedures, dispose };
}
