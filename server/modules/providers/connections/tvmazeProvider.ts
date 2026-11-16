import type { ProviderTypeEntry } from '../roles';
import { BaseProviderConnection } from './baseProviderConnection';

export class TvMazeProvider extends BaseProviderConnection {
  /** How this provider type is presented, reached and what it can do. */
  static readonly catalogueEntry = {
    label: 'TVmaze',
    apiKeyRequired: false,
    apiPath: '',
    defaultUrl: 'https://api.tvmaze.com',
    filterData: ['Network'],
    capabilities: {},
  } as const satisfies ProviderTypeEntry;

  /** Resolve a TVmaze show id from a TheTVDB id, or null when unmatched. */
  public async lookupByTvdbId(tvdbId: number): Promise<{ id: number } | null> {
    try {
      const show = await this.client
        .get('lookup/shows', { searchParams: { thetvdb: tvdbId } })
        .json<{ id: number }>();
      return { id: show.id };
    } catch {
      return null;
    }
  }
}
