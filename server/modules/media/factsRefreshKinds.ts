import { MetadataProviderType } from '@server/database/schema';

/**
 * The provider types whose facts the enrichment job refreshes into the copy. Facts are not yet
 * declared on the connection classes as the other capabilities are; #246 moves them there and
 * removes this table.
 */
export const FACTS_REFRESHING_TYPES: ReadonlySet<MetadataProviderType> = new Set([
  MetadataProviderType.PLEX,
  MetadataProviderType.JELLYFIN,
  MetadataProviderType.TAUTULLI,
  MetadataProviderType.SEERR,
  MetadataProviderType.TMDB,
]);
