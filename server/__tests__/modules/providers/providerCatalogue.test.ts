import { MetadataProviderType } from '@server/database/schema';
import {
  ADDRESS_COLUMN_BY_TYPE,
  MEDIA_SERVER_BY_COLUMN,
  PROVIDER_CATALOGUE,
  SOURCE_OWNER,
  contentTypeOfSourceType,
  isMediaSourceType,
} from '@server/modules/providers/providerCatalogue';
import { describe, expect, it } from 'vitest';

describe('the provider catalogue', () => {
  it('says which types need an API key', () => {
    expect(PROVIDER_CATALOGUE[MetadataProviderType.RADARR].apiKeyRequired).toBe(true);
    expect(PROVIDER_CATALOGUE[MetadataProviderType.TVMAZE].apiKeyRequired).toBe(false);
  });

  it('gives each self-hosted type a host placeholder on its own default port', () => {
    expect(PROVIDER_CATALOGUE[MetadataProviderType.PLEX].hostPlaceholder).toBe(
      'http://localhost:32400'
    );
    expect(PROVIDER_CATALOGUE[MetadataProviderType.SONARR].hostPlaceholder).toBe(
      'http://localhost:8989'
    );
  });

  it("reads each content type's source owner from the declared sources", () => {
    expect(SOURCE_OWNER).toEqual({
      movie: MetadataProviderType.RADARR,
      series: MetadataProviderType.SONARR,
    });
  });

  it('reads how each type addresses titles, and each column’s media server, from the declarations', () => {
    expect(ADDRESS_COLUMN_BY_TYPE).toEqual({
      [MetadataProviderType.PLEX]: 'plexRatingKey',
      [MetadataProviderType.JELLYFIN]: 'jellyfinItemId',
      [MetadataProviderType.TAUTULLI]: 'plexRatingKey',
    });
    expect(MEDIA_SERVER_BY_COLUMN).toEqual({
      plexRatingKey: MetadataProviderType.PLEX,
      jellyfinItemId: MetadataProviderType.JELLYFIN,
    });
  });
});

describe('isMediaSourceType', () => {
  it('is true for the two catalog-owning provider types', () => {
    expect(isMediaSourceType(MetadataProviderType.RADARR)).toBe(true);
    expect(isMediaSourceType(MetadataProviderType.SONARR)).toBe(true);
  });

  it('is false for a provider type that does not own a catalog', () => {
    expect(isMediaSourceType(MetadataProviderType.TMDB)).toBe(false);
  });
});

describe('contentTypeOfSourceType', () => {
  it('maps a catalog-owning provider type to its media kind', () => {
    expect(contentTypeOfSourceType(MetadataProviderType.RADARR)).toBe('movie');
    expect(contentTypeOfSourceType(MetadataProviderType.SONARR)).toBe('series');
  });

  it('is undefined for a provider type that owns no catalog', () => {
    expect(contentTypeOfSourceType(MetadataProviderType.TMDB)).toBeUndefined();
  });
});
