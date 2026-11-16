import type { RefreshRecord } from '@contract/media';
import type { ContentType } from '@contract/schemas';
import {
  mediaIdentity,
  mediaItemPayload,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
import { MetadataProviderType } from '@server/database/schema';
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
  isMediaSourceType,
  readProviderLists,
  readRefreshRecords,
} from '@server/modules/providers';
import { and, eq } from 'drizzle-orm';
import { EnrichmentQueries } from './enrichment/enrichment.queries';
import { resolveFacts } from './enrichmentMerge';
import { type MediaItem, externalIdOf } from './mediaItem';
import type { MediaSource } from './mediaSource';
import { normalizeRadarrMovie, normalizeSonarrSeries } from './normalizeMedia';

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
  /** Those copies, as the query engine evaluates them. */
  source: MediaSource;
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

/** The kinds of data each active provider type refreshes into the copy. */
const REFRESHED_KINDS: Partial<Record<MetadataProviderType, RefreshKind[]>> = {
  [MetadataProviderType.RADARR]: ['catalog', 'lists'],
  [MetadataProviderType.SONARR]: ['catalog', 'lists'],
  [MetadataProviderType.PLEX]: ['links', 'facts'],
  [MetadataProviderType.JELLYFIN]: ['links', 'facts'],
  [MetadataProviderType.TAUTULLI]: ['facts'],
  [MetadataProviderType.SEERR]: ['facts'],
  [MetadataProviderType.TMDB]: ['facts'],
};

/**
 * The refresh records a view of `contentType` answers from: the catalog and lists of each active
 * instance owning it, and the links and facts of every active media server and enricher. A kind
 * never refreshed has a record with neither time, so it reads as not refreshed yet.
 */
export function recordsFor(library: Library, contentType: ContentType): RefreshRecord[] {
  const owner = SOURCE_OWNER[contentType];
  return library.providers.flatMap((provider) => {
    if (isMediaSourceType(provider.type) && provider.type !== owner) return [];
    return (REFRESHED_KINDS[provider.type] ?? []).map((kind) => {
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

  /** One content type's copies, their source and their refresh records, from the loaded copy. */
  async contentOf<C extends ContentType>(contentType: C): Promise<LibraryContent<C>> {
    const library = await this.read();
    const copies = library.copies[contentType] as LibraryCopy<C>[];
    return {
      library,
      copies,
      source: copiesSource(copies),
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

/** A source over library copies already loaded: the query engine reads their items. */
export function copiesSource(copies: LibraryCopy[]): MediaSource {
  return {
    getMediaItems: async () => copies.map((c) => c.item),
    idOf: externalIdOf,
  };
}
