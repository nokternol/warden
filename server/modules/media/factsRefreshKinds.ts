import { MetadataProviderType } from '@server/database/schema';

/**
 * The provider types whose facts the enrichment job refreshes into the copy. Facts are declared
 * here by provider type, unlike the capabilities the connection classes declare on themselves; the
 * fracture ledger records this as a departure from north-star belief 9 (#246).
 */
export const FACTS_REFRESHING_TYPES: ReadonlySet<MetadataProviderType> = new Set([
  MetadataProviderType.PLEX,
  MetadataProviderType.JELLYFIN,
  MetadataProviderType.TAUTULLI,
  MetadataProviderType.SEERR,
  MetadataProviderType.TMDB,
]);
