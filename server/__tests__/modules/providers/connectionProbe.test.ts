import { MetadataProviderType } from '@server/database/schema';
import { probeConnection } from '@server/modules/providers/connectionProbe';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

/**
 * The connection probe per provider type. The API refuses to probe a type that
 * is not offered, so the deferred TVMAZE case is covered here, at the probe
 * itself, ready for when the type is offered.
 */
describe('probeConnection', () => {
  describe('TVMAZE', () => {
    it('resolves without making any outbound HTTP call', async () => {
      const tvmazeRequests: string[] = [];
      const listener = ({ request }: { request: Request }) => {
        if (new URL(request.url).hostname.includes('tvmaze')) tvmazeRequests.push(request.url);
      };
      server.events.on('request:start', listener);

      await expect(
        probeConnection(MetadataProviderType.TVMAZE, 'https://api.tvmaze.com')
      ).resolves.toBeUndefined();
      expect(tvmazeRequests).toHaveLength(0);

      server.events.removeListener('request:start', listener);
    });
  });

  describe('a key is proved, not assumed', () => {
    it('fails without a required key, contacting nothing', async () => {
      await expect(
        probeConnection(MetadataProviderType.PLEX, 'http://plex.local:32400')
      ).rejects.toThrow(/Enter the API key/);
    });

    it('asks Plex for something only a valid token can read', async () => {
      let token: string | null = null;
      server.use(
        http.get('http://plex.local:32400/library/sections', ({ request }) => {
          token = request.headers.get('X-Plex-Token');
          return HttpResponse.json({ MediaContainer: {} });
        })
      );
      await probeConnection(MetadataProviderType.PLEX, 'http://plex.local:32400', 'tok');
      expect(token).toBe('tok');
    });

    it('rejects a key Plex refuses', async () => {
      server.use(
        http.get(
          'http://plex.local:32400/library/sections',
          () => new HttpResponse(null, { status: 401 })
        )
      );
      await expect(
        probeConnection(MetadataProviderType.PLEX, 'http://plex.local:32400', 'bad')
      ).rejects.toThrow();
    });

    it('rejects a key Jellyfin refuses', async () => {
      server.use(
        http.get(
          'http://jellyfin.local:8096/System/Info',
          () => new HttpResponse(null, { status: 401 })
        )
      );
      await expect(
        probeConnection(MetadataProviderType.JELLYFIN, 'http://jellyfin.local:8096', 'bad')
      ).rejects.toThrow();
    });
  });

  describe('SEERR', () => {
    const SEERR_URL = 'http://seerr.local';

    it('resolves when the upstream /api/v1/auth/me responds 200', async () => {
      server.use(
        http.get(`${SEERR_URL}/api/v1/auth/me`, () => HttpResponse.json({ status: 'ok' }))
      );

      await expect(
        probeConnection(MetadataProviderType.SEERR, SEERR_URL, 'test-key')
      ).resolves.toBeUndefined();
    });

    it('rejects when the upstream /api/v1/auth/me responds 4xx', async () => {
      server.use(
        http.get(`${SEERR_URL}/api/v1/auth/me`, () =>
          HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
        )
      );

      await expect(
        probeConnection(MetadataProviderType.SEERR, SEERR_URL, 'bad-key')
      ).rejects.toThrow();
    });

    it('rejects when the upstream /api/v1/auth/me responds 5xx', async () => {
      server.use(
        http.get(`${SEERR_URL}/api/v1/auth/me`, () =>
          HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
        )
      );

      await expect(
        probeConnection(MetadataProviderType.SEERR, SEERR_URL, 'any-key')
      ).rejects.toThrow();
    });

    it('sends the apiKey in the X-Api-Key header (not as a query param)', async () => {
      const API_KEY = 'secret-seerr-key';
      let capturedHeader: string | null = null;
      let capturedSearchParams: string | null = null;
      server.use(
        http.get(`${SEERR_URL}/api/v1/auth/me`, ({ request }) => {
          capturedHeader = request.headers.get('X-Api-Key');
          capturedSearchParams = new URL(request.url).searchParams.toString();
          return HttpResponse.json({ status: 'ok' });
        })
      );

      await probeConnection(MetadataProviderType.SEERR, SEERR_URL, API_KEY);

      expect(capturedHeader).toBe(API_KEY);
      expect(capturedSearchParams).not.toContain(API_KEY);
    });
  });
});
