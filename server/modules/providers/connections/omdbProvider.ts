import type { ProviderTypeEntry } from '../roles';
import { BaseProviderConnection } from './baseProviderConnection';

/**
 * The OMDb connection ProviderFactory builds for the OMDB provider type. The
 * type is deferred and nothing reads from OMDb, so the connection carries only
 * what the base class gives every provider.
 */
export class OmdbProvider extends BaseProviderConnection {
  /** How this provider type is presented, reached and what it can do. */
  static readonly catalogueEntry = {
    label: 'OMDB',
    apiKeyRequired: true,
    apiPath: '',
    defaultUrl: 'http://www.omdbapi.com',
    filterData: [],
    capabilities: {},
  } as const satisfies ProviderTypeEntry;
}
