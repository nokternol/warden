import type { ContentType } from '@contract/schemas';
import type { MetadataProviderType } from '@server/database/schema';
import { api } from '@server/kernel/api';
import type { DrizzleDb } from '@server/kernel/db';
import type { DomainEventBus } from '@server/kernel/eventBus';
import { getChildLogger } from '@server/kernel/logger';
import {
  type ProviderListsData,
  type ProviderSettingsService,
  type RadarrMovie,
  SOURCE_OWNER,
  type SonarrSeries,
} from '@server/modules/providers';
import { type FilterReadiness, filterAnswer, findingsFor } from './filterReadiness';
import type { CopyRecord, Library, LibraryCache, LibraryCopy } from './libraryCache';
import { paginateItems } from './media.pagination';
import { sortMedia } from './media.sort';
import type { EnrichmentFields } from './mediaFieldProvider';
import type { MediaQueryEngine, SelectedTitle } from './mediaQueryEngine';
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
  libraryCache: Pick<LibraryCache, 'read' | 'contentOf'>;
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
 * The selected titles as browse rows in `sort` order. Each title is placed and shown by its first
 * copy, in that order, that alone meets the filters, or its first copy in that order when none
 * does; its copy count is every copy.
 */
function titleRows<C extends ContentType>(
  selected: SelectedTitle[],
  sort: string,
  contentType: C
): Array<CopyRecord[C] & { sourceCount: number; sourceProviderIds: number[] }> {
  const representable = selected.flatMap((title) =>
    (title.met.length > 0 ? title.met : title.copies).map((copy) => {
      const {
        title: name,
        sortTitle,
        year,
      } = copy.record as {
        title: string;
        sortTitle?: string;
        year?: number;
      };
      return { selected: title, copy, title: name, sortTitle, year };
    })
  );
  const sorted = sortMedia(representable, sort, ({ copy }) =>
    contentType === 'movie'
      ? (copy.record as RadarrMovie).hasFile
      : (copy.record as SonarrSeries).monitored
  );
  const shown = new Set<SelectedTitle>();
  return sorted.flatMap(({ selected: title, copy }) => {
    if (shown.has(title)) return [];
    shown.add(title);
    return [
      {
        ...(copy.record as CopyRecord[C]),
        sourceCount: title.copies.length,
        sourceProviderIds: title.copies.map((c) => c.providerId),
      },
    ];
  });
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

  /** One page of the titles of `contentType` that `filters` select. */
  async function browse<C extends ContentType>(
    contentType: C,
    filters: Filter[],
    view: BrowseView
  ) {
    const { copies, records } = await cradle.libraryCache.contentOf(contentType);
    const yearRange = computeYearRange(copies.map((c) => c.record));
    const selected = mediaQueryEngine.select(copies, {
      contentType,
      include: [filters],
      exclude: [],
    });
    const rows = titleRows<C>(selected, view.sort, contentType);
    return {
      ...paginateItems(rows, { page: view.page, pageSize: view.pageSize }),
      yearRange,
      records,
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
        radarr: listOf(library, SOURCE_OWNER.movie, 'tags'),
        sonarr: listOf(library, SOURCE_OWNER.series, 'tags'),
      }))
    ),

    qualityProfiles: api.media.qualityProfiles.handler(
      fromLibrary((library) => ({
        radarr: listOf(library, SOURCE_OWNER.movie, 'qualityProfiles'),
        sonarr: listOf(library, SOURCE_OWNER.series, 'qualityProfiles'),
      }))
    ),

    languageProfiles: api.media.languageProfiles.handler(
      fromLibrary((library) => listOf(library, SOURCE_OWNER.series, 'languageProfiles'))
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
