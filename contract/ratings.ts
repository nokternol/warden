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
  votes?: unknown;
}

/** A vote count the record gives as a finite number; any other value reads as no count. */
function votesOf(entry: SourceEntry): number | undefined {
  return typeof entry.votes === 'number' && Number.isFinite(entry.votes) ? entry.votes : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Each source's raw entry in a record's `ratings`: a Radarr movie keys one
 * entry per source, a Sonarr series carries a single community entry.
 */
function entriesOf(contentType: ContentType, ratings: unknown): [RatingSource, unknown][] {
  if (contentType === 'series') return [['community', ratings]];
  return MOVIE_SOURCES.map((source) => [source, isObject(ratings) ? ratings[source] : undefined]);
}

/**
 * An entry that rates the title: a finite number, and not the zero value with
 * no votes that Radarr and Sonarr send for an unrated title.
 */
function isRated(entry: unknown): entry is SourceEntry {
  if (!isObject(entry)) return false;
  const { value, votes } = entry;
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return !(value === 0 && !votes);
}

/**
 * The ratings a title's Radarr (`movie`) or Sonarr (`series`) record reports.
 * Sources the record leaves out, does not rate with a number, or reports as
 * unrated are absent; keys outside the source list are ignored.
 */
export function ratingsOf(contentType: ContentType, ratings: unknown): TitleRating[] {
  return entriesOf(contentType, ratings).flatMap(([source, entry]) =>
    isRated(entry)
      ? [{ source, ...SOURCES[source], value: entry.value, votes: votesOf(entry) }]
      : []
  );
}
