import type { ProviderTypeDescriptor } from '@contract/providers';
import { MetadataProviderType } from '@server/database/schema';

/** How a provider type is presented and reached when it is configured. */
export type ProviderTypeEntry = Omit<ProviderTypeDescriptor, 'type'>;

/**
 * Every provider type Warden knows, in display order. `satisfies` keeps each
 * entry's own shape, so a hosted type's `defaultUrl` is known to be present.
 */
export const PROVIDER_CATALOGUE = {
  [MetadataProviderType.PLEX]: {
    label: 'Plex',
    apiPath: '',
    filterData: ['Library contents', 'Item metadata'],
  },
  [MetadataProviderType.JELLYFIN]: {
    label: 'Jellyfin',
    apiPath: '',
    filterData: ['Library contents', 'Item metadata'],
  },
  [MetadataProviderType.RADARR]: {
    label: 'Radarr',
    apiPath: '/api/v3',
    filterData: ['Movie library', 'Quality profiles', 'Tags'],
  },
  [MetadataProviderType.SONARR]: {
    label: 'Sonarr',
    apiPath: '/api/v3',
    filterData: ['Series library', 'Quality profiles', 'Tags'],
  },
  [MetadataProviderType.TAUTULLI]: {
    label: 'Tautulli',
    apiPath: '',
    filterData: ['Watch history', 'Play statistics', 'User activity'],
  },
  [MetadataProviderType.OVERSEERR]: {
    label: 'Overseerr',
    apiPath: '',
    filterData: ['Request queue'],
  },
  [MetadataProviderType.SEERR]: {
    label: 'Seerr',
    apiPath: '',
    filterData: ['Request queue'],
  },
  [MetadataProviderType.TMDB]: {
    label: 'TMDB',
    apiPath: '',
    defaultUrl: 'https://api.themoviedb.org/3',
    filterData: ['Ratings', 'Metadata'],
  },
  [MetadataProviderType.OMDB]: {
    label: 'OMDB',
    apiPath: '',
    defaultUrl: 'http://www.omdbapi.com',
    filterData: ['Ratings', 'Metadata'],
  },
  [MetadataProviderType.TVMAZE]: {
    label: 'TVmaze',
    apiPath: '',
    defaultUrl: 'https://api.tvmaze.com',
    filterData: ['Network'],
  },
} satisfies Record<MetadataProviderType, ProviderTypeEntry>;

/** Each provider type with its catalogue entry, in display order. */
export function describeProviderTypes(): ProviderTypeDescriptor[] {
  return (Object.entries(PROVIDER_CATALOGUE) as [MetadataProviderType, ProviderTypeEntry][]).map(
    ([type, entry]) => ({ type, ...entry })
  );
}
