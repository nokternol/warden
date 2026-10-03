import Badge from '@app/components/Badge';
import { Card } from '@app/components/Card';
import type { AggregatedRatings } from '@contract/providers';
import styles from './RatingsDisplay.module.css';

export type { AggregatedRatings };

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TmdbRating {
  source: 'tmdb';
  tvRating?: number;
  tvVotes?: number;
  popularity?: number;
  found: boolean;
}

export interface OmdbRating {
  source: 'omdb';
  imdbRating?: number;
  imdbVotes?: number;
  rottenTomatoesRating?: number;
  metacriticRating?: number;
  found: boolean;
}

export interface TvmazeRating {
  source: 'tvmaze';
  rating?: number;
  found: boolean;
}

export interface RatingSummary {
  averageRating: number;
  totalSources: number;
  foundSources: number;
}

// ─── Atom sub-components ──────────────────────────────────────────────────────

interface RatingRowProps {
  label: string;
  value?: number | string;
}

/** A label / value pair row inside a source card. */
const RatingRow = ({ label, value }: RatingRowProps) => {
  if (value === undefined || value === null) return null;
  return (
    <div className={styles.ratingRow}>
      <span className={styles.ratingLabel}>{label}</span>
      <span className={styles.ratingValue}>{value}</span>
    </div>
  );
};

interface SourceCardProps {
  name: string;
  found: boolean;
  children?: React.ReactNode;
}

/** A per-source ratings panel built on top of the Card atom. */
const SourceCard = ({ name, found, children }: SourceCardProps) => (
  <Card variant="outlined">
    <Card.Header padding="sm">
      <div className={styles.sourceHeader}>
        <span className={styles.sourceName}>{name}</span>
        {!found && (
          <Badge variant="default" size="sm">
            Not found
          </Badge>
        )}
      </div>
    </Card.Header>
    {found && children && (
      <Card.Content padding="sm" divided>
        <div className={styles.sourceBody}>{children}</div>
      </Card.Content>
    )}
  </Card>
);

// ─── Root Component ───────────────────────────────────────────────────────────

interface RatingsDisplayProps {
  ratings: AggregatedRatings | null;
}

const Root = ({ ratings }: RatingsDisplayProps) => {
  if (!ratings) return null;

  const { title, year, tmdb, omdb, tvmaze, summary } = ratings;

  return (
    <div className={styles.container}>
      {/* Summary header card */}
      <Card variant="outlined">
        <Card.Content>
          <div className={styles.headerContent}>
            <div className={styles.titleGroup}>
              <h2 className={styles.title}>{title}</h2>
              {year && <span className={styles.year}>{year}</span>}
            </div>
            <div className={styles.averageBlock}>
              <span className={styles.averageLabel}>Average</span>
              <span className={styles.averageValue}>{(summary.averageRating ?? 0).toFixed(2)}</span>
              <span className={styles.sourcesCount}>
                {summary.foundSources} of {summary.totalSources} sources
              </span>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Source Ratings */}
      <div className={styles.sources}>
        {tmdb && (
          <SourceCard name="TMDB" found={tmdb.found}>
            <RatingRow label="TV Rating" value={tmdb.tvRating} />
            <RatingRow label="Votes" value={tmdb.tvVotes?.toLocaleString()} />
            <RatingRow label="Popularity" value={tmdb.popularity?.toFixed(1)} />
          </SourceCard>
        )}

        {omdb && (
          <SourceCard name="OMDB" found={omdb.found}>
            <RatingRow label="IMDb Rating" value={omdb.imdbRating} />
            <RatingRow label="IMDb Votes" value={omdb.imdbVotes?.toLocaleString()} />
            <RatingRow
              label="Rotten Tomatoes"
              value={
                omdb.rottenTomatoesRating !== undefined
                  ? `${omdb.rottenTomatoesRating}%`
                  : undefined
              }
            />
            <RatingRow label="Metacritic" value={omdb.metacriticRating} />
          </SourceCard>
        )}

        {tvmaze && (
          <SourceCard name="TVMaze" found={tvmaze.found}>
            <RatingRow label="Rating" value={tvmaze.rating} />
          </SourceCard>
        )}
      </div>
    </div>
  );
};

export const RatingsDisplay = Object.assign(Root, {
  SourceCard,
  RatingRow,
});

export default RatingsDisplay;
