import type { TitleRating } from '@contract/ratings';
import type { Story } from '@ladle/react';
import RatingsDisplay from './index';

const movieRatings: TitleRating[] = [
  { source: 'imdb', label: 'IMDb', value: 7.8, votes: 812345, scale: 10 },
  { source: 'tmdb', label: 'TMDB', value: 7.4, votes: 9120, scale: 10 },
  { source: 'trakt', label: 'Trakt', value: 7.9, votes: 15002, scale: 10 },
  { source: 'rottenTomatoes', label: 'Rotten Tomatoes', value: 88, votes: 0, scale: 100 },
  { source: 'metacritic', label: 'Metacritic', value: 74, votes: 0, scale: 100 },
];

const seriesRatings: TitleRating[] = [
  { source: 'community', label: 'Community', value: 8.6, votes: 412, scale: 10 },
];

const frame = { padding: '1.5rem', maxWidth: '28rem' };

/** Every source a Radarr movie record can report. */
export const MovieSources: Story = () => (
  <div style={frame}>
    <RatingsDisplay ratings={movieRatings} />
  </div>
);

/** A Sonarr series carries one community rating. */
export const SeriesCommunity: Story = () => (
  <div style={frame}>
    <RatingsDisplay ratings={seriesRatings} />
  </div>
);

/** A source reported without a vote count shows its value alone. */
export const WithoutVotes: Story = () => (
  <div style={frame}>
    <RatingsDisplay ratings={[{ source: 'imdb', label: 'IMDb', value: 6.2, scale: 10 }]} />
  </div>
);
