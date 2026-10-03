import { MetadataProviderType } from '@server/database/schema';
import { type ActuatorTask, type MediaActuator, requireParameter } from '../roles';
import { BaseProviderConnection } from './baseProviderConnection';

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
}

export type SonarrImage = {
  coverType: string;
  remoteUrl: string;
};

export type SonarrSeries = {
  id: number;
  title: string;
  year?: number;
  status: string;
  monitored: boolean;
  tvdbId: number;
  tmdbId?: number;
  imdbId?: string;
  tvMazeId?: number;
  profileId: number;
  qualityProfileId: number;
  languageProfileId: number;
  tags: number[];
  path: string;
  seasons: SonarrSeason[];
  images?: SonarrImage[];
  genres?: string[];
  network?: string;
  seriesType?: string;
  added?: string;
  ended?: boolean;
  previousAiring?: string;
  nextAiring?: string;
  certification?: string;
  ratings?: { votes: number; value: number };
  statistics?: {
    seasonCount: number;
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
};

export type SonarrProfile = {
  id: number;
  name: string;
};

export interface SonarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
  unmappedFolders: unknown[];
}

export type SonarrTag = {
  id: number;
  label: string;
};

export class SonarrProvider extends BaseProviderConnection implements MediaActuator {
  public readonly actuatorType = MetadataProviderType.SONARR;

  private get apiParams() {
    return { apikey: this.provider.apiKey || '' };
  }

  public tasks(): ActuatorTask[] {
    return [
      {
        id: 'unmonitorSeries',
        label: 'Unmonitor series',
        destructive: false,
        affects: 'media',
        run: async (ids) => this.unmonitorSeries(ids.map(Number)),
      },
      {
        id: 'triggerSearch',
        label: 'Trigger episode search',
        destructive: false,
        run: async (ids) => this.triggerSeriesSearch(ids.map(Number)),
      },
      {
        id: 'deleteSeriesWithFiles',
        label: 'Delete series + files',
        destructive: true,
        affects: 'media',
        run: async (ids) => this.deleteSeries(ids.map(Number)),
      },
      {
        id: 'deleteSeriesKeepFiles',
        label: 'Delete series (keep files)',
        destructive: true,
        affects: 'media',
        run: async (ids) => this.deleteSeriesKeepFiles(ids.map(Number)),
      },
      {
        id: 'refreshSeries',
        label: 'Refresh metadata',
        destructive: false,
        run: async (ids) => this.refreshSeries(ids.map(Number)),
      },
      {
        id: 'rescanSeries',
        label: 'Rescan folder',
        destructive: false,
        run: async (ids) => this.rescanSeries(ids.map(Number)),
      },
      {
        id: 'renameSeries',
        label: 'Rename files',
        destructive: false,
        affects: 'media',
        run: async (ids) => this.renameSeries(ids.map(Number)),
      },
      {
        id: 'changeQualityProfile',
        label: 'Change quality profile',
        destructive: false,
        affects: 'media',
        parameter: { type: 'select', label: 'Quality profile', optionsRoute: 'quality-profiles' },
        run: async (ids, parameterValue) =>
          this.changeQualityProfile(
            ids.map(Number),
            Number(requireParameter('changeQualityProfile', parameterValue))
          ),
      },
      {
        id: 'addTag',
        label: 'Add tag',
        destructive: false,
        parameter: { type: 'select', label: 'Tag', optionsRoute: 'tags' },
        run: async (ids, parameterValue) =>
          this.applyTag(ids.map(Number), Number(requireParameter('addTag', parameterValue)), 'add'),
      },
      {
        id: 'removeTag',
        label: 'Remove tag',
        destructive: false,
        parameter: { type: 'select', label: 'Tag', optionsRoute: 'tags' },
        run: async (ids, parameterValue) =>
          this.applyTag(
            ids.map(Number),
            Number(requireParameter('removeTag', parameterValue)),
            'remove'
          ),
      },
    ];
  }

