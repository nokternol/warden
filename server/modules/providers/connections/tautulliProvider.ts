import { MetadataProviderType } from '@server/database/schema';
import type { ActuatorTask, MediaActuator } from '../roles';
import { BaseProviderConnection } from './baseProviderConnection';

export interface TautulliLibraryStat {
  section_id: number;
  section_name: string;
  section_type: string;
  count: number;
}

export interface TautulliHomeStatRow {
  title: string;
  total_plays: number;
}

export interface TautulliHomeStat {
  stat_id: string;
  rows: TautulliHomeStatRow[];
}

export interface TautulliHistoryItem {
  rating_key: string;
  title: string;
  user: string;
  watched_status: number;
  duration: number;
  play_duration: number;
  played_at?: number;
  media_type?: string;
  grandparent_rating_key?: string;
}

interface TautulliResponse<T> {
  response: {
    result: string;
    data: T;
  };
}

const HISTORY_PAGE_SIZE = 1000;

export class TautulliProvider extends BaseProviderConnection implements MediaActuator {
  public readonly actuatorType = MetadataProviderType.TAUTULLI;

  public tasks(): ActuatorTask[] {
    return [
      {
        id: 'deleteWatchHistory',
        label: 'Delete watch history',
        destructive: true,
        affects: 'media',
        run: async (ids) => this.deleteWatchHistory(ids.map(String)),
      },
    ];
  }

  private get baseParams() {
    return { apikey: this.provider.apiKey || '' };
  }

  private async command<T>(cmd: string, extra?: Record<string, string | number>): Promise<T> {
    const resp = await this.client
      .get('api/v2', { searchParams: { ...this.baseParams, cmd, ...extra } })
      .json<TautulliResponse<T>>();
    return resp.response.data;
  }

  public async getLibraryStats(): Promise<TautulliLibraryStat[]> {
    const data = await this.command<{ data: TautulliLibraryStat[] }>('get_libraries_table');
    return data.data;
  }

  public async getHomeStats(): Promise<TautulliHomeStat[]> {
    return this.command<TautulliHomeStat[]>('get_home_stats');
  }

  /** Every play on record. Tautulli answers with 25 rows unless asked for more. */
  public async getHistory(): Promise<TautulliHistoryItem[]> {
    const history: TautulliHistoryItem[] = [];
    for (let start = 0; ; start += HISTORY_PAGE_SIZE) {
      const { data } = await this.command<{ data: TautulliHistoryItem[] }>('get_history', {
        start,
        length: HISTORY_PAGE_SIZE,
      });
      history.push(...data);
      if (data.length < HISTORY_PAGE_SIZE) return history;
    }
  }

  public async searchHistory(title: string): Promise<TautulliHistoryItem[]> {
    const data = await this.command<{ data: TautulliHistoryItem[] }>('get_history', {
      search: title,
      length: 100,
    });
    return data.data;
  }

  /**
   * Deletes every history row logged against the given Plex rating keys.
   * Tautulli logs history per played item, so a show's watch history lives on
   * its episodes — each key is looked up both directly (`rating_key`: movies,
   * episodes) and as a series (`grandparent_rating_key`: a show's episodes),
   * then all matched rows are deleted in one `delete_history` call.
   */
  public async deleteWatchHistory(ratingKeys: string[]): Promise<void> {
    const rowIds = new Set<number>();
    for (const key of ratingKeys) {
      for (const qualifier of ['rating_key', 'grandparent_rating_key'] as const) {
        const data = await this.command<{ data: Array<{ row_id: number }> }>('get_history', {
          [qualifier]: key,
          length: 10000,
        });
        for (const row of data.data) rowIds.add(row.row_id);
      }
    }
    if (rowIds.size === 0) return;
    await this.command('delete_history', { row_ids: [...rowIds].sort((a, b) => a - b).join(',') });
  }
}
