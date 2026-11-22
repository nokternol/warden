import { getChildLogger } from '@server/kernel/logger';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import {
  type TautulliHistoryItem,
  TautulliProvider,
} from '@server/modules/providers/connections/tautulliProvider';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

const logger = getChildLogger('TestTautulliProvider');

const TAUTULLI_URL = 'http://localhost:8181';

const mockConfig: ProviderConfig = {
  name: 'Test Tautulli',
  url: TAUTULLI_URL,
  apiKey: 'fake-api-key',
  settings: {},
};

afterEach(() => server.resetHandlers());

describe('TautulliProvider', () => {
  const provider = new TautulliProvider(mockConfig, logger);

  it('fetches and parses watch history correctly', async () => {
    const history = await provider.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].title).toBe('The Matrix');
    expect(history[0].watched_status).toBe(1);
  });

  it('returns rating keys as text, matching how Plex keys are stored', async () => {
    const history = await provider.getHistory();
    expect(history.map((h) => [h.rating_key, h.grandparent_rating_key])).toEqual([
      ['123', undefined],
      ['456', '789'],
    ]);
  });
});

describe('TautulliProvider — actuator tasks', () => {
  const provider = new TautulliProvider(mockConfig, logger);
  const task = (id: string) => provider.tasks().find((t) => t.id === id)!;

  it('declares only deleteWatchHistory — session/notification tasks are not in the vocabulary', () => {
    expect(provider.tasks().map((t) => t.id)).toEqual(['deleteWatchHistory']);

    const del = task('deleteWatchHistory');
    expect(del.destructive).toBe(true);
    expect(del.affects).toBe('media');
  });

  /** Wires a stateful /api/v2 handler: history rows per lookup key, capturing delete calls. */
  function stubHistoryApi(rowsByKey: Record<string, Array<{ row_id: number }>>) {
    const deleteCalls: Array<string | null> = [];
    server.use(
      http.get(`${TAUTULLI_URL}/api/v2`, ({ request }) => {
        const url = new URL(request.url);
        const cmd = url.searchParams.get('cmd');
        if (cmd === 'get_history') {
          const key =
            url.searchParams.get('rating_key') ?? url.searchParams.get('grandparent_rating_key');
          const qualifier = url.searchParams.has('rating_key') ? 'rating' : 'grandparent';
          const rows = rowsByKey[`${qualifier}:${key}`] ?? [];
          return HttpResponse.json({
            response: { result: 'success', data: { data: rows, total_count: rows.length } },
          });
        }
        if (cmd === 'delete_history') {
          deleteCalls.push(url.searchParams.get('row_ids'));
          return HttpResponse.json({ response: { result: 'success', data: null } });
        }
        return HttpResponse.json(
          { response: { result: 'error', message: 'Unknown command' } },
          { status: 400 }
        );
      })
    );
    return deleteCalls;
  }

  it('deleteWatchHistory collects row ids by rating_key and grandparent_rating_key, then deletes once', async () => {
    const deleteCalls = stubHistoryApi({
      'rating:101': [{ row_id: 1 }, { row_id: 2 }],
      'grandparent:101': [{ row_id: 3 }],
      'rating:202': [{ row_id: 8 }],
    });

    await task('deleteWatchHistory').run(['101', '202']);

    expect(deleteCalls).toEqual(['1,2,3,8']);
  });

  it('deleteWatchHistory dedupes row ids seen under both lookup keys', async () => {
    const deleteCalls = stubHistoryApi({
      'rating:101': [{ row_id: 1 }, { row_id: 2 }],
      'grandparent:101': [{ row_id: 2 }],
    });

    await task('deleteWatchHistory').run(['101']);

    expect(deleteCalls).toEqual(['1,2']);
  });

  it('deleteWatchHistory deletes every session of a viewing Tautulli merged into one row', async () => {
    const deleteCalls: Array<string | null> = [];
    server.use(
      http.get(`${TAUTULLI_URL}/api/v2`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('cmd') === 'delete_history') {
          deleteCalls.push(url.searchParams.get('row_ids'));
          return HttpResponse.json({ response: { result: 'success', data: null } });
        }
        // Tautulli merges a paused-and-resumed viewing into one row unless asked not to.
        const ungrouped = url.searchParams.get('grouping') === '0';
        const rows =
          url.searchParams.get('rating_key') === '101'
            ? ungrouped
              ? [{ row_id: 1 }, { row_id: 2 }]
              : [{ row_id: 2, group_count: 2, group_ids: '1,2' }]
            : [];
        return HttpResponse.json({ response: { result: 'success', data: { data: rows } } });
      })
    );

    await task('deleteWatchHistory').run(['101']);

    expect(deleteCalls).toEqual(['1,2']);
  });

  it('deleteWatchHistory skips a row with no history id, such as a stream still playing', async () => {
    const deleteCalls = stubHistoryApi({
      'rating:101': [{ row_id: 1 }, { row_id: null as never }],
    });

    await task('deleteWatchHistory').run(['101']);

    expect(deleteCalls).toEqual(['1']);
  });

  it('deleteWatchHistory issues no delete when nothing matched', async () => {
    const deleteCalls = stubHistoryApi({});

    await task('deleteWatchHistory').run(['999']);

    expect(deleteCalls).toEqual([]);
  });

  it('reads every page of play history, not just the first', async () => {
    const starts: string[] = [];
    server.use(
      http.get('*/api/v2', ({ request }) => {
        const url = new URL(request.url);
        const start = Number(url.searchParams.get('start'));
        starts.push(String(start));
        const count = start === 0 ? 1000 : 3;
        return HttpResponse.json({
          response: {
            result: 'success',
            data: {
              data: Array.from({ length: count }, (_, i) => ({ rating_key: `${start + i}` })),
            },
          },
        });
      })
    );
    const history = await new TautulliProvider(
      { url: 'http://tautulli.local:8181', apiKey: 'k' } as never,
      { debug() {}, info() {}, warn() {}, error() {} } as never
    ).getHistory();
    expect(history).toHaveLength(1003);
    expect(starts).toEqual(['0', '1000']);
  });
});

