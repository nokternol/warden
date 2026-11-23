import { getChildLogger } from '@server/kernel/logger';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import {
  type PlexMediaItem,
  PlexProvider,
} from '@server/modules/providers/connections/plexProvider';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

const logger = getChildLogger('TestPlexProvider');

const PLEX_URL = 'http://localhost:32400';

const mockConfig: ProviderConfig = {
  name: 'Test Plex',
  url: PLEX_URL,
  apiKey: 'fake-plex-token',
  settings: {},
};

afterEach(() => server.resetHandlers());

describe('PlexProvider', () => {
  const provider = new PlexProvider(mockConfig, logger);

  it('fetches and parses libraries correctly', async () => {
    const libraries = await provider.getLibraries();
    expect(libraries).toHaveLength(2);
    expect(libraries[0].title).toBe('Movies');
    expect(libraries[0].type).toBe('movie');
    expect(libraries[0].key).toBe('1');
  });

  it('fetches and parses library contents correctly', async () => {
    const items = await provider.getLibraryContents('1');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('The Matrix');
    expect(items[0].type).toBe('movie');
    expect(items[0].year).toBe(1999);
  });

  it('fetches contents for a different library section', async () => {
    const items = await provider.getLibraryContents('2');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Breaking Bad');
    expect(items[0].type).toBe('show');
  });

  it('getLibraryContents passes through viewCount and lastViewedAt when present', async () => {
    const items = await provider.getLibraryContents('1');
    expect(items[0].viewCount).toBe(3);
    expect(items[0].lastViewedAt).toBe(1700000000);
  });

  it('reads a section whose answer has no Metadata as an empty section', async () => {
    server.use(
      http.get(`${PLEX_URL}/library/sections/3/all`, () =>
        HttpResponse.json({ MediaContainer: { size: 0 } })
      )
    );
    expect(await provider.getLibraryContents('3')).toEqual([]);
  });
});

describe('PlexProvider — actuator tasks', () => {
  const provider = new PlexProvider(mockConfig, logger);
  const task = (id: string) => provider.tasks().find((t) => t.id === id)!;

  it('declares exactly the realisable vocabulary — moveToTrash is not a task', () => {
    expect(provider.tasks().map((t) => t.id)).toEqual([
      'deleteFromLibrary',
      'refreshMetadata',
      'markPlayed',
      'markUnplayed',
    ]);
  });

  it('deleteFromLibrary sends DELETE /library/metadata/{ratingKey} with the token for each id', async () => {
    const deleted: Array<{ key: string; token: string | null }> = [];
    server.use(
      http.delete(`${PLEX_URL}/library/metadata/:key`, ({ params, request }) => {
        deleted.push({
          key: params.key as string,
          token: request.headers.get('X-Plex-Token'),
        });
        return new HttpResponse(null, { status: 200 });
      })
    );

    await task('deleteFromLibrary').run(['101', '102']);

    expect(deleted.map((d) => d.key).sort()).toEqual(['101', '102']);
    expect(deleted.every((d) => d.token === 'fake-plex-token')).toBe(true);
  });

  it('refreshMetadata sends PUT /library/metadata/{ratingKey}/refresh for each id', async () => {
    const refreshed: string[] = [];
    server.use(
      http.put(`${PLEX_URL}/library/metadata/:key/refresh`, ({ params }) => {
        refreshed.push(params.key as string);
        return new HttpResponse(null, { status: 200 });
      })
    );

    await task('refreshMetadata').run(['101']);

    expect(refreshed).toEqual(['101']);
  });

  it('markPlayed scrobbles each rating key with the library identifier', async () => {
    const calls: Array<{ key: string | null; identifier: string | null }> = [];
    server.use(
      http.get(/\/:\/scrobble/, ({ request }) => {
        const url = new URL(request.url);
        calls.push({
          key: url.searchParams.get('key'),
          identifier: url.searchParams.get('identifier'),
        });
        return new HttpResponse(null, { status: 200 });
      })
    );

    await task('markPlayed').run(['201']);

    expect(calls).toEqual([{ key: '201', identifier: 'com.plexapp.plugins.library' }]);
  });

  it('markUnplayed unscrobbles each rating key with the library identifier', async () => {
    const calls: Array<{ key: string | null; identifier: string | null }> = [];
    server.use(
      http.get(/\/:\/unscrobble/, ({ request }) => {
        const url = new URL(request.url);
        calls.push({
          key: url.searchParams.get('key'),
          identifier: url.searchParams.get('identifier'),
        });
        return new HttpResponse(null, { status: 200 });
      })
    );

    await task('markUnplayed').run(['201']);

    expect(calls).toEqual([{ key: '201', identifier: 'com.plexapp.plugins.library' }]);
  });
});

describe('PlexProvider — deleting an item already gone', () => {
  const provider = new PlexProvider(mockConfig, logger);

  it('counts a delete answered 404 as done', async () => {
    server.use(
      http.delete(
        `${PLEX_URL}/library/metadata/:key`,
        () => new HttpResponse(null, { status: 404 })
      )
    );

    await expect(provider.deleteFromLibrary(['101'])).resolves.toBeUndefined();
  });
});

describe('PlexProvider — reported facts', () => {
  /** The facts Plex reports when its libraries hold exactly `items`. */
  async function reportedFor(items: PlexMediaItem[]) {
    const provider = new PlexProvider(mockConfig, logger);
    vi.spyOn(provider, 'getAllItems').mockResolvedValue(items);
    return provider.readReportedFacts();
  }

  it("reports each item's facts by its rating key", async () => {
    const facts = await reportedFor([
      {
        ratingKey: 'plex-101',
        title: 'M',
        type: 'movie',
        viewCount: 2,
        lastViewedAt: 1700000000,
        addedAt: 1600000000,
        studio: 'Legendary Pictures',
        duration: 7_320_000,
        originallyAvailableAt: '1999-03-31',
        Label: [{ tag: '4K' }],
        Media: [
          {
            container: 'mkv',
            videoCodec: 'h264',
            audioCodec: 'aac',
            videoResolution: '1080',
            Part: [{ size: 123 }],
          },
        ],
      },
    ]);

    expect(facts).toEqual(
      new Map([
        [
          'plex-101',
          {
            playCount: 2,
            lastWatchedAt: new Date(1700000000 * 1000).toISOString(),
            addedToMediaServerAt: new Date(1600000000 * 1000).toISOString(),
            studio: 'Legendary Pictures',
            runtimeMinutes: 122,
            fileSizeBytes: 123,
            releaseDate: '1999-03-31',
            fileContainer: 'mkv',
            videoCodec: 'h264',
            audioCodec: 'aac',
            fileResolution: '1080',
            labels: ['4K'],
          },
        ],
      ])
    );
  });

  it('reports no play as a play count of 0, and leaves out every fact the item does not carry', async () => {
    const facts = await reportedFor([
      { ratingKey: 'plex-101', title: 'M', type: 'movie', Label: [], Media: [{}] },
    ]);

    expect(facts.get('plex-101')).toEqual({ playCount: 0 });
  });
});
