import { ratingsOf } from '@contract/ratings';
import { describe, expect, it } from 'vitest';

describe('a title’s ratings', () => {
  it('lists each source a Radarr movie record reports, with its label, value, votes and scale', () => {
    const radarrRatings = {
      imdb: { value: 7.8, votes: 812345, type: 'user' },
      tmdb: { value: 7.4, votes: 9120, type: 'user' },
      metacritic: { value: 74, votes: 0, type: 'user' },
      rottenTomatoes: { value: 88, votes: 0, type: 'user' },
      trakt: { value: 7.9, votes: 15002, type: 'user' },
    };

    expect(ratingsOf('movie', radarrRatings)).toEqual([
      { source: 'imdb', label: 'IMDb', value: 7.8, votes: 812345, scale: 10 },
      { source: 'tmdb', label: 'TMDB', value: 7.4, votes: 9120, scale: 10 },
      { source: 'trakt', label: 'Trakt', value: 7.9, votes: 15002, scale: 10 },
      { source: 'rottenTomatoes', label: 'Rotten Tomatoes', value: 88, votes: 0, scale: 100 },
      { source: 'metacritic', label: 'Metacritic', value: 74, votes: 0, scale: 100 },
    ]);
  });

  it('lists a Sonarr series record’s single rating as the community rating', () => {
    expect(ratingsOf('series', { votes: 412, value: 8.6 })).toEqual([
      { source: 'community', label: 'Community', value: 8.6, votes: 412, scale: 10 },
    ]);
  });
});
