import { getChildLogger } from '@server/kernel/logger';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import {
  type JellyfinItem,
  JellyfinProvider,
} from '@server/modules/providers/connections/jellyfinProvider';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

const logger = getChildLogger('TestJellyfinProvider');

const JELLYFIN_URL = 'http://localhost:8096';

const mockConfig: ProviderConfig = {
  name: 'Test Jellyfin',
  url: JELLYFIN_URL,
  apiKey: 'fake-api-key',
  settings: { userId: 'test-user-id' },
};

afterEach(() => server.resetHandlers());

describe('JellyfinProvider', () => {
  const provider = new JellyfinProvider(mockConfig, logger);

  it('fetches and parses libraries correctly', async () => {
    const libraries = await provider.getLibraries();
    expect(libraries).toHaveLength(2);
    expect(libraries[0].Name).toBe('Movies');
    expect(libraries[0].ItemId).toBe('aaaaaa');
  });

  it('fetches and parses library contents correctly', async () => {
    const items = await provider.getLibraryContents('aaaaaa');
    expect(items).toHaveLength(1);
    expect(items[0].Name).toBe('The Matrix');
    expect(items[0].Type).toBe('Movie');
  });
});

describe('JellyfinProvider — getAllItems', () => {
  const provider = new JellyfinProvider(mockConfig, logger);

  it('fetches all movies and series recursively, user-scoped, with their provider ids and enrichment fields', async () => {
    let captured: URL | null = null;
    server.use(
      http.get(`${JELLYFIN_URL}/Users/:userId/Items`, ({ params, request }) => {
        captured = new URL(request.url);
        expect(params.userId).toBe('test-user-id');
        return HttpResponse.json({
          Items: [
            { Id: 'jf-1', Name: 'The Matrix', Type: 'Movie', ProviderIds: { Tmdb: '603' } },
            { Id: 'jf-2', Name: 'Breaking Bad', Type: 'Series', ProviderIds: { Tvdb: '81189' } },
          ],
          TotalRecordCount: 2,
        });
      })
    );

    const items = await provider.getAllItems();

    expect(items).toHaveLength(2);
    expect(items[0].ProviderIds).toEqual({ Tmdb: '603' });
    expect(captured!.searchParams.get('recursive')).toBe('true');
    expect(captured!.searchParams.get('fields')).toBe(
      'ProviderIds,Genres,OfficialRating,Studios,RunTimeTicks,MediaSources,PremiereDate,DateCreated,Tags'
    );
    expect(captured!.searchParams.get('includeItemTypes')).toBe('Movie,Series');
  });
});

describe('JellyfinProvider — actuator tasks', () => {
  const provider = new JellyfinProvider(mockConfig, logger);
  const task = (id: string) => provider.tasks().find((t) => t.id === id)!;

  it('declares its vocabulary; addToCollection and removeFromCollection take a parameter', () => {
    const tasks = provider.tasks();
    expect(tasks.map((t) => t.id)).toEqual([
      'deleteItem',
      'refreshMetadata',
      'markPlayed',
      'markUnplayed',
      'addToCollection',
      'removeFromCollection',
    ]);
    const collectionParam = { type: 'select', label: 'Collection', optionsRoute: 'collections' };
    expect(tasks.find((t) => t.id === 'addToCollection')?.parameter).toEqual(collectionParam);
    expect(tasks.find((t) => t.id === 'removeFromCollection')?.parameter).toEqual(collectionParam);
    for (const t of tasks.filter(
      (t) => t.id !== 'addToCollection' && t.id !== 'removeFromCollection'
    )) {
      expect(t.parameter).toBeUndefined();
    }
  });

  it('deleteItem sends DELETE /Items/{itemId} with the auth header for each id', async () => {
    const deleted: Array<{ id: string; auth: string | null }> = [];
    server.use(
      http.delete(`${JELLYFIN_URL}/Items/:id`, ({ params, request }) => {
        deleted.push({
          id: params.id as string,
          auth: request.headers.get('X-Emby-Authorization'),
        });
        return new HttpResponse(null, { status: 204 });
      })
    );

    await task('deleteItem').run(['abc', 'def']);

    expect(deleted.map((d) => d.id).sort()).toEqual(['abc', 'def']);
    expect(deleted.every((d) => d.auth?.includes('Token="fake-api-key"'))).toBe(true);
  });

  it('refreshMetadata posts /Items/{itemId}/Refresh with full refresh modes', async () => {
    const calls: Array<{ id: string; metadataMode: string | null; imageMode: string | null }> = [];
    server.use(
      http.post(`${JELLYFIN_URL}/Items/:id/Refresh`, ({ params, request }) => {
        const url = new URL(request.url);
        calls.push({
          id: params.id as string,
          metadataMode: url.searchParams.get('metadataRefreshMode'),
          imageMode: url.searchParams.get('imageRefreshMode'),
        });
        return new HttpResponse(null, { status: 204 });
      })
    );

    await task('refreshMetadata').run(['abc']);

    expect(calls).toEqual([{ id: 'abc', metadataMode: 'FullRefresh', imageMode: 'FullRefresh' }]);
  });

  it('markPlayed posts /UserPlayedItems/{itemId} for the configured user', async () => {
    const calls: Array<{ id: string; userId: string | null }> = [];
    server.use(
      http.post(`${JELLYFIN_URL}/UserPlayedItems/:id`, ({ params, request }) => {
        const url = new URL(request.url);
        calls.push({ id: params.id as string, userId: url.searchParams.get('userId') });
        return HttpResponse.json({});
      })
    );

    await task('markPlayed').run(['abc']);

    expect(calls).toEqual([{ id: 'abc', userId: 'test-user-id' }]);
  });

  it('markUnplayed deletes /UserPlayedItems/{itemId} for the configured user', async () => {
    const calls: Array<{ id: string; userId: string | null }> = [];
    server.use(
      http.delete(`${JELLYFIN_URL}/UserPlayedItems/:id`, ({ params, request }) => {
        const url = new URL(request.url);
        calls.push({ id: params.id as string, userId: url.searchParams.get('userId') });
        return HttpResponse.json({});
      })
    );

    await task('markUnplayed').run(['abc']);

    expect(calls).toEqual([{ id: 'abc', userId: 'test-user-id' }]);
  });

  it('addToCollection posts every id to /Collections/{collectionId}/Items', async () => {
    const calls: Array<{ collectionId: string; ids: string | null }> = [];
    server.use(
      http.post(`${JELLYFIN_URL}/Collections/:collectionId/Items`, ({ params, request }) => {
        const url = new URL(request.url);
        calls.push({
          collectionId: params.collectionId as string,
          ids: url.searchParams.get('ids'),
        });
        return new HttpResponse(null, { status: 204 });
      })
    );

    await task('addToCollection').run(['abc', 'def'], 'col-1');

    expect(calls).toEqual([{ collectionId: 'col-1', ids: 'abc,def' }]);
  });

  it('addToCollection rejects when invoked without its parameter', async () => {
    await expect(task('addToCollection').run(['abc'])).rejects.toThrow(/requires a parameter/i);
  });

  it('removeFromCollection deletes every id from /Collections/{collectionId}/Items', async () => {
    const calls: Array<{ collectionId: string; ids: string | null }> = [];
    server.use(
      http.delete(`${JELLYFIN_URL}/Collections/:collectionId/Items`, ({ params, request }) => {
        const url = new URL(request.url);
        calls.push({
          collectionId: params.collectionId as string,
          ids: url.searchParams.get('ids'),
        });
        return new HttpResponse(null, { status: 204 });
      })
    );

    await task('removeFromCollection').run(['abc', 'def'], 'col-1');

    expect(calls).toEqual([{ collectionId: 'col-1', ids: 'abc,def' }]);
  });

  it('removeFromCollection rejects when invoked without its parameter', async () => {
    await expect(task('removeFromCollection').run(['abc'])).rejects.toThrow(
      /requires a parameter/i
    );
  });
});

