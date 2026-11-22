import { MetadataProviderType } from '@server/database/schema';
import type { ReportedFacts } from '../facts';
import {
  type ActuatorTask,
  type FactReporter,
  type MediaActuator,
  type ProviderTypeEntry,
  requireParameter,
} from '../roles';
import { BaseProviderConnection } from './baseProviderConnection';
import { defined, playHistoryFacts } from './factMapping';

export interface JellyfinLibrary {
  Name: string;
  ItemId: string;
  CollectionType: string;
}

export interface JellyfinMediaStream {
  Type?: string;
  Codec?: string;
  Width?: number;
  Height?: number;
}

export interface JellyfinMediaSource {
  Container?: string;
  Size?: number;
  MediaStreams?: JellyfinMediaStream[];
}

/** Per-user watch/favorite state — only present when fetched via a user-scoped
 *  endpoint (`Users/{userId}/Items`), which is why `getAllItems` uses that route
 *  rather than the generic `/Items` one. Scoped to the single configured Jellyfin
 *  user per instance (today's one-user-per-instance model). */
export interface JellyfinUserData {
  PlayCount?: number;
  LastPlayedDate?: string;
  Played?: boolean;
  IsFavorite?: boolean;
}

export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  /** External-id map (e.g. Tmdb, Tvdb, Imdb) — present when requested via fields=ProviderIds. */
  ProviderIds?: Record<string, string>;
  /** Genre/certification are collected but not yet wired as enrichment fields — see
   *  the provider spec's implementation status (blocked on precedence-ordering
   *  machinery, same reasoning as Plex's genres/certification gap). */
  Genres?: string[];
  OfficialRating?: string;
  Studios?: { Name: string }[];
  /** 10,000 ticks per millisecond — converted to minutes at the field-provider layer. */
  RunTimeTicks?: number;
  MediaSources?: JellyfinMediaSource[];
  /** Day-granularity release date. */
  PremiereDate?: string;
  /** Added-to-this-library timestamp — distinct from PremiereDate. */
  DateCreated?: string;
  /** Free-text tags — shares the `labels` filter rule with Plex's `Label` tags. */
  Tags?: string[];
  UserData?: JellyfinUserData;
}

interface JellyfinItemsResponse {
  Items: JellyfinItem[];
  TotalRecordCount: number;
}

/**
 * Discrete resolution tier from a video stream's pixel height, matching Plex's `videoResolution`
 * convention ("1080"), since Jellyfin reports raw Width/Height rather than a tier label.
 */
function resolutionTier(height: number | undefined): string | undefined {
  if (height === undefined) return undefined;
  if (height >= 2160) return '2160';
  if (height >= 1080) return '1080';
  if (height >= 720) return '720';
  return 'sd';
}

const TICKS_PER_MINUTE = 10_000 * 60_000;

/**
 * What Jellyfin reports about one item, from its own fields, its user data and its primary file
 * (first MediaSources entry). Without a play count, `Played` counts as one play.
 */
function reportedFactsOf(item: JellyfinItem): Partial<ReportedFacts> {
  const userData = item.UserData;
  const source = item.MediaSources?.[0];
  const streams = source?.MediaStreams ?? [];
  const video = streams.find((s) => s.Type === 'Video');
  const lastPlayed = userData?.LastPlayedDate;
  return {
    ...playHistoryFacts(
      userData?.PlayCount ?? (userData?.Played ? 1 : 0),
      lastPlayed ? Date.parse(lastPlayed) / 1000 : undefined
    ),
    ...defined({
      jellyfinAddedAt: item.DateCreated,
      studio: item.Studios?.[0]?.Name,
      runtimeMinutes:
        item.RunTimeTicks !== undefined
          ? Math.round(item.RunTimeTicks / TICKS_PER_MINUTE)
          : undefined,
      fileSizeBytes: source?.Size,
      releaseDate: item.PremiereDate,
      fileContainer: source?.Container,
      videoCodec: video?.Codec,
      audioCodec: streams.find((s) => s.Type === 'Audio')?.Codec,
      fileResolution: resolutionTier(video?.Height),
      labels: item.Tags && item.Tags.length > 0 ? item.Tags : undefined,
      isFavorite: userData?.IsFavorite,
    }),
  };
}

