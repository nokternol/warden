import { getChildLogger } from '@server/kernel/logger';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import { TautulliProvider } from '@server/modules/providers/connections/tautulliProvider';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

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

  it('fetches and parses library stats correctly', async () => {
    const stats = await provider.getLibraryStats();
    expect(stats).toHaveLength(2);
    expect(stats[0].section_name).toBe('Movies');
    expect(stats[0].section_type).toBe('movie');
  });

  it('fetches and parses home stats correctly', async () => {
    const stats = await provider.getHomeStats();
    expect(stats).toHaveLength(1);
    expect(stats[0].stat_id).toBe('top_movies');
    expect(stats[0].rows[0].title).toBe('The Matrix');
  });

  it('fetches and parses watch history correctly', async () => {
    const history = await provider.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].title).toBe('The Matrix');
    expect(history[0].watched_status).toBe(1);
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
