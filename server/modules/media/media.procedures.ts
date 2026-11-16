import type { ContentType } from '@contract/schemas';
import { MetadataProviderType } from '@server/database/schema';
import { api } from '@server/kernel/api';
import type { DrizzleDb } from '@server/kernel/db';
import type { DomainEventBus } from '@server/kernel/eventBus';
import { getChildLogger } from '@server/kernel/logger';
import type {
  ProviderListsData,
  ProviderSettingsService,
  RadarrMovie,
  SonarrSeries,
} from '@server/modules/providers';
import { type FilterReadiness, filterAnswer, findingsFor } from './filterReadiness';
import {
  type Library,
  type LibraryCache,
  type LibraryCopy,
  copiesSource,
  recordsFor,
} from './libraryCache';
import { paginateItems } from './media.pagination';
import { sortMedia } from './media.sort';
import type { EnrichmentFields } from './mediaFieldProvider';
import { itemKey } from './mediaItem';
import type { MediaQueryEngine } from './mediaQueryEngine';
import { resetMediaData } from './mediaReset';
import { sourceOwnership } from './mediaSourceFactory';
import type { Filter } from './ruleRegistry';

const log = getChildLogger('MediaProcedures');

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

/** A provider-owned list entry, tagged with the instance it came from. */
type FromInstance<T> = T & { providerId: number; providerName: string };

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

/** Every distinct value of `field` the copy's titles hold, sorted; array facts contribute each item. */
function valuesOf(library: Library, pick: (item: LibraryCopy['item']) => unknown): string[] {
  const values = new Set<string>();
  for (const copy of [...library.copies.movie, ...library.copies.series]) {
    const value = pick(copy.item);
    for (const v of Array.isArray(value) ? value : [value]) {
      if (typeof v === 'string' && v !== '') values.add(v);
    }
  }
  return [...values].sort();
}

/** A fact's distinct values across the copy, for a filter's choices. */
function factValues(field: keyof EnrichmentFields) {
  return (library: Library) =>
    valuesOf(library, (item) => (item as Partial<EnrichmentFields>)[field]);
}

/** One stored list of each active instance of `type`, each entry tagged with its instance. */
function listOf<K extends keyof ProviderListsData>(
  library: Library,
  type: MetadataProviderType,
  part: K
): FromInstance<NonNullable<ProviderListsData[K]>[number]>[] {
  return library.providers
    .filter((p) => p.type === type)
    .flatMap((p) =>
      (library.lists.get(p.id)?.[part] ?? []).map((entry) => ({
        ...entry,
        providerId: p.id,
        providerName: p.name,
      }))
    );
}

export function createMediaProcedures(cradle: MediaCradle) {
  const { providerSettingsService, mediaQueryEngine } = cradle;

  /** A procedure answering from the library copy as the cache holds it now. */
  function fromLibrary<T>(answer: (library: Library) => T) {
    return async () => answer(await cradle.libraryCache.read());
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
      records: recordsFor(library, contentType),
      ...(await readiness(filters, contentType)),
    };
  }

  const movieRecords = (library: Library) => library.copies.movie.map((c) => c.record);
  const seriesRecords = (library: Library) => library.copies.series.map((c) => c.record);
  const distinct = (values: Array<string | undefined | null>) =>
    [...new Set(values.filter((v): v is string => !!v))].sort();

  const procedures = {
    browse: {
      movie: api.media.browse.movie.handler(({ input: { filters = [], ...view } }) =>
        browse('movie', filters, view)
      ),
      series: api.media.browse.series.handler(({ input: { filters = [], ...view } }) =>
        browse('series', filters, view)
      ),
    },

    tags: api.media.tags.handler(
      fromLibrary((library) => ({
        radarr: listOf(library, MetadataProviderType.RADARR, 'tags'),
        sonarr: listOf(library, MetadataProviderType.SONARR, 'tags'),
      }))
    ),

    qualityProfiles: api.media.qualityProfiles.handler(
      fromLibrary((library) => ({
        radarr: listOf(library, MetadataProviderType.RADARR, 'qualityProfiles'),
        sonarr: listOf(library, MetadataProviderType.SONARR, 'qualityProfiles'),
      }))
    ),

    languageProfiles: api.media.languageProfiles.handler(
      fromLibrary((library) => listOf(library, MetadataProviderType.SONARR, 'languageProfiles'))
    ),

    genres: api.media.genres.handler(
      fromLibrary((library) => ({
        movies: distinct(movieRecords(library).flatMap((m: RadarrMovie) => m.genres ?? [])),
        series: distinct(seriesRecords(library).flatMap((s: SonarrSeries) => s.genres ?? [])),
      }))
    ),

    networks: api.media.networks.handler(
      fromLibrary((library) => distinct(seriesRecords(library).map((s) => s.network)))
    ),

    studio: api.media.studio.handler(fromLibrary(factValues('studio'))),

    releaseGroups: api.media.releaseGroups.handler(
      fromLibrary((library) =>
        distinct(movieRecords(library).flatMap((m) => m.statistics?.releaseGroups ?? []))
      )
    ),

    collectionNames: api.media.collectionNames.handler(
      fromLibrary((library) => distinct(movieRecords(library).map((m) => m.collection?.name)))
    ),

    fileContainers: api.media.fileContainers.handler(fromLibrary(factValues('fileContainer'))),
    videoCodecs: api.media.videoCodecs.handler(fromLibrary(factValues('videoCodec'))),
    audioCodecs: api.media.audioCodecs.handler(fromLibrary(factValues('audioCodec'))),
    fileResolutions: api.media.fileResolutions.handler(fromLibrary(factValues('fileResolution'))),
    labels: api.media.labels.handler(fromLibrary(factValues('labels'))),

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
      cradle.eventBus.emit('media:changed', {});
      return result;
    }),
  };

  return { procedures };
}
