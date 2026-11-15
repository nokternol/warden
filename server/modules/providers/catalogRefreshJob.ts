import { and, eq, isNotNull, isNull, ne, notInArray, or } from 'drizzle-orm';
import { yieldToEventLoop } from '../../kernel/yieldToEventLoop';

const defaultDelay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
import type { ContentType } from '@contract/schemas';
import { mediaIdentity, mediaItemPayload, mediaItems } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import type { RadarrProvider } from './connections/radarrProvider';
import type { SonarrProvider } from './connections/sonarrProvider';
import { resolveGroup } from './groupResolver';
import { type ProviderListsData, storeProviderLists } from './providerLists';
import { failureMessage, recordRefreshFailed, recordRefreshed } from './providerRefresh';

interface PlexBridgeProvider {
  getAllItems(): Promise<Array<{ ratingKey: string; type?: string; Guid?: { id: string }[] }>>;
}

interface JellyfinBridgeProvider {
  getAllItems(): Promise<
    Array<{ Id: string; Type?: string; ProviderIds?: Record<string, string> }>
  >;
}

interface TVMazeLookupProvider {
  lookupByTvdbId(tvdbId: number): Promise<{ id: number } | null>;
}

const PLEX_CONTENT_TYPE: Record<string, ContentType> = { movie: 'movie', show: 'series' };
const JELLYFIN_CONTENT_TYPE: Record<string, ContentType> = { Movie: 'movie', Series: 'series' };

interface Deps {
  db: DrizzleDb;
  /** One entry per active Radarr instance. Never collapsed to one. */
  movieSources?: Array<{
    providerId: number;
    name: string;
    provider: Pick<RadarrProvider, 'getMovies'>;
  }>;
  /** One entry per active Sonarr instance. Never collapsed to one. */
  seriesSources?: Array<{
    providerId: number;
    name: string;
    provider: Pick<SonarrProvider, 'getSeries'>;
  }>;
  /** The active Plex server whose items titles link to. */
  plexSource?: { providerId: number; name: string; provider: PlexBridgeProvider };
  /** The active Jellyfin server whose items titles link to. */
  jellyfinSource?: { providerId: number; name: string; provider: JellyfinBridgeProvider };
  tvMazeLookup?: TVMazeLookupProvider;
  delay?: (ms: number) => Promise<void>;
  /** One entry per active Radarr or Sonarr instance whose setup lists are kept. */
  listSources?: Array<{ providerId: number; name: string; provider: ListsProvider }>;
}

/** The setup lists a Radarr or Sonarr instance answers; Sonarr also has language profiles. */
interface ListsProvider {
  getTags(): Promise<Array<{ id: number; label: string }>>;
  getProfiles(): Promise<Array<{ id: number; name: string }>>;
  getRootFolders(): Promise<Array<{ id: number; path: string }>>;
  getLanguageProfiles?(): Promise<Array<{ id: number; name: string }>>;
}

export class CatalogRefreshJob {
  private readonly failed: string[] = [];

  constructor(private deps: Deps) {}

  /** The providers this run could not refresh, by name, in the order they failed. */
  failedProviders(): string[] {
    return [...this.failed];
  }

  /**
   * Reads one provider for one kind of its data. A failed read is recorded and named among this
   * run's failures, and answers undefined so the caller keeps what it held; a successful read is
   * recorded once the caller has stored it.
   */
  private async readProvider<T>(
    source: { providerId: number; name: string },
    kind: 'catalog' | 'links',
    read: () => Promise<T>
  ): Promise<T | undefined> {
    try {
      return await read();
    } catch (err) {
      this.failed.push(source.name);
      await recordRefreshFailed(this.deps.db, source.providerId, kind, failureMessage(err));
      return undefined;
    }
  }

  async runForPlex(): Promise<number> {
    const source = this.deps.plexSource;
    if (!source) return 0;
    const items = await this.readProvider(source, 'links', () => source.provider.getAllItems());
    if (!items) return 0;
    let changed = 0;
    for (const item of items) {
      await yieldToEventLoop();
      const contentType = item.type ? PLEX_CONTENT_TYPE[item.type] : undefined;
      for (const guid of item.Guid ?? []) {
        const tmdbMatch = guid.id.match(/^tmdb:\/\/(\d+)$/);
        const tvdbMatch = guid.id.match(/^tvdb:\/\/(\d+)$/);
        if (tmdbMatch) {
          changed += await this.stampIdentity(
            { plexRatingKey: item.ratingKey },
            mediaIdentity.tmdbId,
            Number.parseInt(tmdbMatch[1], 10),
            contentType
          );
        } else if (tvdbMatch) {
          changed += await this.stampIdentity(
            { plexRatingKey: item.ratingKey },
            mediaIdentity.tvdbId,
            Number.parseInt(tvdbMatch[1], 10),
            contentType
          );
        }
      }
    }
    await this.clearLinksNotListed(
      'plexRatingKey',
      items.map((item) => item.ratingKey)
    );
    await recordRefreshed(this.deps.db, source.providerId, 'links');
    return changed;
  }