describe('TautulliProvider — reported facts', () => {
  /** One completed, stored view of `rating_key`, stopped at `stopped`. */
  function view(rating_key: string, stopped?: number): TautulliHistoryItem {
    return {
      row_id: 1,
      rating_key,
      title: 'T',
      watched_status: 1,
      duration: 3600,
      play_duration: 3600,
      user: 'u',
      ...(stopped !== undefined ? { stopped } : {}),
    } as TautulliHistoryItem;
  }

  /** The facts Tautulli reports when its history holds exactly `history`. */
  async function reportedFor(history: TautulliHistoryItem[]) {
    const provider = new TautulliProvider(mockConfig, logger);
    vi.spyOn(provider, 'getHistory').mockResolvedValue(history);
    return provider.readReportedFacts();
  }

  it('reports the play count and last play of each rating key', async () => {
    const facts = await reportedFor([
      view('abc123', 1700000000),
      view('abc123', 1600000000),
      view('other'),
    ]);

    expect(facts).toEqual(
      new Map([
        ['abc123', { playCount: 2, lastWatchedAt: new Date(1700000000 * 1000).toISOString() }],
        ['other', { playCount: 1 }],
      ])
    );
  });

  it('counts only stored views Tautulli marks fully watched, as Plex would', async () => {
    const facts = await reportedFor([
      view('abc123', 1000),
      { ...view('abc123', 2000), watched_status: 0.75 },
      { ...view('abc123', 3000), row_id: null },
      { ...view('partial', 4000), watched_status: 0.5 },
    ]);

    expect(facts).toEqual(
      new Map([['abc123', { playCount: 1, lastWatchedAt: new Date(1000 * 1000).toISOString() }]])
    );
  });

  it('counts a view of an episode as a view of its show, which a series is matched by', async () => {
    const episode = (rating_key: string, stopped: number): TautulliHistoryItem => ({
      ...view(rating_key, stopped),
      grandparent_rating_key: 'show',
      media_type: 'episode',
    });

    const facts = await reportedFor([episode('ep1', 5), episode('ep2', 9)]);

    expect(facts).toEqual(
      new Map([['show', { playCount: 2, lastWatchedAt: new Date(9 * 1000).toISOString() }]])
    );
  });
});
