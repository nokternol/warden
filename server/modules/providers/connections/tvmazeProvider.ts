import { BaseProviderConnection } from './baseProviderConnection';

export class TvMazeProvider extends BaseProviderConnection {
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
