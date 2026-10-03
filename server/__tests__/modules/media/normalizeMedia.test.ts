import { normalizeRadarrMovie, normalizeSonarrSeries } from '@server/modules/media/normalizeMedia';
import type { RadarrMovie, SonarrSeries } from '@server/modules/providers';
import { describe, expect, it } from 'vitest';

const baseMovie: RadarrMovie = {
  id: 1,
  title: 'Inception',
  year: 2010,
  hasFile: true,
  monitored: true,
  tmdbId: 27205,
  imdbId: 'tt1375666',
  profileId: 1,
  qualityProfileId: 1,
  tags: [],
  folderName: '/movies/inception',
  path: '/movies/inception',
};

const baseSeries: SonarrSeries = {
  id: 10,
  title: 'Breaking Bad',
  year: 2008,
  status: 'ended',
  monitored: true,
  tvdbId: 81189,
  tmdbId: 1396,
  imdbId: 'tt0903747',
  profileId: 1,
  qualityProfileId: 1,
  languageProfileId: 1,
  tags: [],
  path: '/tv/breaking-bad',
  seasons: [],
};

describe('normalizeRadarrMovie', () => {
  it('carries the constructing instance id in _sourceIds.providerId', () => {
    const item = normalizeRadarrMovie(baseMovie, 7);
    expect(item._sourceIds.providerId).toBe(7);
    expect(item._sourceIds.radarr).toBe(1);
  });

  it('populates the logical tmdb/imdb ids the resolver and enrichment join key on', () => {
    const item = normalizeRadarrMovie(baseMovie, 7);
    expect(item._sourceIds.tmdb).toBe(27205);
    expect(item._sourceIds.imdb).toBe('tt1375666');
  });

  it('carries Radarr tags through to the canonical tags field', () => {
    const item = normalizeRadarrMovie({ ...baseMovie, tags: [10, 20] }, 7);
    expect(item.tags).toEqual([10, 20]);
  });

  it('carries display-only fields through unchanged, for detail views not filters', () => {
    const item = normalizeRadarrMovie(
      {
        ...baseMovie,
        overview: 'A thief who steals corporate secrets.',
        originalTitle: 'Inception',
        originalLanguage: { id: 1, name: 'English' },
        alternateTitles: [{ title: 'Origen' }],
        secondaryYear: 2011,
        sortTitle: 'inception',
        cleanTitle: 'inception',
        titleSlug: 'inception-27205',
        collection: { name: 'The Matrix Collection', tmdbId: 2344 },
        minimumAvailability: 'released',
        rootFolderPath: '/movies',
        website: 'https://inceptionmovie.warnerbros.com',
        youTubeTrailerId: 'YoHD9XEInc0',
      },
      7
    );
    expect(item.overview).toBe('A thief who steals corporate secrets.');
    expect(item.originalTitle).toBe('Inception');
    expect(item.originalLanguage).toEqual({ id: 1, name: 'English' });
    expect(item.alternateTitles).toEqual([{ title: 'Origen' }]);
    expect(item.secondaryYear).toBe(2011);
    expect(item.sortTitle).toBe('inception');
    expect(item.cleanTitle).toBe('inception');
    expect(item.titleSlug).toBe('inception-27205');
    expect(item.collectionName).toBe('The Matrix Collection');
    expect(item.collectionTmdbId).toBe(2344);
    expect(item.minimumAvailability).toBe('released');
    expect(item.rootFolderPath).toBe('/movies');
    expect(item.website).toBe('https://inceptionmovie.warnerbros.com');
    expect(item.youTubeTrailerId).toBe('YoHD9XEInc0');
    expect(item.folderName).toBe('/movies/inception');
    expect(item.path).toBe('/movies/inception');
  });
});

describe('normalizeSonarrSeries', () => {
  it('carries the constructing instance id in _sourceIds.providerId', () => {
    const item = normalizeSonarrSeries(baseSeries, 9);
    expect(item._sourceIds.providerId).toBe(9);
    expect(item._sourceIds.sonarr).toBe(10);
  });

  it('populates the logical tvdb/tmdb ids the resolver and enrichment join key on', () => {
    const item = normalizeSonarrSeries(baseSeries, 9);
    expect(item._sourceIds.tvdb).toBe(81189);
    expect(item._sourceIds.tmdb).toBe(1396);
  });

  it('carries Sonarr tags through to the canonical tags field', () => {
    const item = normalizeSonarrSeries({ ...baseSeries, tags: [30, 40] }, 9);
    expect(item.tags).toEqual([30, 40]);
  });

  it('populates the logical imdb/tvmaze ids the resolver joins on', () => {
    const item = normalizeSonarrSeries({ ...baseSeries, tvMazeId: 169 }, 9);
    expect(item._sourceIds.imdb).toBe('tt0903747');
    expect(item._sourceIds.tvmaze).toBe(169);
  });

  it('derives hasFile from episodeFileCount — at least one episode file present', () => {
    const withFiles = normalizeSonarrSeries(
      {
        ...baseSeries,
        statistics: {
          seasonCount: 5,
          episodeFileCount: 3,
          episodeCount: 62,
          totalEpisodeCount: 62,
          sizeOnDisk: 0,
          percentOfEpisodes: 100,
        },
      },
      9
    );
    expect(withFiles.hasFile).toBe(true);

    const noFiles = normalizeSonarrSeries(
      {
        ...baseSeries,
        statistics: {
          seasonCount: 5,
          episodeFileCount: 0,
          episodeCount: 62,
          totalEpisodeCount: 62,
          sizeOnDisk: 0,
          percentOfEpisodes: 0,
        },
      },
      9
    );
    expect(noFiles.hasFile).toBe(false);

    const noStatistics = normalizeSonarrSeries(baseSeries, 9);
    expect(noStatistics.hasFile).toBe(false);
  });

  it('wires the series display/range fields onto NormalizedSeries', () => {
    const item = normalizeSonarrSeries(
      {
        ...baseSeries,
        path: '/tv/breaking-bad',
        images: [{ coverType: 'poster', remoteUrl: 'https://example.com/poster.jpg' }],
        nextAiring: '2026-09-01T00:00:00Z',
        languageProfileId: 3,
        statistics: {
          seasonCount: 5,
          episodeFileCount: 62,
          episodeCount: 62,
          totalEpisodeCount: 62,
          sizeOnDisk: 0,
          percentOfEpisodes: 100,
        },
      },
      9
    );
    expect(item.path).toBe('/tv/breaking-bad');
    expect(item.images).toEqual([
      { coverType: 'poster', remoteUrl: 'https://example.com/poster.jpg' },
    ]);
    expect(item.nextAiring).toBe('2026-09-01T00:00:00Z');
    expect(item.seasonCount).toBe(5);
    expect(item.episodeFileCount).toBe(62);
    expect(item.episodeCount).toBe(62);
    expect(item.totalEpisodeCount).toBe(62);
    expect(item.languageProfileId).toBe(3);
  });
});
