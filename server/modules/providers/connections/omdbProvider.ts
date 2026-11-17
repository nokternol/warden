import type { ProviderTypeEntry } from '../roles';
import { BaseProviderConnection } from './baseProviderConnection';

/**
 * The OMDb connection ProviderFactory builds for the OMDB provider type. The
 * type is deferred and nothing reads from OMDb, so the connection carries only
 * its catalogue entry and its connection test.
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

  /** One call that needs the key, so a wrong key fails the test. */
  async testConnection(): Promise<void> {
    await this.client
      .get('', { searchParams: { apikey: this.provider.apiKey ?? '', t: 'test' } })
      .json();
  }
}
