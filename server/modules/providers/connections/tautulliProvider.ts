import { MetadataProviderType } from '@server/database/schema';
import type { ReportedFacts } from '../facts';
import type { ActuatorTask, FactReporter, MediaActuator, ProviderTypeEntry } from '../roles';
import { BaseProviderConnection } from './baseProviderConnection';
import { playHistoryFacts } from './factMapping';

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

/** Tautulli's `watched_status` for a view that passed its watched threshold (like Plex's). */
const FULLY_WATCHED = 1;

/**
 * A view that counts toward play count and last watched: fully watched, and stored in history.
 * A row with no history id (`row_id: null`) is not a stored view, such as a stream still playing.
 */
function isCompletedView(item: TautulliHistoryItem): boolean {
  return item.watched_status === FULLY_WATCHED && item.row_id !== null;
}

export class TautulliProvider
  extends BaseProviderConnection
  implements MediaActuator, FactReporter
{
  /** How this provider type is presented, reached and what it can do. */
  static readonly catalogueEntry = {
    label: 'Tautulli',
    apiKeyRequired: true,
    hostPlaceholder: 'http://localhost:8181',
    apiPath: '',
    filterData: ['Watch history', 'Play statistics', 'User activity'],
    capabilities: { addressedBy: 'plexRatingKey' },
  } as const satisfies ProviderTypeEntry;

  /** One call that needs the key, so a wrong key fails the test. */
  async testConnection(): Promise<void> {
    await this.client
      .get('api/v2', { searchParams: { ...this.baseParams, cmd: 'get_server_info' } })
      .json();
  }

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

  /**
   * The play count and last play Tautulli reports for each title, by rating key, from its
   * completed views. A view of an episode is a view of its show, which a series is matched by.
   */
  async readReportedFacts(): Promise<Map<string, Partial<ReportedFacts>>> {
    const plays = new Map<string, { playCount: number; lastPlayedUnix?: number }>();
    for (const item of await this.getHistory()) {
      if (!isCompletedView(item)) continue;
      const key =
        item.media_type === 'episode' && item.grandparent_rating_key
          ? item.grandparent_rating_key
          : item.rating_key;
      const seen = plays.get(key);
      const later =
        item.stopped !== undefined &&
        (seen?.lastPlayedUnix === undefined || item.stopped > seen.lastPlayedUnix);
      plays.set(key, {
        playCount: (seen?.playCount ?? 0) + 1,
        lastPlayedUnix: later ? item.stopped : seen?.lastPlayedUnix,
      });
    }
    return new Map(
      [...plays].map(([key, { playCount, lastPlayedUnix }]) => [
        key,
        playHistoryFacts(playCount, lastPlayedUnix),
      ])
    );
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