  /**
   * Clears a media server's id from every title whose item that server no longer lists: a
   * successful answer is the server's truth, so an id it does not list addresses nothing.
   */
  private async clearLinksNotListed(
    field: 'plexRatingKey' | 'jellyfinItemId',
    listed: string[]
  ): Promise<void> {
    const column = mediaIdentity[field];
    await this.deps.db
      .update(mediaIdentity)
      .set({ [field]: null })
      .where(and(isNotNull(column), notInArray(column, listed)));
  }

  /**
   * Stamp an actuator-addressing id (`plexRatingKey` / `jellyfinItemId`) onto identities
   * matching `column = id`, scoped by `contentType` when known (an unscoped match could otherwise
   * cross the movie/tv id namespaces — a TMDB movie id and a TMDB tv id with the same
   * number are different titles). Only rows whose id is new or different are written. Returns rows
   * actually changed.
   */
  private async stampIdentity(
    set: { plexRatingKey: string } | { jellyfinItemId: string },
    column: typeof mediaIdentity.tmdbId | typeof mediaIdentity.tvdbId,
    id: number,
    contentType: ContentType | undefined
  ): Promise<number> {
    const [target, value] =
      'plexRatingKey' in set
        ? [mediaIdentity.plexRatingKey, set.plexRatingKey]
        : [mediaIdentity.jellyfinItemId, set.jellyfinItemId];
    const result = await this.deps.db
      .update(mediaIdentity)
      .set(set)
      .where(
        and(
          eq(column, id),
          contentType ? eq(mediaIdentity.contentType, contentType) : undefined,
          or(isNull(target), ne(target, value))
        )
      );
    return result.rowsAffected;
  }

  async runForJellyfin(): Promise<number> {
    const source = this.deps.jellyfinSource;
    if (!source) return 0;
    const items = await this.readProvider(source, 'links', () => source.provider.getAllItems());
    if (!items) return 0;
    let changed = 0;
    for (const item of items) {
      await yieldToEventLoop();
      const contentType = item.Type ? JELLYFIN_CONTENT_TYPE[item.Type] : undefined;
      const tmdbId = Number.parseInt(item.ProviderIds?.Tmdb ?? '', 10);
      const tvdbId = Number.parseInt(item.ProviderIds?.Tvdb ?? '', 10);
      if (!Number.isNaN(tmdbId)) {
        changed += await this.stampIdentity(
          { jellyfinItemId: item.Id },
          mediaIdentity.tmdbId,
          tmdbId,
          contentType
        );
      } else if (!Number.isNaN(tvdbId)) {
        changed += await this.stampIdentity(
          { jellyfinItemId: item.Id },
          mediaIdentity.tvdbId,
          tvdbId,
          contentType
        );
      }
    }
    await this.clearLinksNotListed(
      'jellyfinItemId',
      items.map((item) => item.Id)
    );
    await recordRefreshed(this.deps.db, source.providerId, 'links');
    return changed;
  }

  /**
   * Stores each instance's setup lists. Each part is read on its own: a part that fails keeps its
   * last successful value and fails the instance's `lists` record, and the other parts update.
   */
  async runForLists(): Promise<number> {
    const sources = this.deps.listSources ?? [];
    for (const { providerId, name, provider } of sources) {
      const named = (rows: Array<{ id: number; name: string }>) =>
        rows.map(({ id, name }) => ({ id, name }));
      const reads: Array<[keyof ProviderListsData, (() => Promise<unknown>) | undefined]> = [
        ['tags', async () => (await provider.getTags()).map(({ id, label }) => ({ id, label }))],
        ['qualityProfiles', async () => named(await provider.getProfiles())],
        [
          'rootFolders',
          async () => (await provider.getRootFolders()).map(({ id, path }) => ({ id, path })),
        ],
        [
          'languageProfiles',
          provider.getLanguageProfiles &&
            (async () => named((await provider.getLanguageProfiles?.()) ?? [])),
        ],
      ];
      const parts: Record<string, unknown> = {};
      const errors: string[] = [];
      for (const [part, read] of reads) {
        if (!read) continue;
        try {
          parts[part] = await read();
        } catch (err) {
          errors.push(failureMessage(err));
        }
      }
      await storeProviderLists(this.deps.db, providerId, parts as ProviderListsData);
      if (errors.length > 0) {
        this.failed.push(name);
        await recordRefreshFailed(this.deps.db, providerId, 'lists', errors.join('; '));
      } else {
        await recordRefreshed(this.deps.db, providerId, 'lists');
      }
    }
    return sources.length;
  }

