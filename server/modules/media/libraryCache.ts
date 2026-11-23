import type { RefreshRecord } from '@contract/media';
import type { ContentType } from '@contract/schemas';
import {
  mediaIdentity,
  mediaItemPayload,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
import type { MetadataProviderType } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import type { DomainEventBus } from '@server/kernel/eventBus';
import {
  type ProviderListsData,
  type ProviderListsReader,
  type RadarrMovie,
  type RefreshKind,
  SOURCE_OWNER,
  type SonarrSeries,
  type StoredRefreshRecord,
  isMediaServerType,
  isMediaSourceType,
  mediaServerOfColumn,
  readProviderLists,
  readRefreshRecords,
  reportsFacts,
  titleIdColumnOf,
} from '@server/modules/providers';
import { and, eq } from 'drizzle-orm';
import { EnrichmentQueries } from './enrichment/enrichment.queries';
import { resolveFacts } from './enrichmentMerge';
import type { MediaItem } from './mediaItem';
import { normalizeRadarrMovie, normalizeSonarrSeries } from './normalizeMedia';
import { type MediaRule, suppliersOf } from './ruleRegistry';

/** The provider's own record of a copy, by the content type its provider owns. */
export interface CopyRecord {
  movie: RadarrMovie;
  series: SonarrSeries;
}

/** One copy of a title held by one active Radarr or Sonarr instance, as last refreshed. */
export interface LibraryCopy<C extends ContentType = ContentType> {
  mediaItemId: number;
  mediaIdentityId: number;
  providerId: number;
  record: CopyRecord[C];
  /** The title's ids in the media servers, as the catalog refresh linked them. */
  links: { plexRatingKey: string | null; jellyfinItemId: string | null };
  /** The copy as the query engine reads it: normalised, carrying its title group and facts. */
  item: MediaItem;
}

/** One content type's part of the loaded copy, as a feature evaluates and describes it. */
export interface LibraryContent<C extends ContentType = ContentType> {
  /** The whole loaded copy, for what spans content types (providers, refresh records). */
  library: Library;
  /** Every active instance's copies of the content type. */
  copies: LibraryCopy<C>[];
  /** The refresh records a view of the content type answers from. */
  records: RefreshRecord[];
}

/** The in-memory copy of the library, as one load read it from the database. */
export interface Library {
  copies: { [C in ContentType]: LibraryCopy<C>[] };
  /** Every active provider. */
  providers: Array<{ id: number; name: string; type: MetadataProviderType }>;
  /** Every stored refresh record. */
  records: StoredRefreshRecord[];
  /** Each active provider's stored setup lists, by provider id. */
  lists: Map<number, ProviderListsData>;
}

/**
 * The kinds of data a provider type refreshes into the copy, as it declares: a source refreshes
 * its catalog and setup lists, a media server the links into it, and a fact reporter its facts.
 */
function refreshedKinds(type: MetadataProviderType): RefreshKind[] {
  return [
    ...(isMediaSourceType(type) ? (['catalog', 'lists'] as const) : []),
    ...(isMediaServerType(type) ? (['links'] as const) : []),
    ...(reportsFacts(type) ? (['facts'] as const) : []),
  ];
}

/**
 * Whether one active reporter of a fact can be relied on: `unrefreshed` names the refresh it cannot
 * be relied on for (its own `facts`, or the `links` of the media server its answers are matched
 * through), or is null when it can.
 */
export interface ReporterReliability {
  providerId: number;
  unrefreshed: { providerId: number; kind: 'facts' | 'links' } | null;
}

/** Whether a provider's latest refresh of `kind` succeeded. */
function refreshedOk(
  records: readonly StoredRefreshRecord[],
  providerId: number,
  kind: RefreshKind
): boolean {
  const record = records.find((r) => r.providerId === providerId && r.kind === kind);
  return record?.refreshedAt != null && record.failedAt == null;
}

/**
 * The one answer to "can this reporter of a fact be relied on", for each active reporter of what a
 * reported-fact `rule` reads (`suppliersOf`), from the loaded copy. A reporter cannot be relied on
 * while its latest `facts` refresh failed or never ran, or, for one matched through a media server's
 * links (its `titleIdColumnOf` column), while every active instance of that media server has
 * unrefreshed `links`; a reporter whose media server is not active, or that is matched by TMDB id,
 * needs no links. A destructive run's gate and filter readiness both judge facts by it, so they give
 * one answer (north-star beliefs 7 and 8).
 */
export function reporterReliability(
  library: Pick<Library, 'providers' | 'records'>,
  rule: MediaRule,
  contentType: ContentType
): ReporterReliability[] {
  const { providers, records } = library;
  return suppliersOf(rule, contentType).flatMap((type) =>
    providers
      .filter((p) => p.type === type)
      .map(({ id }) => {
        if (!refreshedOk(records, id, 'facts')) {
          return { providerId: id, unrefreshed: { providerId: id, kind: 'facts' as const } };
        }
        const serverType = mediaServerOfColumn(titleIdColumnOf(type));
        const servers = serverType ? providers.filter((p) => p.type === serverType) : [];
        const linked =
          servers.length === 0 || servers.some((p) => refreshedOk(records, p.id, 'links'));
        return {
          providerId: id,
          unrefreshed: linked ? null : { providerId: servers[0].id, kind: 'links' as const },
        };
      })
  );
}

/**
 * The refresh records a view of `contentType` answers from: the catalog and lists of each active
 * instance owning it, and the links and facts of every active media server and fact reporter. A kind
 * never refreshed has a record with neither time, so it reads as not refreshed yet.
 */
export function recordsFor(library: Library, contentType: ContentType): RefreshRecord[] {
  const owner = SOURCE_OWNER[contentType];
  return library.providers.flatMap((provider) => {
    if (isMediaSourceType(provider.type) && provider.type !== owner) return [];
    return refreshedKinds(provider.type).map((kind) => {
      const stored = library.records.find((r) => r.providerId === provider.id && r.kind === kind);
      return {
        providerId: provider.id,
        provider: provider.name,
        kind,
        refreshedAt: stored?.refreshedAt ?? null,
        failedAt: stored?.failedAt ?? null,
        error: stored?.error ?? null,
      };
    });
  });
}

/**
 * The in-memory copy of the library as last refreshed, loaded from the database; it holds nothing
 * the database does not. It is loaded on the first read after a clear, and clears on
 * `media:changed` (a refresh or a media reset changed the copy) and `provider:changed` (a provider
 * joined, changed or left). It has no time-based expiry: the copy changes only when the catalog
 * refresh or the enrichment job writes it.
 */
export class LibraryCache implements ProviderListsReader {
  private loading: Promise<Library> | null = null;

  constructor(private readonly deps: { db: DrizzleDb; eventBus: DomainEventBus }) {
    deps.eventBus.on('media:changed', () => this.clear());
    deps.eventBus.on('provider:changed', () => this.clear());
  }

  /** Drops the loaded copy, so the next read loads it again. */
  clear(): void {
    this.loading = null;
  }

  /** The library as the database holds it now, loaded once and shared until the next clear. */
  read(): Promise<Library> {
    if (!this.loading) {
      const loading = this.load();
      this.loading = loading;
      // A failed load is not kept, so the next read tries again.
      loading.catch(() => {
        if (this.loading === loading) this.loading = null;
      });
    }
    return this.loading;
  }

  /** One content type's copies and their refresh records, from the loaded copy. */
  async contentOf<C extends ContentType>(contentType: C): Promise<LibraryContent<C>> {
    const library = await this.read();
    const copies = library.copies[contentType] as LibraryCopy<C>[];
    return {
      library,
      copies,
      records: recordsFor(library, contentType),
    };
  }

  /** One provider's stored lists, as the loaded copy holds them. */
  async listsOf(providerId: number): Promise<ProviderListsData | undefined> {
    return (await this.read()).lists.get(providerId);
  }

  private async load(): Promise<Library> {
    const { db } = this.deps;
    const [rows, factRows, providers, records, lists] = await Promise.all([
      db
        .select({
          mediaItemId: mediaItems.id,
          mediaIdentityId: mediaItems.mediaIdentityId,
          providerId: mediaItems.providerId,
          contentType: mediaIdentity.contentType,
          plexRatingKey: mediaIdentity.plexRatingKey,
          jellyfinItemId: mediaIdentity.jellyfinItemId,
          data: mediaItemPayload.data,
        })
        .from(mediaItems)
        .innerJoin(mediaItemPayload, eq(mediaItemPayload.mediaItemId, mediaItems.id))
        .innerJoin(mediaIdentity, eq(mediaIdentity.id, mediaItems.mediaIdentityId))
        .innerJoin(metadataProviders, eq(metadataProviders.id, mediaItems.providerId))
        .where(and(eq(mediaItems.deleted, false), eq(metadataProviders.isActive, true)))
        .orderBy(mediaItems.id),
      new EnrichmentQueries({ db }).allFacts(),
      db
        .select({
          id: metadataProviders.id,
          name: metadataProviders.name,
          type: metadataProviders.type,
        })
        .from(metadataProviders)
        .where(eq(metadataProviders.isActive, true))
        .orderBy(metadataProviders.id),
      readRefreshRecords(db),
      readProviderLists(db),
    ]);

    const factsByTitle = resolveFacts(
      factRows,
      new Map(providers.map((p) => [p.id, p.type as MetadataProviderType]))
    );

    const library: Library = {
      copies: { movie: [], series: [] },
      providers: providers.map((p) => ({ ...p, type: p.type as MetadataProviderType })),
      records,
      lists,
    };
    for (const row of rows) {
      const record = JSON.parse(row.data);
      const item =
        row.contentType === 'movie'
          ? normalizeRadarrMovie(record, row.providerId)
          : normalizeSonarrSeries(record, row.providerId);
      item._sourceIds.identity = row.mediaIdentityId;
      if (row.plexRatingKey !== null) item._sourceIds.plex = row.plexRatingKey;
      if (row.jellyfinItemId !== null) item._sourceIds.jellyfin = row.jellyfinItemId;
      Object.assign(item, factsByTitle.get(row.mediaIdentityId));
      const copy = {
        mediaItemId: row.mediaItemId,
        mediaIdentityId: row.mediaIdentityId,
        providerId: row.providerId,
        record,
        links: { plexRatingKey: row.plexRatingKey, jellyfinItemId: row.jellyfinItemId },
        item,
      };
      (library.copies[row.contentType] as LibraryCopy[]).push(copy);
    }
    return library;
  }
}
