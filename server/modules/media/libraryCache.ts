import type { ContentType } from '@contract/schemas';
import {
  enrichmentField,
  mediaEnrichment,
  mediaIdentity,
  mediaItemPayload,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import type { DomainEventBus } from '@server/kernel/eventBus';
import type { RadarrMovie, SonarrSeries } from '@server/modules/providers';
import { and, eq } from 'drizzle-orm';
import type { EnrichmentFields } from './mediaFieldProvider';
import type { MediaItem } from './mediaItem';
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
  /** The copy as the query engine reads it: normalised, carrying its title group and facts. */
  item: MediaItem;
}

/** The in-memory copy of the library, as one load read it from the database. */
export interface Library {
  copies: { [C in ContentType]: LibraryCopy<C>[] };
}

/**
 * The in-memory copy of the library as last refreshed, loaded from the database; it holds nothing
 * the database does not. It is loaded on the first read after a clear, and clears on
 * `media:changed` (a refresh or a media reset changed the copy) and `provider:changed` (a provider
 * joined, changed or left). It has no time-based expiry: the copy changes only when the catalog
 * refresh or the enrichment job writes it.
 */
export class LibraryCache {
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

  private async load(): Promise<Library> {
    const { db } = this.deps;
    const [rows, factRows] = await Promise.all([
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
      db
        .select({
          mediaIdentityId: mediaEnrichment.mediaIdentityId,
          key: enrichmentField.key,
          value: mediaEnrichment.value,
        })
        .from(mediaEnrichment)
        .innerJoin(enrichmentField, eq(enrichmentField.id, mediaEnrichment.fieldId)),
    ]);

    const factsByTitle = new Map<number, Partial<EnrichmentFields>>();
    for (const { mediaIdentityId, key, value } of factRows) {
      const facts = factsByTitle.get(mediaIdentityId) ?? {};
      (facts as Record<string, unknown>)[key] = JSON.parse(value);
      factsByTitle.set(mediaIdentityId, facts);
    }

    const library: Library = { copies: { movie: [], series: [] } };
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
        item,
      };
      (library.copies[row.contentType] as LibraryCopy[]).push(copy);
    }
    return library;
  }
}
