import { getChildLogger } from '@server/kernel/logger';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import { SeerrProvider } from '@server/modules/providers/connections/seerrProvider';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

const logger = getChildLogger('TestSeerrProvider');

// Seerr is API-compatible with Overseerr, so one provider serves both kinds of server.
describe.each([
  { server: 'an Overseerr server', url: 'http://localhost:5055' },
  { server: 'a Seerr server', url: 'http://localhost:5056' },
])('SeerrProvider pointed at $server', ({ url }) => {
  const config: ProviderConfig = { name: 'Test Seerr', url, apiKey: 'fake-api-key', settings: {} };
  const provider = new SeerrProvider(config, logger);

  it('fetches and parses requests correctly', async () => {
    const requests = await provider.getRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].type).toBe('movie');
    expect(requests[0].media.tmdbId).toBe(603);
  });

  it('getIssues() returns all issues with id, status and media.tmdbId', async () => {
    const issues = await provider.getIssues();
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ id: 1, status: 1, media: { tmdbId: 603 } });
    expect(issues[1]).toMatchObject({ id: 2, status: 1, media: { tmdbId: 704 } });
  });

  it('reads every page of requests, not just the first', async () => {
    const skips: string[] = [];
    server.use(
      http.get('http://seerr-paged.local/api/v1/request', ({ request }) => {
        const skip = Number(new URL(request.url).searchParams.get('skip'));
        skips.push(String(skip));
        const count = skip === 0 ? 100 : 7;
        return HttpResponse.json({
          pageInfo: {},
          results: Array.from({ length: count }, (_, i) => ({ id: skip + i })),
        });
      })
    );
    const requests = await new SeerrProvider(
      { url: 'http://seerr-paged.local', apiKey: 'k' } as never,
      { debug() {}, info() {}, warn() {}, error() {} } as never
    ).getRequests();
    expect(requests).toHaveLength(107);
    expect(skips).toEqual(['0', '100']);
  });
});
