/**
 * Compile-time check, enforced by `yarn typecheck:server`: the class map refuses a connection class
 * that declares a capability without implementing the role interface it requires. Never run.
 */
import { MetadataProviderType } from '@server/database/schema';
import { BaseProviderConnection } from '@server/modules/providers/connections/baseProviderConnection';
import { defineProviderClasses } from '@server/modules/providers/providerClasses';
import type { ProviderTypeEntry } from '@server/modules/providers/roles';

/** Declares it owns the movie catalog, but cannot read it: no `getMovies`. */
class MovieSourceWithoutMovies extends BaseProviderConnection {
  static readonly catalogueEntry = {
    label: 'Unreadable',
    apiKeyRequired: true,
    hostPlaceholder: 'http://localhost:1',
    apiPath: '',
    filterData: [],
    capabilities: { source: 'movie' },
  } as const satisfies ProviderTypeEntry;

  async testConnection(): Promise<void> {}

  getTags = async () => [];
  getProfiles = async () => [];
  getRootFolders = async () => [];
}

// @ts-expect-error a class declaring `source: 'movie'` must construct a MovieSource
defineProviderClasses({ [MetadataProviderType.RADARR]: MovieSourceWithoutMovies });

/** Hosted (no host to enter) but with no `defaultUrl`, so nothing says where it is reached. */
export const hostedWithoutAddress = {
  label: 'Nowhere',
  apiKeyRequired: false,
  apiPath: '',
  filterData: [],
  capabilities: {},
  // @ts-expect-error an entry without a host placeholder must carry its `defaultUrl`
} as const satisfies ProviderTypeEntry;
