import { getChildLogger } from '@server/kernel/logger';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import {
  TmdbProvider,
  type TmdbStreamingServices,
} from '@server/modules/providers/connections/tmdbProvider';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const log = getChildLogger('TestTmdbProvider');

const mockProvider: ProviderConfig = {
  name: 'Test TMDB',
  url: 'https://api.themoviedb.org/3',
  apiKey: 'test-api-key',
  settings: null,
};

const server = setupServer(
  http.get('https://api.themoviedb.org/3/movie/:id', () => {
    return HttpResponse.json({
      id: 603,
      title: 'The Matrix',
      vote_average: 8.7,
      vote_count: 24512,
      popularity: 98.21,
      release_date: '1999-03-31',
      runtime: 136,
      genres: [{ id: 28, name: 'Action' }],
      imdb_id: 'tt0133093',
      // enrichment fields
      release_dates: {
        results: [
          {
            iso_3166_1: 'US',
            release_dates: [{ certification: 'R', type: 3 }],
          },
        ],
      },
      keywords: {
        keywords: [
          { id: 10090, name: 'artificial reality' },
          { id: 195, name: 'martial arts' },
        ],
      },
      belongs_to_collection: {
        id: 2344,
        name: 'The Matrix Collection',
      },
      spoken_languages: [{ english_name: 'English' }],
      origin_country: ['US', 'AU'],
    });
  }),

  http.get('https://api.themoviedb.org/3/tv/:id', () => {
    return HttpResponse.json({
      id: 1396,
      name: 'Breaking Bad',
      vote_average: 8.9,
      vote_count: 5234,
      popularity: 123.45,
      first_air_date: '2008-01-20',
      number_of_seasons: 5,
      genres: [{ id: 18, name: 'Drama' }],
      // enrichment fields
      content_ratings: {
        results: [{ iso_3166_1: 'US', rating: 'TV-MA' }],
      },
      keywords: {
        results: [
          { id: 6084, name: 'drug trade' },
          { id: 818, name: 'based on real events' },
        ],
      },
      spoken_languages: [{ english_name: 'English' }],
      origin_country: ['US'],
    });
  }),

  http.get('https://api.themoviedb.org/3/movie/:id/watch/providers', () =>
    HttpResponse.json({
      id: 603,
      results: {
        US: {
          flatrate: [
            { provider_id: 8, provider_name: 'Netflix' },
            { provider_id: 119, provider_name: 'Amazon Prime Video' },
          ],
          rent: [{ provider_id: 2, provider_name: 'Apple TV' }],
          buy: [{ provider_id: 3, provider_name: 'Vudu' }],
        },
        GB: {
          flatrate: [{ provider_id: 8, provider_name: 'Netflix' }],
        },
      },
    })
  ),

  http.get('https://api.themoviedb.org/3/tv/:id/watch/providers', () =>
    HttpResponse.json({
      id: 1396,
      results: {
        US: {
          flatrate: [
            { provider_id: 337, provider_name: 'Disney Plus' },
            { provider_id: 384, provider_name: 'Max' },
          ],
        },
      },
    })
  )
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('TmdbProvider.getMovieDetailsEnriched', () => {
  it('returns certification "R" from US theatrical release_dates', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieDetailsEnriched(603);

    expect(result.certification).toBe('R');
  });

  it('returns keywords array from movie keywords', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieDetailsEnriched(603);

    expect(result.keywords).toEqual(['artificial reality', 'martial arts']);
  });

  it('returns collectionId and collectionName from belongs_to_collection', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieDetailsEnriched(603);

    expect(result.collectionId).toBe(2344);
    expect(result.collectionName).toBe('The Matrix Collection');
  });

  it('returns spokenLanguages from spoken_languages', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieDetailsEnriched(603);

    expect(result.spokenLanguages).toEqual(['English']);
  });

  it('returns originCountry from origin_country', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieDetailsEnriched(603);

    expect(result.originCountry).toEqual(['US', 'AU']);
  });

  it('still returns base fields: id, title, imdb_id, vote_average', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieDetailsEnriched(603);

    expect(result.id).toBe(603);
    expect(result.title).toBe('The Matrix');
    expect(result.imdb_id).toBe('tt0133093');
    expect(result.vote_average).toBe(8.7);
  });

  it('returns certification undefined when release_dates.results is empty', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/:id', () => {
        return HttpResponse.json({
          id: 603,
          title: 'The Matrix',
          vote_average: 8.7,
          vote_count: 24512,
          popularity: 98.21,
          release_date: '1999-03-31',
          runtime: 136,
          genres: [{ id: 28, name: 'Action' }],
          imdb_id: 'tt0133093',
          release_dates: { results: [] },
          keywords: { keywords: [] },
          belongs_to_collection: null,
          spoken_languages: [],
          origin_country: [],
        });
      })
    );

    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieDetailsEnriched(603);

    expect(result.certification).toBeUndefined();
  });

  it('falls back to first non-US entry when no US entry exists in release_dates', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/:id', () => {
        return HttpResponse.json({
          id: 603,
          title: 'The Matrix',
          vote_average: 8.7,
          vote_count: 24512,
          popularity: 98.21,
          release_date: '1999-03-31',
          runtime: 136,
          genres: [{ id: 28, name: 'Action' }],
          imdb_id: 'tt0133093',
          release_dates: {
            results: [
              {
                iso_3166_1: 'GB',
                release_dates: [{ certification: '15', type: 3 }],
              },
            ],
          },
          keywords: { keywords: [] },
          belongs_to_collection: null,
          spoken_languages: [],
          origin_country: [],
        });
      })
    );

    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieDetailsEnriched(603);

    expect(result.certification).toBe('15');
  });

  it('returns keywords as empty array when no keywords returned', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/:id', () => {
        return HttpResponse.json({
          id: 603,
          title: 'The Matrix',
          vote_average: 8.7,
          vote_count: 24512,
          popularity: 98.21,
          release_date: '1999-03-31',
          runtime: 136,
          genres: [{ id: 28, name: 'Action' }],
          imdb_id: 'tt0133093',
          release_dates: { results: [] },
          keywords: { keywords: [] },
          belongs_to_collection: null,
          spoken_languages: [],
          origin_country: [],
        });
      })
    );

    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieDetailsEnriched(603);

    expect(result.keywords).toEqual([]);
  });

  it('returns collectionId and collectionName as undefined when belongs_to_collection is null', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/:id', () => {
        return HttpResponse.json({
          id: 603,
          title: 'The Matrix',
          vote_average: 8.7,
          vote_count: 24512,
          popularity: 98.21,
          release_date: '1999-03-31',
          runtime: 136,
          genres: [{ id: 28, name: 'Action' }],
          imdb_id: 'tt0133093',
          release_dates: { results: [] },
          keywords: { keywords: [] },
          belongs_to_collection: null,
          spoken_languages: [],
          origin_country: [],
        });
      })
    );

    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieDetailsEnriched(603);

    expect(result.collectionId).toBeUndefined();
    expect(result.collectionName).toBeUndefined();
  });
});

