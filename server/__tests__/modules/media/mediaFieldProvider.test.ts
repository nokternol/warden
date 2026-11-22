import {
  seerrFieldProvider,
  tautulliFieldProvider,
  tmdbFieldSource,
} from '@server/modules/media/mediaFieldProvider';
import type { SeerrIssue, SeerrRequest, TautulliHistoryItem } from '@server/modules/providers';
import { describe, expect, it } from 'vitest';

function history(rating_key: string, stopped?: number): TautulliHistoryItem {
  return {
    rating_key,
    title: 'T',
    watched_status: 1,
    duration: 3600,
    play_duration: 3600,
    user: 'u',
    ...(stopped !== undefined ? { stopped } : {}),
  } as TautulliHistoryItem;
}

describe('tautulliFieldProvider.visit', () => {
  it('aggregates play count per rating_key across history rows', () => {
    const result = tautulliFieldProvider.visit([
      history('abc123', 1000),
      history('abc123', 2000),
      history('other', 3000),
    ]);

    expect(result.get('abc123')?.playCount).toBe(2);
    expect(result.get('other')?.playCount).toBe(1);
  });

  it('counts only views Tautulli marks fully watched, as Plex would', () => {
    const result = tautulliFieldProvider.visit([
      history('abc123', 1000),
      { ...history('abc123', 2000), watched_status: 0.75 },
      { ...history('partial', 3000), watched_status: 0.5 },
      { ...history('started', 4000), watched_status: 0 },
    ]);

    expect(result.get('abc123')?.playCount).toBe(1);
    expect(result.has('partial')).toBe(false);
    expect(result.has('started')).toBe(false);
  });

  it('does not count a row with no history id, such as a stream still playing', () => {
    const result = tautulliFieldProvider.visit([
      { ...history('abc123', 1000), row_id: 7 },
      { ...history('abc123', 2000), row_id: null },
    ]);

    expect(result.get('abc123')).toEqual({ playCount: 1, lastPlayedUnix: 1000 });
  });
});

describe('tautulliFieldProvider.toEnrichmentFields', () => {
  it('converts the native unix timestamp into an ISO lastWatchedAt', () => {
    const native = tautulliFieldProvider.visit([history('abc123', 1700000000)]).get('abc123')!;

    const result = tautulliFieldProvider.toEnrichmentFields(native);

    expect(result).toEqual({
      playCount: 1,
      lastWatchedAt: new Date(1700000000 * 1000).toISOString(),
    });
  });

  it('omits lastWatchedAt entirely when no play carried a timestamp', () => {
    const native = tautulliFieldProvider.visit([history('abc123')]).get('abc123')!;

    const result = tautulliFieldProvider.toEnrichmentFields(native);

    expect(result).not.toHaveProperty('lastWatchedAt');
  });
});

function seerrRequest(tmdbId: number, status: number): SeerrRequest {
  return {
    id: 1,
    status,
    type: 'movie',
    requestedBy: { id: 1, displayName: 'u', email: 'u@u.com' },
    media: { tmdbId, title: 'T' },
    createdAt: '',
  };
}

function seerrIssue(tmdbId: number): SeerrIssue {
  return { id: 1, status: 1, media: { tmdbId } };
}

describe('seerrFieldProvider.visit', () => {
  it('maps request status and issue presence by tmdbId', () => {
    const result = seerrFieldProvider.visit([
      [seerrRequest(100, 2), seerrRequest(999, 3)],
      [seerrIssue(100)],
    ]);

    expect(result.get(100)).toEqual({ requestStatus: 2, hasIssue: true });
    expect(result.get(999)).toEqual({ requestStatus: 3 });
  });
});

describe('tmdbFieldSource', () => {
  it('transforms the raw TMDB status string into the canonical tmdbStatus field', () => {
    const result = tmdbFieldSource.toEnrichmentFields('Released');

    expect(result).toEqual({ tmdbStatus: 'Released' });
  });
});

describe('tautulliFieldProvider — series', () => {
  it('counts a play of an episode as a play of its show, which a series is matched by', () => {
    const byKey = tautulliFieldProvider.visit([
      {
        rating_key: 'ep1',
        grandparent_rating_key: 'show',
        media_type: 'episode',
        watched_status: 1,
        stopped: 5,
      },
      {
        rating_key: 'ep2',
        grandparent_rating_key: 'show',
        media_type: 'episode',
        watched_status: 1,
        stopped: 9,
      },
      { rating_key: 'film', media_type: 'movie', watched_status: 1, stopped: 3 },
    ] as never);
    expect(byKey.get('show')).toEqual({ playCount: 2, lastPlayedUnix: 9 });
    expect(byKey.get('film')?.playCount).toBe(1);
    expect(byKey.has('ep1')).toBe(false);
  });
});