describe('JellyfinProvider — deleting an item already gone', () => {
  const provider = new JellyfinProvider(mockConfig, logger);

  it('counts a delete answered 404 as done', async () => {
    server.use(
      http.delete(`${JELLYFIN_URL}/Items/:id`, () => new HttpResponse(null, { status: 404 }))
    );

    await expect(provider.deleteItems(['jf-1'])).resolves.toBeUndefined();
  });
});

describe('JellyfinProvider — reported facts', () => {
  /** The facts Jellyfin reports when its libraries hold exactly `items`. */
  async function reportedFor(items: JellyfinItem[]) {
    const provider = new JellyfinProvider(mockConfig, logger);
    vi.spyOn(provider, 'getAllItems').mockResolvedValue(items);
    return provider.readReportedFacts();
  }

  it("reports each item's facts by its item id", async () => {
    const facts = await reportedFor([
      {
        Id: 'jf-101',
        Name: 'M',
        Type: 'Movie',
        DateCreated: '2020-01-01T00:00:00.000Z',
        PremiereDate: '1999-03-31T00:00:00.000Z',
        RunTimeTicks: 73_200_000_000,
        Studios: [{ Name: 'Legendary Pictures' }],
        Tags: ['4K'],
        UserData: { PlayCount: 5, LastPlayedDate: '2024-01-01T00:00:00.000Z', IsFavorite: true },
        MediaSources: [
          {
            Container: 'mkv',
            Size: 123,
            MediaStreams: [
              { Type: 'Video', Codec: 'hevc', Height: 2160 },
              { Type: 'Audio', Codec: 'eac3' },
            ],
          },
        ],
      },
    ]);

    expect(facts).toEqual(
      new Map([
        [
          'jf-101',
          {
            playCount: 5,
            lastWatchedAt: '2024-01-01T00:00:00.000Z',
            addedToMediaServerAt: '2020-01-01T00:00:00.000Z',
            studio: 'Legendary Pictures',
            runtimeMinutes: 122,
            fileSizeBytes: 123,
            releaseDate: '1999-03-31T00:00:00.000Z',
            fileContainer: 'mkv',
            videoCodec: 'hevc',
            audioCodec: 'eac3',
            fileResolution: '2160',
            labels: ['4K'],
            isFavorite: true,
          },
        ],
      ])
    );
  });

  it('counts an item marked played with no play count as one play', async () => {
    const facts = await reportedFor([
      { Id: 'jf-101', Name: 'M', Type: 'Movie', UserData: { Played: true } },
    ]);

    expect(facts.get('jf-101')).toEqual({ playCount: 1 });
  });

  it('reports no play as a play count of 0, and leaves out every fact the item does not carry', async () => {
    const facts = await reportedFor([
      { Id: 'jf-101', Name: 'M', Type: 'Movie', Tags: [], MediaSources: [{}] },
    ]);

    expect(facts.get('jf-101')).toEqual({ playCount: 0 });
  });

  it('reports each resolution tier from the video height', async () => {
    const heights = [2160, 1080, 720, 480];
    const facts = await reportedFor(
      heights.map((Height) => ({
        Id: `jf-${Height}`,
        Name: 'M',
        Type: 'Movie',
        MediaSources: [{ MediaStreams: [{ Type: 'Video', Height }] }],
      }))
    );

    expect(heights.map((h) => facts.get(`jf-${h}`)?.fileResolution)).toEqual([
      '2160',
      '1080',
      '720',
      'sd',
    ]);
  });
});
