import type { EnrichmentFields } from './mediaFieldProvider';

/**
 * Every `EnrichmentFields` key, not a hand-picked subset — no field is movie-only or
 * series-only within `EnrichmentFields` itself (that distinction lives in
 * `sourceProviders`/`contentTypes` instead), so `NormalizedSeries` extends the identical
 * `Partial<EnrichmentFields>`. A new `EnrichmentFields` key is carried here
 * automatically; there is no separate list to remember to update, unlike the previous
 * hand-typed `Pick<EnrichmentFields, 'tags' | 'playCount' | ...>` union, which
 * compiled fine even when a key was silently missing from it.
 */
export interface NormalizedMovie extends Partial<EnrichmentFields> {
  _sourceIds: {
    radarr?: number;
    plex?: string;
    tmdb?: number;
    imdb?: string;
    jellyfin?: string;
    /** The configured instance this item came from — set by every source-produced item. */
    providerId?: number;
    /** The group this item was hydrated from — set only on enrichment-job hydrated items. */
    identity?: number;
  };
  title: string;
  year?: number;
  hasFile?: boolean;
  monitored?: boolean;
  qualityProfileId?: number;
  genres?: string[];
  addedDate?: string;
  sizeOnDiskBytes?: number;
  certification?: string;
  imdbRating?: number;
  tmdbRating?: number;
  /** Filesystem location — display only, no substring-match filter control exists yet. */
  folderName?: string;
  path?: string;
  movieFileCount?: number;
  releaseGroups?: string[];
  inCinemasDate?: string;
  physicalReleaseDate?: string;
  digitalReleaseDate?: string;
  collectionName?: string;
  /** Flattened alongside `collectionName` — no confirmed id-based filter use case, unfiltered. */
  collectionTmdbId?: number;
  isAvailable?: boolean;
  /** Radarr's own release-lifecycle enum (`tba`/`announced`/`inCinemas`/`released`/`deleted`) —
   *  prefixed to avoid colliding with NormalizedSeries.status (series continuing/ended, different enum). */
  radarrStatus?: string;
  /** Plot synopsis — display only, on-demand item detail, not a filter target. */
  overview?: string;
  originalTitle?: string;
  originalLanguage?: { id: number; name: string };
  alternateTitles?: { title: string }[];
  secondaryYear?: number;
  sortTitle?: string;
  cleanTitle?: string;
  titleSlug?: string;
  /** Config-surface — read-only detail, not a filter widget. */
  minimumAvailability?: string;
  rootFolderPath?: string;
  /** External links — display only. */
  website?: string;
  youTubeTrailerId?: string;
}
