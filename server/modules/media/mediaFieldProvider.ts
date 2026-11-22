import type { SeerrIssue, SeerrRequest, TautulliHistoryItem } from '../providers';
import type { ReportedFacts } from '../providers';

/**
 * A provider that decorates fields onto an already-existing item, joined by
 * key across a batch. `visit` maps raw provider data into the provider's own
 * native representation, keyed by the logical key the provider speaks;
 * `toEnrichmentFields` is the same checked transform `MediaFieldSource` uses,
 * applied per matched item.
 */
export interface MediaFieldProvider<
  TRaw,
  TMediaField,
  TFields extends Partial<ReportedFacts>,
  TKey extends string | number = string,
> {
  visit(raw: TRaw): Map<TKey, TMediaField>;
  toEnrichmentFields(native: TMediaField): TFields;
}

/**
 * The play-history shape Tautulli and Plex both natively report: play count
 * plus the last play as a unix timestamp. Shared because it's genuinely the
 * same representation for both, not merely a coincidence of two adapters.
 */
interface PlayHistoryFields {
  playCount: number;
  lastPlayedUnix?: number;
}

const toIso = (unix: number): string => new Date(unix * 1000).toISOString();

/** The `toEnrichmentFields` transform every play-history provider shares. */
function playHistoryToReportedFacts(
  native: PlayHistoryFields
): Partial<Pick<ReportedFacts, 'playCount' | 'lastWatchedAt'>> {
  return {
    playCount: native.playCount,
    ...(native.lastPlayedUnix !== undefined ? { lastWatchedAt: toIso(native.lastPlayedUnix) } : {}),
  };
}

/** Tautulli's `watched_status` for a view that passed its watched threshold (like Plex's). */
const TAUTULLI_FULLY_WATCHED = 1;

/**
 * A view that counts toward play count and last watched: fully watched, and stored in history.
 * A row with no history id (`row_id: null`) is not a stored view, such as a stream still playing.
 */
function isCompletedView(item: TautulliHistoryItem): boolean {
  return item.watched_status === TAUTULLI_FULLY_WATCHED && item.row_id !== null;
}

export const tautulliFieldProvider: MediaFieldProvider<
  TautulliHistoryItem[],
  PlayHistoryFields,
  Partial<Pick<ReportedFacts, 'playCount' | 'lastWatchedAt'>>
> = {
  visit: (history) => {
    const byKey = new Map<string, PlayHistoryFields>();
    for (const item of history) {
      if (!isCompletedView(item)) continue;
      // A play of an episode is a play of its show, which is what a series is matched by.
      const key =
        item.media_type === 'episode' && item.grandparent_rating_key
          ? item.grandparent_rating_key
          : item.rating_key;
      const existing = byKey.get(key);
      const playCount = (existing?.playCount ?? 0) + 1;
      const lastPlayedUnix =
        item.stopped !== undefined &&
        (existing?.lastPlayedUnix === undefined || item.stopped > existing.lastPlayedUnix)
          ? item.stopped
          : existing?.lastPlayedUnix;
      byKey.set(key, { playCount, lastPlayedUnix });
    }
    return byKey;
  },
  toEnrichmentFields: playHistoryToReportedFacts,
};

export const tmdbFieldSource = {
  toEnrichmentFields: (status: string): Pick<ReportedFacts, 'tmdbStatus'> => ({
    tmdbStatus: status,
  }),
};

/** Seerr's own representation: request status and whether an issue is open. */
interface SeerrNativeFields {
  requestStatus?: number;
  hasIssue?: boolean;
}

export const seerrFieldProvider: MediaFieldProvider<
  [SeerrRequest[], SeerrIssue[]],
  SeerrNativeFields,
  Partial<Pick<ReportedFacts, 'seerrRequestStatus' | 'seerrHasIssue'>>,
  number
> = {
  visit: ([requests, issues]) => {
    const byTmdbId = new Map<number, SeerrNativeFields>();
    const get = (tmdbId: number): SeerrNativeFields => {
      let f = byTmdbId.get(tmdbId);
      if (!f) {
        f = {};
        byTmdbId.set(tmdbId, f);
      }
      return f;
    };
    for (const req of requests) get(req.media.tmdbId).requestStatus = req.status;
    for (const issue of issues) get(issue.media.tmdbId).hasIssue = true;
    return byTmdbId;
  },
  toEnrichmentFields: (native) => ({
    ...(native.requestStatus !== undefined ? { seerrRequestStatus: native.requestStatus } : {}),
    ...(native.hasIssue !== undefined ? { seerrHasIssue: native.hasIssue } : {}),
  }),
};