describe('TmdbProvider.getTvDetailsEnriched', () => {
  it('returns certification "TV-MA" from US content_ratings', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getTvDetailsEnriched(1396);

    expect(result.certification).toBe('TV-MA');
  });

  it('returns keywords array from tv keywords results', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getTvDetailsEnriched(1396);

    expect(result.keywords).toEqual(['drug trade', 'based on real events']);
  });

  it('returns spokenLanguages from spoken_languages', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getTvDetailsEnriched(1396);

    expect(result.spokenLanguages).toEqual(['English']);
  });

  it('returns originCountry from origin_country', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getTvDetailsEnriched(1396);

    expect(result.originCountry).toEqual(['US']);
  });

  it('still returns base fields: id, name, vote_average', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getTvDetailsEnriched(1396);

    expect(result.id).toBe(1396);
    expect(result.name).toBe('Breaking Bad');
    expect(result.vote_average).toBe(8.9);
  });

  it('falls back to first non-US entry when no US entry exists in content_ratings', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/tv/:id', () => {
        return HttpResponse.json({
          id: 1396,
          name: 'Breaking Bad',
          vote_average: 8.9,
          vote_count: 5234,
          popularity: 123.45,
          first_air_date: '2008-01-20',
          number_of_seasons: 5,
          genres: [{ id: 18, name: 'Drama' }],
          content_ratings: {
            results: [{ iso_3166_1: 'GB', rating: '18' }],
          },
          keywords: { results: [] },
          spoken_languages: [],
          origin_country: [],
        });
      })
    );

    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getTvDetailsEnriched(1396);

    expect(result.certification).toBe('18');
  });
});

