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
  /** `null` on a row with no stored history id yet, such as a stream still playing. */
  row_id?: number | null;
  rating_key: string;
  title: string;
  user: string;
  watched_status: number;
  duration: number;
  play_duration: number;
  /** When the view ended, Unix seconds. */
  stopped?: number;
  media_type?: string;
  grandparent_rating_key?: string;
}

/** A history row as Tautulli sends it: keys are numbers, and a missing grandparent is `''`. */
type RawHistoryRow = Omit<TautulliHistoryItem, 'rating_key' | 'grandparent_rating_key'> & {
  rating_key: number | string;
  grandparent_rating_key?: number | string;
};

/** Plex rating keys are carried as text everywhere else in Warden, so they are matched as text. */
function toHistoryItem(row: RawHistoryRow): TautulliHistoryItem {
  const { grandparent_rating_key: grandparent, ...rest } = row;
  return {
    ...rest,
    rating_key: String(row.rating_key),
    ...(grandparent !== undefined && grandparent !== ''
      ? { grandparent_rating_key: String(grandparent) }
      : {}),
  };
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
      const { data } = await this.command<{ data: RawHistoryRow[] }>('get_history', {
        start,
        length: HISTORY_PAGE_SIZE,
      });
      history.push(...data.map(toHistoryItem));
      if (data.length < HISTORY_PAGE_SIZE) return history;
    }
  }

  public async searchHistory(title: string): Promise<TautulliHistoryItem[]> {
    const data = await this.command<{ data: RawHistoryRow[] }>('get_history', {
      search: title,
      length: 100,
    });
    return data.data.map(toHistoryItem);
  }

  /**
   * Deletes every history row logged against the given Plex rating keys.
   * Tautulli logs history per played item, so a show's watch history lives on
   * its episodes — each key is looked up both directly (`rating_key`: movies,
   * episodes) and as a series (`grandparent_rating_key`: a show's episodes),
   * then all matched rows are deleted in one `delete_history` call.
   *
   * Lookups ask for `grouping: 0`: by default Tautulli merges the sessions of one
   * viewing (paused, resumed later) into a single row carrying only one of their ids,
   * so deleting grouped rows would leave the other sessions behind. A row with no id
   * (`row_id: null`, not yet stored, such as a stream still playing) is skipped.
   */
  public async deleteWatchHistory(ratingKeys: string[]): Promise<void> {
    const rowIds = new Set<number>();
    for (const key of ratingKeys) {
      for (const qualifier of ['rating_key', 'grandparent_rating_key'] as const) {
        const data = await this.command<{ data: Array<{ row_id: number | null }> }>('get_history', {
          [qualifier]: key,
          length: 10000,
          grouping: 0,
        });
        for (const row of data.data) if (row.row_id !== null) rowIds.add(row.row_id);
      }
    }
    if (rowIds.size === 0) return;
    await this.command('delete_history', { row_ids: [...rowIds].sort((a, b) => a - b).join(',') });
  }
}
