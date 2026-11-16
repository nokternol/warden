import { MetadataProviderType } from '@server/database/schema';
import { getChildLogger } from '@server/kernel/logger';
import { probeConnection } from '@server/modules/providers/connectionProbe';
import { ProviderFactory } from '@server/modules/providers/providerFactory';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

const factory = new ProviderFactory();
const log = getChildLogger('TestConnectionProbe');

/**
 * The connection probe: a test of the address and key the owner entered, made through the
 * connection runs use. The API refuses to probe a type that is not offered, so the deferred
 * TVMAZE case is covered here, at the probe itself, ready for when the type is offered.
 */
describe('probeConnection', () => {
  afterEach(() => server.resetHandlers());

  it('tests at the address runs use: the host as entered, then the type’s API path', async () => {
    const seen: Array<string | null> = [];
    server.use(
      http.get('http://h:7878/radarr/api/v3/system/status', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('apikey'));
        return HttpResponse.json({ version: '5' });
      }),
      http.get('http://h:32400/library/sections', ({ request }) => {
        seen.push(request.headers.get('X-Plex-Token'));
        return HttpResponse.json({ MediaContainer: {} });
      })
    );

    await probeConnection(
      factory,
      { type: MetadataProviderType.RADARR, url: 'http://h:7878/radarr', apiKey: 'k' },
      log
    );
    await probeConnection(
      factory,
      { type: MetadataProviderType.PLEX, url: 'http://h:32400', apiKey: 'tok' },
      log
    );

    expect(seen).toEqual(['k', 'tok']);
  });

  it('resolves for TVMAZE without making any outbound HTTP call', async () => {
    const requests: string[] = [];
    const listener = ({ request }: { request: Request }) => requests.push(request.url);
    server.events.on('request:start', listener);

    await expect(
      probeConnection(
        factory,
        { type: MetadataProviderType.TVMAZE, url: 'https://api.tvmaze.com' },
        log
      )
    ).resolves.toBeUndefined();

    server.events.removeListener('request:start', listener);
    expect(requests).toEqual([]);
  });

  describe('a key is proved, not assumed', () => {
    it('fails without a required key, contacting nothing', async () => {
      await expect(
        probeConnection(
          factory,
          { type: MetadataProviderType.PLEX, url: 'http://plex.local:32400' },
          log
        )
      ).rejects.toThrow(/Enter the API key/);
    });

    it('says, by the type’s label, that the key was refused when the address answered', async () => {
      server.use(
        http.get(
          'http://plex.local:32400/library/sections',
          () => new HttpResponse(null, { status: 401 })
        )
      );
      await expect(
        probeConnection(
          factory,
          { type: MetadataProviderType.PLEX, url: 'http://plex.local:32400', apiKey: 'bad' },
          log
        )
      ).rejects.toThrow('Plex refused this API key');
    });

    it('says the address could not be reached when nothing answered', async () => {
      server.use(http.get('http://plex.local:32400/library/sections', () => HttpResponse.error()));
      await expect(
        probeConnection(
          factory,
          { type: MetadataProviderType.PLEX, url: 'http://plex.local:32400', apiKey: 'tok' },
          log
        )
      ).rejects.toThrow("Couldn't reach Plex at this address");
    });

    it('says the service answered with an error otherwise', async () => {
      server.use(
        http.get('http://seerr.local/api/v1/auth/me', () => new HttpResponse(null, { status: 500 }))
      );
      await expect(
        probeConnection(
          factory,
          { type: MetadataProviderType.SEERR, url: 'http://seerr.local', apiKey: 'k' },
          log
        )
      ).rejects.toThrow('Seerr answered with an error (500)');
    });
  });
});