export class JellyfinProvider
  extends BaseProviderConnection
  implements MediaActuator, FactReporter
{
  /** How this provider type is presented, reached and what it can do. */
  static readonly catalogueEntry = {
    label: 'Jellyfin',
    apiKeyRequired: true,
    hostPlaceholder: 'http://localhost:8096',
    apiPath: '',
    capabilities: {
      mediaServer: 'jellyfinItemId',
      facts: {
        reports: [
          'playCount',
          'lastWatchedAt',
          'jellyfinAddedAt',
          'studio',
          'runtimeMinutes',
          'fileSizeBytes',
          'releaseDate',
          'fileContainer',
          'videoCodec',
          'audioCodec',
          'fileResolution',
          'labels',
          'isFavorite',
        ],
      },
    },
  } as const satisfies ProviderTypeEntry;

  /** One call that needs the key, so a wrong key fails the test. */
  async testConnection(): Promise<void> {
    await this.client.get('System/Info', { headers: this.authHeader }).json();
  }

  public readonly actuatorType = MetadataProviderType.JELLYFIN;

  public tasks(): ActuatorTask[] {
    return [
      {
        id: 'deleteItem',
        label: 'Delete item',
        destructive: true,
        affects: 'media',
        run: async (ids) => this.deleteItems(ids.map(String)),
      },
      {
        id: 'refreshMetadata',
        label: 'Refresh metadata',
        destructive: false,
        affects: 'media',
        run: async (ids) => this.refreshMetadata(ids.map(String)),
      },
      {
        id: 'markPlayed',
        label: 'Mark as played',
        destructive: false,
        affects: 'media',
        run: async (ids) => this.markPlayed(ids.map(String)),
      },
      {
        id: 'markUnplayed',
        label: 'Mark as unplayed',
        destructive: false,
        affects: 'media',
        run: async (ids) => this.markUnplayed(ids.map(String)),
      },
      {
        id: 'addToCollection',
        label: 'Add to collection',
        destructive: false,
        affects: 'media',
        parameter: { type: 'select', label: 'Collection', optionsRoute: 'collections' },
        run: async (ids, parameterValue) =>
          this.addToCollection(
            ids.map(String),
            requireParameter('addToCollection', parameterValue)
          ),
      },
      {
        id: 'removeFromCollection',
        label: 'Remove from collection',
        destructive: false,
        affects: 'media',
        parameter: { type: 'select', label: 'Collection', optionsRoute: 'collections' },
        run: async (ids, parameterValue) =>
          this.removeFromCollection(
            ids.map(String),
            requireParameter('removeFromCollection', parameterValue)
          ),
      },
    ];
  }

  private get authHeader() {
    return { 'X-Emby-Authorization': `MediaBrowser Token="${this.provider.apiKey}"` };
  }

  private get userId(): string {
    const userId = this.provider.settings?.userId;
    return typeof userId === 'string' ? userId : '';
  }

  public async getLibraries(): Promise<JellyfinLibrary[]> {
    return this.client
      .get('Library/VirtualFolders', { headers: this.authHeader })
      .json<JellyfinLibrary[]>();
  }

  public async getLibraryContents(libraryId: string): Promise<JellyfinItem[]> {
    const resp = await this.client
      .get(`Users/${this.userId}/Items`, {
        headers: this.authHeader,
        searchParams: { ParentId: libraryId, Recursive: 'true' },
      })
      .json<JellyfinItemsResponse>();
    return resp.Items;
  }

  /** Every movie and series in the server's libraries, with their external-id maps
   *  and enrichment-relevant fields. User-scoped (`Users/{userId}/Items`, not the
   *  generic `/Items` route) so the response carries per-user `UserData`
   *  (`IsFavorite`/`PlayCount`/`LastPlayedDate`/`Played`) for the configured user. */
  /** The facts Jellyfin reports about every item in its libraries, by item id. */
  async readReportedFacts(): Promise<Map<string, Partial<ReportedFacts>>> {
    const items = await this.getAllItems();
    return new Map(items.map((item) => [item.Id, reportedFactsOf(item)]));
  }

  public async getAllItems(): Promise<JellyfinItem[]> {
    const resp = await this.client
      .get(`Users/${this.userId}/Items`, {
        headers: this.authHeader,
        searchParams: {
          recursive: 'true',
          fields:
            'ProviderIds,Genres,OfficialRating,Studios,RunTimeTicks,MediaSources,PremiereDate,DateCreated,Tags',
          includeItemTypes: 'Movie,Series',
        },
      })
      .json<JellyfinItemsResponse>();
    return resp.Items;
  }

  public async deleteItems(itemIds: string[]): Promise<void> {
    await Promise.all(
      itemIds.map((id) =>
        this.deleteAlreadyGoneIsDone(() =>
          this.client.delete(`Items/${id}`, { headers: this.authHeader })
        )
      )
    );
  }

  public async refreshMetadata(itemIds: string[]): Promise<void> {
    await Promise.all(
      itemIds.map((id) =>
        this.client.post(`Items/${id}/Refresh`, {
          headers: this.authHeader,
          searchParams: { metadataRefreshMode: 'FullRefresh', imageRefreshMode: 'FullRefresh' },
        })
      )
    );
  }

  public async markPlayed(itemIds: string[]): Promise<void> {
    await Promise.all(
      itemIds.map((id) =>
        this.client.post(`UserPlayedItems/${id}`, {
          headers: this.authHeader,
          searchParams: { userId: this.userId },
        })
      )
    );
  }

  public async markUnplayed(itemIds: string[]): Promise<void> {
    await Promise.all(
      itemIds.map((id) =>
        this.client.delete(`UserPlayedItems/${id}`, {
          headers: this.authHeader,
          searchParams: { userId: this.userId },
        })
      )
    );
  }

  public async addToCollection(itemIds: string[], collectionId: string): Promise<void> {
    await this.client.post(`Collections/${collectionId}/Items`, {
      headers: this.authHeader,
      searchParams: { ids: itemIds.join(',') },
    });
  }

  /** Natural counterpart to addToCollection — same external-collection-id shape. */
  public async removeFromCollection(itemIds: string[], collectionId: string): Promise<void> {
    await this.client.delete(`Collections/${collectionId}/Items`, {
      headers: this.authHeader,
      searchParams: { ids: itemIds.join(',') },
    });
  }
}
