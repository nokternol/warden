import type { ReportedFacts } from '../providers';

/**
 * A movie as its source (Radarr) supplies it in its catalog record: every catalog fact of a movie.
 */
export interface MovieCatalogRecord {
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
  tags?: number[];
  genres?: string[];
  addedDate?: string;
  sizeOnDiskBytes?: number;
  certification?: string;
  imdbRating?: number;
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

/** A movie as rules read it: its catalog record and the facts other providers report about it. */
export type NormalizedMovie = MovieCatalogRecord & Partial<ReportedFacts>;