  async runForSeries(): Promise<number> {
    const sources = this.deps.seriesSources ?? [];
    if (sources.length === 0) return 0;

    let total = 0;
    let firstTVMazeCall = true;
    for (const source of sources) {
      const { providerId, provider } = source;
      const series = await this.readProvider(source, 'catalog', () => provider.getSeries());
      if (!series) continue;
      const now = Math.floor(Date.now() / 1000);
      const fetchedExternalIds: number[] = [];
      for (const s of series) {
        await yieldToEventLoop();
        const identityId = await resolveGroup(this.deps.db, 'series', {
          tvdbId: s.tvdbId,
          tmdbId: s.tmdbId,
          imdbId: s.imdbId,
          tvMazeId: s.tvMazeId,
          title: s.title,
          year: s.year,
        });
        await this.upsertMediaItem(providerId, s.id, identityId, now, s);
        fetchedExternalIds.push(s.id);

        if (!s.tvMazeId && this.deps.tvMazeLookup && s.tvdbId) {
          if (!firstTVMazeCall) {
            await (this.deps.delay ?? defaultDelay)(500);
          }
          firstTVMazeCall = false;
          const result = await this.deps.tvMazeLookup.lookupByTvdbId(s.tvdbId);
          if (result) {
            await this.deps.db
              .update(mediaIdentity)
              .set({ tvMazeId: result.id })
              .where(and(eq(mediaIdentity.id, identityId), isNull(mediaIdentity.tvMazeId)));
          }
        }
      }
      await this.markItemsLeftSource(providerId, fetchedExternalIds);
      await recordRefreshed(this.deps.db, providerId, 'catalog');
      total += series.length;
    }

    await this.sweepOrphanGroups();
    return total;
  }

  async runForMovies(): Promise<number> {
    const sources = this.deps.movieSources ?? [];
    if (sources.length === 0) return 0;

    let total = 0;
    for (const source of sources) {
      const { providerId, provider } = source;
      const movies = await this.readProvider(source, 'catalog', () => provider.getMovies());
      if (!movies) continue;
      const now = Math.floor(Date.now() / 1000);
      const fetchedExternalIds: number[] = [];
      for (const movie of movies) {
        await yieldToEventLoop();
        const identityId = await resolveGroup(this.deps.db, 'movie', {
          tmdbId: movie.tmdbId,
          imdbId: movie.imdbId,
          title: movie.title,
          year: movie.year,
        });
        await this.upsertMediaItem(providerId, movie.id, identityId, now, movie);
        fetchedExternalIds.push(movie.id);
      }
      await this.markItemsLeftSource(providerId, fetchedExternalIds);
      await recordRefreshed(this.deps.db, providerId, 'catalog');
      total += movies.length;
    }

    await this.sweepOrphanGroups();
    return total;
  }

  /**
   * Upsert a `media_item` row for one instance's copy, keyed `(providerId, externalId)`, and store
   * the provider's record of it as the copy's payload. The instance lists the item, so any deleted
   * mark from an earlier absence clears.
   */
  private async upsertMediaItem(
    providerId: number,
    externalId: number,
    mediaIdentityId: number,
    resolvedAt: number,
    record: unknown
  ): Promise<void> {
    const [{ id }] = await this.deps.db
      .insert(mediaItems)
      .values({ providerId, externalId, mediaIdentityId, resolvedAt })
      .onConflictDoUpdate({
        target: [mediaItems.providerId, mediaItems.externalId],
        set: { mediaIdentityId, resolvedAt, deleted: false },
      })
      .returning({ id: mediaItems.id });
    const data = JSON.stringify(record);
    await this.deps.db
      .insert(mediaItemPayload)
      .values({ mediaItemId: id, data })
      .onConflictDoUpdate({ target: mediaItemPayload.mediaItemId, set: { data } });
  }

  /**
   * Soft-deletes this instance's `media_item` rows whose externalId is no longer in its fetched
   * set; a successful empty answer removes them all, since Warden believes what a provider answers.
   * The row stays so run history still resolves its title.
   */
  private async markItemsLeftSource(
    providerId: number,
    fetchedExternalIds: number[]
  ): Promise<void> {
    await this.deps.db
      .update(mediaItems)
      .set({ deleted: true })
      .where(
        and(
          eq(mediaItems.providerId, providerId),
          notInArray(mediaItems.externalId, fetchedExternalIds)
        )
      );
  }

  /**
   * Delete groups left with zero `media_item` rows — enrichment cascades. A
   * deleted copy still holds its group, so a removed title keeps its name in
   * run history; a group empties only when its copies' provider is deleted.
   */
  private async sweepOrphanGroups(): Promise<void> {
    const remaining = await this.deps.db
      .selectDistinct({ id: mediaItems.mediaIdentityId })
      .from(mediaItems);
    const remainingIds = remaining.map((r) => r.id);
    await this.deps.db
      .delete(mediaIdentity)
      .where(remainingIds.length > 0 ? notInArray(mediaIdentity.id, remainingIds) : undefined);
  }
}
