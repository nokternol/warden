import { type MetadataProvider, MetadataProviderType } from '@server/database/schema';
import { getChildLogger } from '@server/kernel/logger';
import { RadarrProvider } from '@server/modules/providers/connections/radarrProvider';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

const mockLogger = getChildLogger('TestBaseProviderConnection');

const savedBehindProxy: MetadataProvider = {
  id: 1,
  type: MetadataProviderType.RADARR,
  name: 'Test Radarr',
  url: 'http://h:7878/radarr/api/v3',
  apiKey: 'my-secret-key',
  settings: { urlBase: '/radarr' },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('BaseProviderConnection', () => {
  afterEach(() => server.resetHandlers());

  it('reaches exactly the stored address: what the owner entered plus the API path', async () => {
    const reached: string[] = [];
    server.use(
      http.get('http://h:7878/*', ({ request }) => {
        reached.push(new URL(request.url).pathname);
        return HttpResponse.json([]);
      })
    );

    await new RadarrProvider(savedBehindProxy, mockLogger).getMovies();

    expect(reached).toEqual(['/radarr/api/v3/movie']);
  });
});
