import { MetadataProviderType } from '@server/database/schema';
import {
  type ActuatorTask,
  type MediaActuator,
  type ProviderTypeEntry,
  requireParameter,
} from '../roles';
import { BaseProviderConnection } from './baseProviderConnection';

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

export class JellyfinProvider extends BaseProviderConnection implements MediaActuator {
  /** How this provider type is presented, reached and what it can do. */
  static readonly catalogueEntry = {
    label: 'Jellyfin',
    apiKeyRequired: true,
    hostPlaceholder: 'http://localhost:8096',
    apiPath: '',
    filterData: ['Library contents', 'Item metadata'],
    capabilities: { mediaServer: 'jellyfinItemId' },
  } as const satisfies ProviderTypeEntry;

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
