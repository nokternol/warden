import { MetadataProviderType } from '@server/database/schema';

/** How a provider type is presented when it is configured. */
export interface ProviderTypeEntry {
  type: MetadataProviderType;
  label: string;
}

/** Every provider type Warden knows, in display order. */
export const PROVIDER_CATALOGUE: readonly ProviderTypeEntry[] = [
  { type: MetadataProviderType.PLEX, label: 'Plex' },
  { type: MetadataProviderType.JELLYFIN, label: 'Jellyfin' },
  { type: MetadataProviderType.RADARR, label: 'Radarr' },
  { type: MetadataProviderType.SONARR, label: 'Sonarr' },
  { type: MetadataProviderType.TAUTULLI, label: 'Tautulli' },
  { type: MetadataProviderType.OVERSEERR, label: 'Overseerr' },
  { type: MetadataProviderType.SEERR, label: 'Seerr' },
  { type: MetadataProviderType.TMDB, label: 'TMDB' },
  { type: MetadataProviderType.OMDB, label: 'OMDB' },
  { type: MetadataProviderType.TVMAZE, label: 'TVmaze' },
];
