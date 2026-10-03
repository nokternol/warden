import { contract } from '@contract/index';
import type { AggregatedRatings } from '@contract/providers';
import { type ProcedureOutput, mockProcedure } from '../contract';

const SONARR_RESPONSE = {
  type: 'SONARR',
  data: {
    series: [{ id: 1, title: 'Breaking Bad', status: 'ended', monitored: true }],
    qualityProfiles: [{ id: 1, name: 'HD-1080p' }],
    rootFolders: [{ id: 1, path: '/tv', freeSpace: 2000000 }],
    tags: [{ id: 1, label: 'drama' }],
  },
};

const RADARR_RESPONSE = {
  type: 'RADARR',
  data: {
    movies: [{ id: 1, title: 'The Matrix', hasFile: true, monitored: true }],
    qualityProfiles: [{ id: 1, name: 'HD-1080p' }],
    rootFolders: [{ id: 1, path: '/movies', freeSpace: 5000000 }],
    tags: [],
  },
};

const PLEX_RESPONSE = {
  type: 'PLEX',
  data: {
    libraries: [
      { key: '1', title: 'Movies', type: 'movie' },
      { key: '2', title: 'TV Shows', type: 'show' },
    ],
  },
};

const JELLYFIN_RESPONSE = {
  type: 'JELLYFIN',
  data: {
    libraries: [{ Name: 'Movies', ItemId: 'abc123', CollectionType: 'movies' }],
  },
};

const TAUTULLI_RESPONSE = {
  type: 'TAUTULLI',
  data: {
    libraryStats: [{ section_id: 1, section_name: 'Movies', section_type: 'movie', count: 100 }],
    homeStats: [{ stat_id: 'top_movies', rows: [{ title: 'The Matrix', total_plays: 5 }] }],
    recentHistory: [],
  },
};

const OVERSEERR_RESPONSE = {
  type: 'OVERSEERR',
  data: {
    requests: [
      {
        id: 1,
        status: 2,
        type: 'movie',
        requestedBy: { id: 1, displayName: 'Alice', email: 'alice@example.com' },
        media: { tmdbId: 603, title: 'The Matrix' },
        createdAt: '2024-01-01T00:00:00Z',
      },
    ],
  },
};

const RESPONSE_BY_TYPE: Record<string, ProcedureOutput<typeof contract.providers.metadata>> = {
  SONARR: SONARR_RESPONSE,
  RADARR: RADARR_RESPONSE,
  PLEX: PLEX_RESPONSE,
  JELLYFIN: JELLYFIN_RESPONSE,
  TAUTULLI: TAUTULLI_RESPONSE,
  OVERSEERR: OVERSEERR_RESPONSE,
};

const RATINGS_RESPONSE: AggregatedRatings = {
  title: 'Breaking Bad',
  year: 2008,
  ids: {
    tmdbId: 1396,
    imdbId: 'tt0903747',
    tvdbId: 81189,
    tvMazeId: 169,
  },
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

export const providersHandlers = [
  mockProcedure(contract.providers.metadata, ({ request }) => {
    const type = new URL(request.url).searchParams.get('type') ?? '';
    return RESPONSE_BY_TYPE[type];
  }),

  mockProcedure(contract.providers.ratings, () => RATINGS_RESPONSE),
];
