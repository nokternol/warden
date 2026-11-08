import { BaseProviderConnection } from './baseProviderConnection';

/**
 * The OMDb connection ProviderFactory builds for the OMDB provider type. The
 * type is deferred and nothing reads from OMDb, so the connection carries only
 * what the base class gives every provider.
 */
export class OmdbProvider extends BaseProviderConnection {}
