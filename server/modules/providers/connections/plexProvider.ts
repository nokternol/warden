import { MetadataProviderType } from '@server/database/schema';
import type { ReportedFacts } from '../facts';
import type { ActuatorTask, FactReporter, MediaActuator, ProviderTypeEntry } from '../roles';
import { BaseProviderConnection } from './baseProviderConnection';
import { defined, isoFromUnix, playHistoryFacts } from './factMapping';

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

/** What Plex reports about one item, from its own fields and its primary file (first Media/Part). */
function reportedFactsOf(item: PlexMediaItem): Partial<ReportedFacts> {
  const media = item.Media?.[0];
  const labels = item.Label?.map((l) => l.tag);
  return {
    ...playHistoryFacts(item.viewCount ?? 0, item.lastViewedAt),
    ...defined({
      plexAddedAt: item.addedAt !== undefined ? isoFromUnix(item.addedAt) : undefined,
      studio: item.studio,
      runtimeMinutes: item.duration !== undefined ? Math.round(item.duration / 60_000) : undefined,
      fileSizeBytes: media?.Part?.[0]?.size,
      releaseDate: item.originallyAvailableAt,
      fileContainer: media?.container,
      videoCodec: media?.videoCodec,
      audioCodec: media?.audioCodec,
      fileResolution: media?.videoResolution,
      labels: labels && labels.length > 0 ? labels : undefined,
    }),
  };
}

/**
 * PlexProvider handles metadata gathering from a Plex Media Server instance.
 * Auth token validation against plex.tv lives in services/plexService.ts (PlexService).
 */
export class PlexProvider extends BaseProviderConnection implements MediaActuator, FactReporter {
  /** How this provider type is presented, reached and what it can do. */
  static readonly catalogueEntry = {
    label: 'Plex',
    apiKeyRequired: true,
    hostPlaceholder: 'http://localhost:32400',
    apiPath: '',
    filterData: ['Library contents', 'Item metadata'],
    capabilities: { mediaServer: 'plexRatingKey' },
  } as const satisfies ProviderTypeEntry;

  /** One call that needs the key, so a wrong key fails the test. */
  async testConnection(): Promise<void> {
    await this.client.get('library/sections', { headers: this.authHeader }).json();
  }

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

  /** One section's items; Plex omits `Metadata` from a section with none, which is an empty list. */
  public async getLibraryContents(libraryKey: string): Promise<PlexMediaItem[]> {
    const resp = await this.client
      .get(`library/sections/${libraryKey}/all`, {
        headers: this.authHeader,
        searchParams: { includeGuids: 1 },
      })
      .json<{ MediaContainer: { Metadata?: PlexMediaItem[] } }>();
    return resp.MediaContainer.Metadata ?? [];
  }

  public async getAllItems(): Promise<PlexMediaItem[]> {
    const libraries = await this.getLibraries();
    const nested = await Promise.all(libraries.map((lib) => this.getLibraryContents(lib.key)));
    return nested.flat();
  }

  /** The facts Plex reports about every item in its libraries, by rating key. */
  async readReportedFacts(): Promise<Map<string, Partial<ReportedFacts>>> {
    const items = await this.getAllItems();
    return new Map(items.map((item) => [item.ratingKey, reportedFactsOf(item)]));
  }

  /** Deletes each item and its files; the server must allow media deletion. */
  public async deleteFromLibrary(ratingKeys: string[]): Promise<void> {
    await Promise.all(
      ratingKeys.map((key) =>
        this.deleteAlreadyGoneIsDone(() =>
          this.client.delete(`library/metadata/${key}`, { headers: this.authHeader })
        )
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
