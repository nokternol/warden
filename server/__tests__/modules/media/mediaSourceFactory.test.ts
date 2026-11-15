import { type MetadataProvider, MetadataProviderType } from '@server/database/schema';
import { MediaSourceFactory } from '@server/modules/media/mediaSourceFactory';
import { SonarrProvider } from '@server/modules/providers/connections/sonarrProvider';
import { ProviderFactory } from '@server/modules/providers/providerFactory';
import type { ProviderSettingsService } from '@server/modules/providers/providerSettingsService';
import { describe, expect, it } from 'vitest';

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
