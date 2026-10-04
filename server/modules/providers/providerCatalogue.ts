import type { ProviderTypeDescriptor } from '@contract/providers';
import { MetadataProviderType } from '@server/database/schema';

/** How a provider type is presented and reached when it is configured. */
export type ProviderTypeEntry = Omit<ProviderTypeDescriptor, 'type'>;

/** Every provider type Warden knows, in display order. */
export const PROVIDER_CATALOGUE: Record<MetadataProviderType, ProviderTypeEntry> = {
  [MetadataProviderType.PLEX]: {
    label: 'Plex',
    apiPath: '',
    capabilities: ['Library contents', 'Item metadata'],
  },
  [MetadataProviderType.JELLYFIN]: {
    label: 'Jellyfin',
    apiPath: '',
    capabilities: ['Library contents', 'Item metadata'],
  },
  [MetadataProviderType.RADARR]: {
    label: 'Radarr',
    apiPath: '/api/v3',
    capabilities: ['Movie library', 'Quality profiles', 'Tags'],
  },
  [MetadataProviderType.SONARR]: {
    label: 'Sonarr',
    apiPath: '/api/v3',
    capabilities: ['Series library', 'Quality profiles', 'Tags'],
  },
  [MetadataProviderType.TAUTULLI]: {
    label: 'Tautulli',
    apiPath: '',
    capabilities: ['Watch history', 'Play statistics', 'User activity'],
  },
  [MetadataProviderType.OVERSEERR]: {
    label: 'Overseerr',
    apiPath: '',
    capabilities: ['Request queue'],
  },
  [MetadataProviderType.SEERR]: {
    label: 'Seerr',
    apiPath: '',
    capabilities: ['Request queue'],
  },
  [MetadataProviderType.TMDB]: {
    label: 'TMDB',
    apiPath: '',
    defaultUrl: 'https://api.themoviedb.org/3',
    capabilities: ['Ratings', 'Metadata'],
  },
  [MetadataProviderType.OMDB]: {
    label: 'OMDB',
    apiPath: '',
    defaultUrl: 'http://www.omdbapi.com',
    capabilities: ['Ratings', 'Metadata'],
  },
  [MetadataProviderType.TVMAZE]: {
    label: 'TVmaze',
    apiPath: '',
    defaultUrl: 'https://api.tvmaze.com',
    capabilities: ['Network'],
  },
};

/** Each provider type with its catalogue entry, in display order. */
export function describeProviderTypes(): (ProviderTypeEntry & { type: MetadataProviderType })[] {
  return (Object.entries(PROVIDER_CATALOGUE) as [MetadataProviderType, ProviderTypeEntry][]).map(
    ([type, entry]) => ({ type, ...entry })
  );
}
