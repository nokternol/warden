import type { Story } from '@ladle/react';
import RatingsDisplay from './index';
import type { AggregatedRatings } from './index';

const fullRatings: AggregatedRatings = {
  title: 'Breaking Bad',
  year: 2008,
  ids: {},
  tmdb: {
    source: 'tmdb',
    tvRating: 8.9,
    tvVotes: 5234,
    popularity: 123.45,
    found: true,
  },
  omdb: {
    source: 'omdb',
    imdbRating: 9.5,
    imdbVotes: 1823456,
    rottenTomatoesRating: 96,
    metacriticRating: 99,
    found: true,
  },
  tvmaze: {
    source: 'tvmaze',
    rating: 9.1,
    found: true,
  },
  summary: {
    averageRating: 9.17,
    totalSources: 3,
    foundSources: 3,
  },
};

const partialRatings: AggregatedRatings = {
  title: 'Some Show',
  year: 2020,
  ids: {},
  tmdb: {
    source: 'tmdb',
    tvRating: 7.2,
    tvVotes: 1200,
    found: true,
  },
  omdb: {
    source: 'omdb',
    found: false,
  },
  tvmaze: {
    source: 'tvmaze',
    rating: 7.5,
    found: true,
  },
  summary: {
    averageRating: 7.35,
    totalSources: 3,
    foundSources: 2,
  },
};

export const AllSources: Story = () => (
  <div style={{ padding: '1.5rem', maxWidth: '56rem' }}>
    <RatingsDisplay ratings={fullRatings} />
  </div>
);

export const PartialSources: Story = () => (
  <div style={{ padding: '1.5rem', maxWidth: '56rem' }}>
    <RatingsDisplay ratings={partialRatings} />
  </div>
);

export const Empty: Story = () => (
  <div style={{ padding: '1.5rem' }}>
    <p style={{ color: 'rgb(var(--color-text-muted))' }}>No data — RatingsDisplay renders null</p>
    <RatingsDisplay ratings={null} />
  </div>
);
