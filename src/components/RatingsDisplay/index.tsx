import type { TitleRating } from '@contract/ratings';
import styles from './RatingsDisplay.module.css';

interface SourceProps {
  rating: TitleRating;
}

/** One source's rating: its label, its value on its scale, and its vote count when reported. */
const Source = ({ rating }: SourceProps) => (
  <li className={styles.source}>
    <span className={styles.label}>{rating.label}</span>
    <span className={styles.reading}>
      <span className={styles.value}>
        {rating.value}
        <span className={styles.scale}>/{rating.scale}</span>
      </span>
      {rating.votes !== undefined && (
        <span className={styles.votes}>{rating.votes.toLocaleString('en-US')} votes</span>
      )}
    </span>
  </li>
);

interface RatingsDisplayProps {
  ratings: TitleRating[];
}

/** A title's ratings, one row per source, each value on its own source's scale; "No ratings" when it has none. */
const Root = ({ ratings }: RatingsDisplayProps) =>
  ratings.length === 0 ? (
    <p className={styles.empty}>No ratings</p>
  ) : (
    <ul className={styles.sources}>
      {ratings.map((rating) => (
        <Source key={rating.source} rating={rating} />
      ))}
    </ul>
  );

export const RatingsDisplay = Object.assign(Root, { Source });

export default RatingsDisplay;
