import { getChildLogger } from '@server/kernel/logger';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import { TvMazeProvider } from '@server/modules/providers/connections/tvmazeProvider';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const log = getChildLogger('TestTvMazeProvider');

const mockProvider: ProviderConfig = {
  name: 'Test TVMaze',
  url: 'https://api.tvmaze.com',
  apiKey: '',
  settings: null,
};

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('TvMazeProvider.lookupByTvdbId', () => {
  it('resolves a TVmaze id from a thetvdb lookup', async () => {
    server.use(
      http.get('https://api.tvmaze.com/lookup/shows', ({ request }) => {
        const tvdb = new URL(request.url).searchParams.get('thetvdb');
        if (tvdb === '81189') return HttpResponse.json({ id: 169, name: 'Breaking Bad' });
        return new HttpResponse(null, { status: 404 });
      })
    );
    const provider = new TvMazeProvider(mockProvider, log);

    expect(await provider.lookupByTvdbId(81189)).toEqual({ id: 169 });
  });

  it('returns null when no show matches the tvdb id', async () => {
    server.use(
      http.get('https://api.tvmaze.com/lookup/shows', () => new HttpResponse(null, { status: 404 }))
    );
    const provider = new TvMazeProvider(mockProvider, log);

    expect(await provider.lookupByTvdbId(999999)).toBeNull();
  });
});
