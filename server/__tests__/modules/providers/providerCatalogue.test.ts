import { MetadataProviderType } from '@server/database/schema';
import { PROVIDER_CATALOGUE } from '@server/modules/providers/providerCatalogue';
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
});
