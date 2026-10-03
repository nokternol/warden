import type { OmdbRating } from './connections/omdbProvider';
import type { TmdbRating } from './connections/tmdbProvider';
import type { TvMazeRating } from './connections/tvmazeProvider';

export interface AggregatedRatings {
  title: string;
  year?: number;
  ids: {
    tmdbId?: number;
    imdbId?: string;
    tvdbId?: number | null;
    tvMazeId?: number;
  };
  tmdb?: TmdbRating;
  omdb?: OmdbRating;
  tvmaze?: TvMazeRating;
  summary: {
    averageRating?: number;
    totalSources: number;
    foundSources: number;
  };
}

export function aggregateRatings(
  title: string,
  year?: number,
  tmdb?: TmdbRating,
  omdb?: OmdbRating,
  tvmaze?: TvMazeRating
): AggregatedRatings {
  const tmdbImdbId = tmdb?.found ? tmdb.imdbId : undefined;
  const omdbImdbId = omdb?.found ? omdb.imdbId : undefined;

  if (tmdbImdbId && omdbImdbId && tmdbImdbId !== omdbImdbId) {
    console.warn(
      `[ratings] imdbId mismatch for "${title}": TMDB=${tmdbImdbId} OMDB=${omdbImdbId} — title match may be ambiguous`
    );
  }

  const result: AggregatedRatings = {
    title,
    year,
    ids: {
      tmdbId: tmdb?.found ? tmdb.tmdbId : undefined,
      imdbId: tmdbImdbId ?? omdbImdbId,
      tvMazeId: tvmaze?.found ? tvmaze.tvMazeId : undefined,
      tvdbId: tvmaze?.found ? tvmaze.tvdbId : undefined,
    },
    tmdb,
    omdb,
    tvmaze,
    summary: { totalSources: 0, foundSources: 0 },
  };

  if (tmdb) result.summary.totalSources++;
  if (omdb) result.summary.totalSources++;
  if (tvmaze) result.summary.totalSources++;

  if (tmdb?.found) result.summary.foundSources++;
  if (omdb?.found) result.summary.foundSources++;
  if (tvmaze?.found) result.summary.foundSources++;

  const values: number[] = [];
  if (tmdb?.found) {
    if (tmdb.movieRating) values.push(tmdb.movieRating);
    else if (tmdb.tvRating) values.push(tmdb.tvRating);
  }
  if (omdb?.found && omdb.imdbRating) values.push(omdb.imdbRating);
  if (tvmaze?.found && tvmaze.rating) values.push(tvmaze.rating);

  if (values.length > 0) {
    result.summary.averageRating = Number(
      (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
    );
  }

  return result;
}

export function formatRating(rating: number | undefined, maxScale = 10): string {
  if (rating === undefined) return 'N/A';
  return `${rating.toFixed(1)}/${maxScale}`;
}

export function getSummaryText(aggregated: AggregatedRatings): string {
  const { foundSources, totalSources, averageRating } = aggregated.summary;
  if (foundSources === 0) return `No ratings found from ${totalSources} source(s)`;
  const avg = formatRating(averageRating);
  return `Average: ${avg} from ${foundSources}/${totalSources} source(s)`;
}
