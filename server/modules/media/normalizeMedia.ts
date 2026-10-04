import type { RadarrMovie, SonarrSeries } from '../providers';
import { radarrTagsFieldSource, sonarrTagsFieldSource } from './mediaFieldProvider';
import type { NormalizedMovie } from './movie';
import type { NormalizedSeries } from './series';

/**
 * Translate provider DTOs into the canonical Normalized* domain shapes the
 * ruleRegistry operates on. Shared by the automation executor and the media
 * browse handler so both filter against the same projection. `_sourceIds` keeps
 * the provider id so matched items can be mapped back to their raw DTO.
 */
export function normalizeRadarrMovie(m: RadarrMovie, providerId: number): NormalizedMovie {
  return {
    _sourceIds: { radarr: m.id, providerId, tmdb: m.tmdbId, imdb: m.imdbId },
    title: m.title,
    year: m.year,
    hasFile: m.hasFile,
    monitored: m.monitored,
    qualityProfileId: m.qualityProfileId,
    ...radarrTagsFieldSource.toEnrichmentFields(m.tags),
    genres: m.genres,
    addedDate: m.added,
    sizeOnDiskBytes: m.statistics?.sizeOnDisk,
    certification: m.certification,
    imdbRating: m.ratings?.imdb?.value,
    folderName: m.folderName,
    path: m.path,
    movieFileCount: m.statistics?.movieFileCount,
    releaseGroups: m.statistics?.releaseGroups,
    inCinemasDate: m.inCinemas,
    physicalReleaseDate: m.physicalRelease,
    digitalReleaseDate: m.digitalRelease,
    collectionName: m.collection?.name,
    collectionTmdbId: m.collection?.tmdbId,
    isAvailable: m.isAvailable,
    radarrStatus: m.status,
    overview: m.overview,
    originalTitle: m.originalTitle,
    originalLanguage: m.originalLanguage,
    alternateTitles: m.alternateTitles,
    secondaryYear: m.secondaryYear,
    sortTitle: m.sortTitle,
    cleanTitle: m.cleanTitle,
    titleSlug: m.titleSlug,
    minimumAvailability: m.minimumAvailability,
    rootFolderPath: m.rootFolderPath,
    website: m.website,
    youTubeTrailerId: m.youTubeTrailerId,
  };
}

export function normalizeSonarrSeries(s: SonarrSeries, providerId: number): NormalizedSeries {
  return {
    _sourceIds: {
      sonarr: s.id,
      providerId,
      tvdb: s.tvdbId,
      tmdb: s.tmdbId,
      imdb: s.imdbId,
      tvmaze: s.tvMazeId,
    },
    title: s.title,
    year: s.year,
    hasFile: (s.statistics?.episodeFileCount ?? 0) > 0,
    monitored: s.monitored,
    qualityProfileId: s.qualityProfileId,
    ...sonarrTagsFieldSource.toEnrichmentFields(s.tags),
    genres: s.genres,
    addedDate: s.added,
    sizeOnDiskBytes: s.statistics?.sizeOnDisk,
    certification: s.certification,
    seriesType: s.seriesType as NormalizedSeries['seriesType'],
    network: s.network,
    seriesStatus: s.status as NormalizedSeries['seriesStatus'],
    ended: s.ended,
    episodePercentage: s.statistics?.percentOfEpisodes,
    lastAiredAt: s.previousAiring,
    communityRating: s.ratings?.value,
    path: s.path,
    images: s.images,
    nextAiring: s.nextAiring,
    seasonCount: s.statistics?.seasonCount,
    episodeFileCount: s.statistics?.episodeFileCount,
    episodeCount: s.statistics?.episodeCount,
    totalEpisodeCount: s.statistics?.totalEpisodeCount,
    languageProfileId: s.languageProfileId,
  };
}
