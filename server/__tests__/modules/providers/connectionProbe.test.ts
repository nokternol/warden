import { MetadataProviderType } from '@server/database/schema';
import { probeConnection } from '@server/modules/providers/connectionProbe';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

/**
 * The connection probe for the deferred TVMAZE and SEERR types. The API
 * refuses to probe a type that is not offered, so these cases are covered
 * here, at the probe itself, ready for when the types are offered.
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

  describe('SEERR', () => {
    const SEERR_URL = 'http://seerr.local';

    it('resolves when the upstream /api/v1/status responds 200', async () => {
      server.use(http.get(`${SEERR_URL}/api/v1/status`, () => HttpResponse.json({ status: 'ok' })));

      await expect(
        probeConnection(MetadataProviderType.SEERR, SEERR_URL, 'test-key')
      ).resolves.toBeUndefined();
    });

    it('rejects when the upstream /api/v1/status responds 4xx', async () => {
      server.use(
        http.get(`${SEERR_URL}/api/v1/status`, () =>
          HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
        )
      );

      await expect(
        probeConnection(MetadataProviderType.SEERR, SEERR_URL, 'bad-key')
      ).rejects.toThrow();
    });

    it('rejects when the upstream /api/v1/status responds 5xx', async () => {
      server.use(
        http.get(`${SEERR_URL}/api/v1/status`, () =>
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
        http.get(`${SEERR_URL}/api/v1/status`, ({ request }) => {
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
