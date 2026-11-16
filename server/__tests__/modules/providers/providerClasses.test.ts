import { MetadataProviderType } from '@server/database/schema';
import { PROVIDER_CLASSES } from '@server/modules/providers/providerClasses';
import { describe, expect, it } from 'vitest';

/**
 * Each provider type declares what it can do once, on its connection class, and the class map is
 * the one place those declarations are read from.
 */
describe('the provider class map', () => {
  it('declares, per provider type, the catalog it owns and how it addresses titles', () => {
    const declared = Object.fromEntries(
      Object.entries(PROVIDER_CLASSES).map(([type, connection]) => [
        type,
        connection.catalogueEntry.capabilities,
      ])
    );

    expect(declared).toEqual({
      [MetadataProviderType.PLEX]: { mediaServer: 'plexRatingKey' },
      [MetadataProviderType.JELLYFIN]: { mediaServer: 'jellyfinItemId' },
      [MetadataProviderType.RADARR]: { source: 'movie' },
      [MetadataProviderType.SONARR]: { source: 'series' },
      [MetadataProviderType.TAUTULLI]: { addressedBy: 'plexRatingKey' },
      [MetadataProviderType.SEERR]: {},
      [MetadataProviderType.TMDB]: {},
      [MetadataProviderType.OMDB]: {},
      [MetadataProviderType.TVMAZE]: {},
    });
  });
});