  public async getSeries(): Promise<SonarrSeries[]> {
    return this.client.get('series', { searchParams: this.apiParams }).json<SonarrSeries[]>();
  }

  public async getProfiles(): Promise<SonarrProfile[]> {
    return this.client
      .get('qualityprofile', { searchParams: this.apiParams })
      .json<SonarrProfile[]>();
  }

  public async getLanguageProfiles(): Promise<SonarrProfile[]> {
    return this.client
      .get('languageprofile', { searchParams: this.apiParams })
      .json<SonarrProfile[]>();
  }

  public async getRootFolders(): Promise<SonarrRootFolder[]> {
    return this.client
      .get('rootfolder', { searchParams: this.apiParams })
      .json<SonarrRootFolder[]>();
  }

  public async getTags(): Promise<SonarrTag[]> {
    return this.client.get('tag', { searchParams: this.apiParams }).json<SonarrTag[]>();
  }

  public async lookupSeries(term: string): Promise<SonarrSeries[]> {
    return this.client
      .get('series/lookup', { searchParams: { ...this.apiParams, term } })
      .json<SonarrSeries[]>();
  }

  public async unmonitorSeries(seriesIds: number[]): Promise<void> {
    const all = await this.getSeries();
    const targets = all.filter((s) => seriesIds.includes(s.id));
    await Promise.all(
      targets.map((s) =>
        this.client
          .put(`series/${s.id}`, {
            searchParams: this.apiParams,
            json: { ...s, monitored: false },
          })
          .json()
      )
    );
  }

  public async triggerSeriesSearch(seriesIds: number[]): Promise<void> {
    await Promise.all(
      seriesIds.map((id) =>
        this.client
          .post('command', {
            searchParams: this.apiParams,
            json: { name: 'SeriesSearch', seriesId: id },
          })
          .json()
      )
    );
  }

  public async changeQualityProfile(seriesIds: number[], qualityProfileId: number): Promise<void> {
    await this.client
      .put('series/editor', {
        searchParams: this.apiParams,
        json: { seriesIds, qualityProfileId },
      })
      .json();
  }

  public async applyTag(seriesIds: number[], tagId: number, mode: 'add' | 'remove'): Promise<void> {
    await this.client
      .put('series/editor', {
        searchParams: this.apiParams,
        json: { seriesIds, tags: [tagId], applyTags: mode },
      })
      .json();
  }

  public async deleteSeries(seriesIds: number[]): Promise<void> {
    await Promise.all(
      seriesIds.map((id) =>
        this.client
          .delete(`series/${id}`, {
            searchParams: {
              ...this.apiParams,
              deleteFiles: 'true',
              addImportListExclusion: 'false',
            },
          })
          .json()
      )
    );
  }

  public async deleteSeriesKeepFiles(seriesIds: number[]): Promise<void> {
    await Promise.all(
      seriesIds.map((id) =>
        this.client
          .delete(`series/${id}`, {
            searchParams: {
              ...this.apiParams,
              deleteFiles: 'false',
              addImportListExclusion: 'false',
            },
          })
          .json()
      )
    );
  }

  public async refreshSeries(seriesIds: number[]): Promise<void> {
    if (seriesIds.length === 0) return;
    await this.client
      .post('command', {
        searchParams: this.apiParams,
        json: { name: 'RefreshSeries', seriesIds },
      })
      .json();
  }

  public async rescanSeries(seriesIds: number[]): Promise<void> {
    if (seriesIds.length === 0) return;
    await this.client
      .post('command', {
        searchParams: this.apiParams,
        json: { name: 'RescanSeries', seriesIds },
      })
      .json();
  }

  public async renameSeries(seriesIds: number[]): Promise<void> {
    if (seriesIds.length === 0) return;
    await this.client
      .post('command', {
        searchParams: this.apiParams,
        json: { name: 'RenameSeries', seriesIds },
      })
      .json();
  }
}
