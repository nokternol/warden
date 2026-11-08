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

  it('leaves out a source that is missing, non-numeric or unrated, and keys outside the source list', () => {
    const radarrRatings = {
      imdb: { value: 0, votes: 0, type: 'user' },
      tmdb: { value: 'n/a', votes: 10 },
      metacritic: { value: 0 },
      rottenTomatoes: { value: 0, votes: 12 },
      letterboxd: { value: 4.1, votes: 300 },
    };

    expect(ratingsOf('movie', radarrRatings)).toEqual([
      { source: 'rottenTomatoes', label: 'Rotten Tomatoes', value: 0, votes: 12, scale: 100 },
    ]);
    expect(ratingsOf('movie', undefined)).toEqual([]);
    expect(ratingsOf('series', { votes: 0, value: 0 })).toEqual([]);
    expect(ratingsOf('series', null)).toEqual([]);
  });
});
