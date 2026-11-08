/**
 * A title's ratings as its Radarr or Sonarr record reports them: the one
 * reading of a record's `ratings`, shared by the server's filters and the
 * client's ratings panel. Each value stays on its own source's scale.
 */
import type { ContentType } from './schemas';

/** One source's rating of a title, on that source's scale. */
export interface TitleRating {
  source: string;
  label: string;
  value: number;
  votes?: number;
  scale: number;
}

const MOVIE_SOURCES = [
  { source: 'imdb', label: 'IMDb', scale: 10 },
  { source: 'tmdb', label: 'TMDB', scale: 10 },
  { source: 'trakt', label: 'Trakt', scale: 10 },
  { source: 'rottenTomatoes', label: 'Rotten Tomatoes', scale: 100 },
  { source: 'metacritic', label: 'Metacritic', scale: 100 },
];

export function ratingsOf(_contentType: ContentType, ratings: unknown): TitleRating[] {
  const record = ratings as Record<string, { value: number; votes?: number }>;
  return MOVIE_SOURCES.map(({ source, label, scale }) => ({
    source,
    label,
    value: record[source].value,
    votes: record[source].votes,
    scale,
  }));
}
