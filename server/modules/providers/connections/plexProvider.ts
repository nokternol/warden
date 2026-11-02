import { MetadataProviderType } from '@server/database/schema';
import type { ActuatorTask, MediaActuator } from '../roles';
import { BaseProviderConnection } from './baseProviderConnection';

export interface PlexLibrary {
  key: string;
  title: string;
  type: string;
}

export interface PlexMediaPart {
  size?: number;
  file?: string;
}

export interface PlexMedia {
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  videoResolution?: string;
  Part?: PlexMediaPart[];
}

export interface PlexMediaItem {
  ratingKey: string;
  title: string;
  type: string;
  year?: number;
  thumb?: string;
  /** External ids (`tmdb://N`, `tvdb://N`, `imdb://ttN`); listings carry it only with includeGuids=1. */
  Guid?: { id: string }[];
  viewCount?: number;
  lastViewedAt?: number;
  addedAt?: number;
  studio?: string;
  duration?: number;
  contentRating?: string;
  originallyAvailableAt?: string;
  Genre?: { tag: string }[];
  Label?: { tag: string }[];
  Media?: PlexMedia[];
}

/**
 * PlexProvider handles metadata gathering from a Plex Media Server instance.
 * Auth token validation against plex.tv lives in services/plexService.ts (PlexService).
 */
export class PlexProvider extends BaseProviderConnection implements MediaActuator {
  public readonly actuatorType = MetadataProviderType.PLEX;

  public tasks(): ActuatorTask[] {
    return [
      {
        id: 'deleteFromLibrary',
        label: 'Delete from library',
        destructive: true,
        affects: 'media',
        run: async (ids) => this.deleteFromLibrary(ids.map(String)),
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
    ];
  }

  private get authHeader() {
    return {
      'X-Plex-Token': this.provider.apiKey ?? '',
      Accept: 'application/json',
    };
  }

  public async getLibraries(): Promise<PlexLibrary[]> {
    const resp = await this.client
      .get('library/sections', { headers: this.authHeader })
      .json<{ MediaContainer: { Directory: PlexLibrary[] } }>();
    return resp.MediaContainer.Directory;
  }

  public async getLibraryContents(libraryKey: string): Promise<PlexMediaItem[]> {
    const resp = await this.client
      .get(`library/sections/${libraryKey}/all`, {
        headers: this.authHeader,
        searchParams: { includeGuids: 1 },
      })
      .json<{ MediaContainer: { Metadata: PlexMediaItem[] } }>();
    return resp.MediaContainer.Metadata;
  }

  public async getAllItems(): Promise<PlexMediaItem[]> {
    const libraries = await this.getLibraries();
    const nested = await Promise.all(libraries.map((lib) => this.getLibraryContents(lib.key)));
    return nested.flat();
  }

  /** Deletes each item and its files; the server must allow media deletion. */
  public async deleteFromLibrary(ratingKeys: string[]): Promise<void> {
    await Promise.all(
      ratingKeys.map((key) =>
        this.client.delete(`library/metadata/${key}`, { headers: this.authHeader })
      )
    );
  }

  public async refreshMetadata(ratingKeys: string[]): Promise<void> {
    await Promise.all(
      ratingKeys.map((key) =>
        this.client.put(`library/metadata/${key}/refresh`, { headers: this.authHeader })
      )
    );
  }

  public async markPlayed(ratingKeys: string[]): Promise<void> {
    await Promise.all(ratingKeys.map((key) => this.scrobble(':/scrobble', key)));
  }

  public async markUnplayed(ratingKeys: string[]): Promise<void> {
    await Promise.all(ratingKeys.map((key) => this.scrobble(':/unscrobble', key)));
  }

  private async scrobble(path: ':/scrobble' | ':/unscrobble', ratingKey: string): Promise<void> {
    await this.client.get(path, {
      headers: this.authHeader,
      searchParams: { identifier: 'com.plexapp.plugins.library', key: ratingKey },
    });
  }
}
