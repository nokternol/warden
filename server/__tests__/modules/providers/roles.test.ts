import { MetadataProviderType } from '@server/database/schema';
import {
  SOURCE_OWNER_BY_KIND,
  isMediaSourceType,
  kindOfSourceType,
} from '@server/modules/providers/roles';
import { describe, expect, it } from 'vitest';

describe('SOURCE_OWNER_BY_KIND', () => {
  it('names Radarr as the movie catalog owner and Sonarr as the series catalog owner', () => {
    expect(SOURCE_OWNER_BY_KIND.movie).toBe(MetadataProviderType.RADARR);
    expect(SOURCE_OWNER_BY_KIND.series).toBe(MetadataProviderType.SONARR);
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

describe('kindOfSourceType', () => {
  it('maps a catalog-owning provider type to its media kind', () => {
    expect(kindOfSourceType(MetadataProviderType.RADARR)).toBe('movie');
    expect(kindOfSourceType(MetadataProviderType.SONARR)).toBe('series');
  });

  it('is undefined for a provider type that owns no catalog', () => {
    expect(kindOfSourceType(MetadataProviderType.TMDB)).toBeUndefined();
  });
});
