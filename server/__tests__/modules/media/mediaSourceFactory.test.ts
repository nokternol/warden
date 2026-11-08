import { type MetadataProvider, MetadataProviderType } from '@server/database/schema';
import { MediaSourceFactory } from '@server/modules/media/mediaSourceFactory';
import { SonarrProvider } from '@server/modules/providers/connections/sonarrProvider';
import { ProviderFactory } from '@server/modules/providers/providerFactory';
import type { ProviderSettingsService } from '@server/modules/providers/providerSettingsService';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

const settings = (overrides: Partial<MetadataProvider> = {}): MetadataProvider => ({
  id: 1,
  type: MetadataProviderType.RADARR,
  name: 'Radarr',
  url: 'http://localhost/api/v3',
  apiKey: 'k',
  settings: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const settingsServiceReturning = (active: MetadataProvider[]) =>
  ({ findActiveByTypes: async () => active }) as unknown as ProviderSettingsService;

const buildFactory = (active: MetadataProvider[]) =>
  new MediaSourceFactory({
    providerSettingsService: settingsServiceReturning(active),
    providerFactory: new ProviderFactory(),
  });

describe('MediaSourceFactory.sourcesFor', () => {
  afterEach(() => server.resetHandlers());

  it('returns one entry per active instance owning the content type, each carrying its providerId', async () => {
    server.use(
      http.get('http://localhost/api/v3/movie', () => HttpResponse.json([])),
      http.get('http://4k.local/api/v3/movie', () => HttpResponse.json([]))
    );

    const entries = await buildFactory([
      settings({ id: 1, name: 'Radarr' }),
      settings({ id: 2, name: 'Radarr 4k', url: 'http://4k.local/api/v3' }),
    ]).sourcesFor('movie');

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.providerId).sort()).toEqual([1, 2]);
    expect(entries.map((e) => e.name).sort()).toEqual(['Radarr', 'Radarr 4k']);
  });

  it("constructs each entry's source with its own providerId threaded through", async () => {
    server.use(
      http.get('http://localhost/api/v3/movie', () =>
        HttpResponse.json([{ id: 1, title: 'M', hasFile: true, monitored: true, tmdbId: 1 }])
      )
    );

    const [entry] = await buildFactory([settings({ id: 7 })]).sourcesFor('movie');

    const [item] = await entry.source.getMediaItems();
    expect(item._sourceIds.providerId).toBe(7);
  });

  it('returns an empty array when no instance owns the content type', async () => {
    const entries = await buildFactory([]).sourcesFor('movie');
    expect(entries).toEqual([]);
  });
});

describe('MediaSourceFactory.activeInstances', () => {
  it('returns every active instance owning the content type, each with its built connection', async () => {
    const asked: MetadataProviderType[][] = [];
    const factory = new MediaSourceFactory({
      providerSettingsService: {
        findActiveByTypes: async (types: MetadataProviderType[]) => {
          asked.push(types);
          return [
            settings({ id: 3, type: MetadataProviderType.SONARR, name: 'Sonarr' }),
            settings({ id: 4, type: MetadataProviderType.SONARR, name: 'Sonarr Anime' }),
          ];
        },
      } as unknown as ProviderSettingsService,
      providerFactory: new ProviderFactory(),
    });

    const instances = await factory.activeInstances('series');

    expect(asked).toEqual([[MetadataProviderType.SONARR]]);
    expect(instances.map(({ providerId, name }) => ({ providerId, name }))).toEqual([
      { providerId: 3, name: 'Sonarr' },
      { providerId: 4, name: 'Sonarr Anime' },
    ]);
    expect(instances.every((i) => i.provider instanceof SonarrProvider)).toBe(true);
  });
});