describe('TmdbProvider.getMovieWatchProviders', () => {
  it('returns netflix:true for US when provider_id 8 is in flatrate', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieWatchProviders(603, 'US');

    expect(result.netflix).toBe(true);
  });

  it('returns prime:true for US when provider_id 119 is in flatrate', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieWatchProviders(603, 'US');

    expect(result.prime).toBe(true);
  });

  it('returns apple:false for US when Apple TV is only in rent not flatrate', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieWatchProviders(603, 'US');

    expect(result.apple).toBe(false);
  });

  it('returns disney:false for US when disney is not in the fixture', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieWatchProviders(603, 'US');

    expect(result.disney).toBe(false);
  });

  it('returns netflix:true for GB region', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieWatchProviders(603, 'GB');

    expect(result.netflix).toBe(true);
  });

  it('returns all flags false when requested region AU has no entry', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieWatchProviders(603, 'AU');

    const allFalse: TmdbStreamingServices = {
      netflix: false,
      prime: false,
      disney: false,
      hulu: false,
      apple: false,
      hbo: false,
      paramount: false,
      peacock: false,
    };
    expect(result).toEqual(allFalse);
  });
});

describe('TmdbProvider.getTvWatchProviders', () => {
  it('returns disney:true for US when provider_id 337 is in flatrate', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getTvWatchProviders(1396, 'US');

    expect(result.disney).toBe(true);
  });

  it('returns hbo:true for US when provider_id 384 (Max) is in flatrate', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getTvWatchProviders(1396, 'US');

    expect(result.hbo).toBe(true);
  });

  it('returns netflix:false for US when netflix is not in TV fixture', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getTvWatchProviders(1396, 'US');

    expect(result.netflix).toBe(false);
  });

  it('returns all flags false when region GB has no TV entry', async () => {
    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getTvWatchProviders(1396, 'GB');

    const allFalse: TmdbStreamingServices = {
      netflix: false,
      prime: false,
      disney: false,
      hulu: false,
      apple: false,
      hbo: false,
      paramount: false,
      peacock: false,
    };
    expect(result).toEqual(allFalse);
  });
});

describe('TmdbProvider watch/providers edge cases', () => {
  it('returns all-false object when API returns results: {}', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/:id/watch/providers', () =>
        HttpResponse.json({ id: 603, results: {} })
      )
    );

    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieWatchProviders(603, 'US');

    const allFalse: TmdbStreamingServices = {
      netflix: false,
      prime: false,
      disney: false,
      hulu: false,
      apple: false,
      hbo: false,
      paramount: false,
      peacock: false,
    };
    expect(result).toEqual(allFalse);
  });

  it('returns all flags false when region has only rent entries', async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/movie/:id/watch/providers', () =>
        HttpResponse.json({
          id: 603,
          results: {
            US: {
              rent: [
                { provider_id: 8, provider_name: 'Netflix' },
                { provider_id: 119, provider_name: 'Amazon Prime Video' },
                { provider_id: 337, provider_name: 'Disney Plus' },
              ],
            },
          },
        })
      )
    );

    const provider = new TmdbProvider(mockProvider, log);
    const result = await provider.getMovieWatchProviders(603, 'US');

    const allFalse: TmdbStreamingServices = {
      netflix: false,
      prime: false,
      disney: false,
      hulu: false,
      apple: false,
      hbo: false,
      paramount: false,
      peacock: false,
    };
    expect(result).toEqual(allFalse);
  });
});
