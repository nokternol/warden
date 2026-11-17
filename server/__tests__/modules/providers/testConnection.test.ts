import { MetadataProviderType } from '@server/database/schema';
import { getChildLogger } from '@server/kernel/logger';
import { ProviderFactory } from '@server/modules/providers/providerFactory';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

const log = getChildLogger('TestConnectionTest');
const factory = new ProviderFactory();

/**
 * Per provider type: the stored URL, the one key-demanding call a connection test makes under it,
 * and where that call carries the key.
 */
const PROBES: Array<{
  type: MetadataProviderType;
  url: string;
  path: string;
  keyOf: (request: Request) => string | null;
}> = [
  {
    type: MetadataProviderType.RADARR,
    url: 'http://radarr.local:7878/radarr/api/v3',
    path: '/radarr/api/v3/system/status',
    keyOf: (r) => new URL(r.url).searchParams.get('apikey'),
  },
  {
    type: MetadataProviderType.SONARR,
    url: 'http://sonarr.local:8989/api/v3',
    path: '/api/v3/system/status',
    keyOf: (r) => new URL(r.url).searchParams.get('apikey'),
  },
  {
    type: MetadataProviderType.PLEX,
    url: 'http://plex.local:32400',
    path: '/library/sections',
    keyOf: (r) => r.headers.get('X-Plex-Token'),
  },
  {
    type: MetadataProviderType.JELLYFIN,
    url: 'http://jellyfin.local:8096',
    path: '/System/Info',
    keyOf: (r) =>
      r.headers.get('X-Emby-Authorization')?.match(/^MediaBrowser Token="(.*)"$/)?.[1] ?? null,
  },
  {
    type: MetadataProviderType.TAUTULLI,
    url: 'http://tautulli.local:8181',
    path: '/api/v2',
    keyOf: (r) => {
      const params = new URL(r.url).searchParams;
      return params.get('cmd') === 'get_server_info' ? params.get('apikey') : null;
    },
  },
  {
    type: MetadataProviderType.SEERR,
    url: 'http://seerr.local:5055',
    path: '/api/v1/auth/me',
    keyOf: (r) => r.headers.get('X-Api-Key'),
  },
  {
    type: MetadataProviderType.TMDB,
    url: 'http://tmdb.local/3',
    path: '/3/configuration',
    keyOf: (r) => new URL(r.url).searchParams.get('api_key'),
  },
  {
    type: MetadataProviderType.OMDB,
    url: 'http://omdb.local',
    path: '/',
    keyOf: (r) => new URL(r.url).searchParams.get('apikey'),
  },
];

function connection(type: MetadataProviderType, url: string, apiKey: string) {
  return factory.create({ type, name: 'Under test', url, apiKey, settings: null }, log);
}

describe('a connection tests itself', () => {
  afterEach(() => server.resetHandlers());

  it.each(PROBES)(
    '$type: one call that needs the key, under its stored address, with its own authentication',
    async ({ type, url, path, keyOf }) => {
      const seen: Array<string | null> = [];
      server.use(
        http.get(`${new URL(url).origin}${path}`, ({ request }) => {
          const key = keyOf(request);
          seen.push(key);
          return key === 'right' ? HttpResponse.json({}) : new HttpResponse(null, { status: 401 });
        })
      );

      await expect(connection(type, url, 'right').testConnection()).resolves.toBeUndefined();
      await expect(connection(type, url, 'wrong').testConnection()).rejects.toThrow();
      expect(seen).toEqual(['right', 'wrong']);
    }
  );

  it('TVMAZE: resolves without a call, since the public API needs no key', async () => {
    const requests: string[] = [];
    const listener = ({ request }: { request: Request }) => requests.push(request.url);
    server.events.on('request:start', listener);

    await expect(
      connection(MetadataProviderType.TVMAZE, 'https://api.tvmaze.com', '').testConnection()
    ).resolves.toBeUndefined();

    server.events.removeListener('request:start', listener);
    expect(requests).toEqual([]);
  });
});
