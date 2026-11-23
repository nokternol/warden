import { MetadataProviderType } from '@server/database/schema';
import { PROVIDER_CLASSES } from '@server/modules/providers/providerClasses';
import type { ProviderCapabilities } from '@server/modules/providers/roles';
import { describe, expect, it } from 'vitest';

/**
 * Each provider type declares what it can do once, on its connection class, and the class map is
 * the one place those declarations are read from.
 */
describe('the provider class map', () => {
  it('declares, per provider type, the catalog it owns, how it addresses titles and what it reports', () => {
    const declared = Object.fromEntries(
      Object.entries(PROVIDER_CLASSES).map(([type, connection]) => [
        type,
        connection.catalogueEntry.capabilities,
      ])
    );

    // A media server's own fact list is pinned by its connection's tests.
    const reporting = { reports: expect.any(Array) };
    expect(declared).toEqual({
      [MetadataProviderType.PLEX]: { mediaServer: 'plexRatingKey', facts: reporting },
      [MetadataProviderType.JELLYFIN]: { mediaServer: 'jellyfinItemId', facts: reporting },
      [MetadataProviderType.RADARR]: { source: 'movie' },
      [MetadataProviderType.SONARR]: { source: 'series' },
      [MetadataProviderType.TAUTULLI]: {
        addressedBy: 'plexRatingKey',
        providerKind: 'watchHistory',
        facts: { reports: ['playCount', 'lastWatchedAt'] },
      },
      [MetadataProviderType.SEERR]: {
        providerKind: 'requestManager',
        facts: { reports: ['requestStatus', 'hasIssue'], matchedBy: 'tmdbId' },
      },
      [MetadataProviderType.TMDB]: {
        providerKind: 'metadata',
        facts: { reports: ['productionStatus'], matchedBy: 'tmdbId' },
      },
      [MetadataProviderType.OMDB]: {},
      [MetadataProviderType.TVMAZE]: {},
    });
  });

  it('has exactly one source per content type, the current rule (north-star belief 9)', () => {
    const sources = Object.values(PROVIDER_CLASSES).flatMap((connection) => {
      const declared: ProviderCapabilities = connection.catalogueEntry.capabilities;
      return declared.source === undefined ? [] : [declared.source];
    });

    expect([...sources].sort()).toEqual(['movie', 'series']);
  });
});
