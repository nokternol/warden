import type { ReportedFacts } from '../providers';

/**
 * A series as its source (Sonarr) supplies it in its catalog record: every catalog fact of a series.
 */
export interface SeriesCatalogRecord {
  _sourceIds: {
    sonarr?: number;
    plex?: string;
    tmdb?: number;
    tvdb?: number;
    tvmaze?: number;
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
  seriesType?: 'standard' | 'daily' | 'anime';
  network?: string;
  seriesStatus?: 'continuing' | 'ended' | 'upcoming';
  ended?: boolean;
  episodePercentage?: number;
  lastAiredAt?: string;
  communityRating?: number;
  /** Filesystem location — display only, no substring-match filter control exists yet
   *  (same gap as `NormalizedMovie.path`, Radarr's precedent). */
  path?: string;
  /** Poster/fanart — display only, not a filter/query concern. */
  images?: { coverType: string; remoteUrl: string }[];
  nextAiring?: string;
  seasonCount?: number;
  /** Backs the `hasFile` predicate fix — not exposed as its own filter rule. */
  episodeFileCount?: number;
  episodeCount?: number;
  totalEpisodeCount?: number;
  /** Sonarr-only, instance-scoped id — backs the `languageProfileIds` filter rule. */
  languageProfileId?: number;
}

/** A series as rules read it: its catalog record and the facts other providers report about it. */
export type NormalizedSeries = SeriesCatalogRecord & Partial<ReportedFacts>;
