/**
 * A title's ratings as its Radarr or Sonarr record reports them: the one
 * reading of a record's `ratings`, shared by the server's filters and the
 * client's ratings panel. Each value stays on its own source's scale.
 */
import type { ContentType } from './schemas';

/** Every source a rating is read from, with its display label and fixed scale. */
const SOURCES = {
  imdb: { label: 'IMDb', scale: 10 },
  tmdb: { label: 'TMDB', scale: 10 },
  trakt: { label: 'Trakt', scale: 10 },
  rottenTomatoes: { label: 'Rotten Tomatoes', scale: 100 },
  metacritic: { label: 'Metacritic', scale: 100 },
  community: { label: 'Community', scale: 10 },
} as const;

type RatingSource = keyof typeof SOURCES;

/** The sources a Radarr record keys its `ratings` object by, in display order. */
const MOVIE_SOURCES: readonly RatingSource[] = [
  'imdb',
  'tmdb',
  'trakt',
  'rottenTomatoes',
  'metacritic',
];

/** One source's rating of a title, on that source's scale. */
export interface TitleRating {
  source: RatingSource;
  label: string;
  value: number;
  votes?: number;
  scale: number;
}

interface SourceEntry {
  value: number;
  votes?: number;
}

/**
 * Each source's raw entry in a record's `ratings`: a Radarr movie keys one
 * entry per source, a Sonarr series carries a single community entry.
 */
function entriesOf(contentType: ContentType, ratings: unknown): [RatingSource, SourceEntry][] {
  if (contentType === 'series') return [['community', ratings as SourceEntry]];
  const record = ratings as Record<string, SourceEntry>;
  return MOVIE_SOURCES.map((source) => [source, record[source]]);
}

/** The ratings a title's Radarr (`movie`) or Sonarr (`series`) record reports. */
export function ratingsOf(contentType: ContentType, ratings: unknown): TitleRating[] {
  return entriesOf(contentType, ratings).map(([source, { value, votes }]) => ({
    source,
    ...SOURCES[source],
    value,
    votes,
  }));
}
