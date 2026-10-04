import { contract } from '@contract/index';
import type {
  ManagedMovie,
  ManagedSeries,
  MediaRuleDescriptor,
  MediaSourceDescriptor,
} from '@contract/media';
import { mockProcedure } from '../contract';

const MOCK_MOVIES: ManagedMovie[] = Array.from({ length: 96 }, (_, i) => ({
  id: i + 1,
  title: `Movie ${i + 1}`,
  year: 2000 + (i % 30),
  hasFile: i % 2 === 0,
  monitored: true,
  tmdbId: 1000 + i,
  images: [{ coverType: 'poster', remoteUrl: `https://example.com/movie${i + 1}.jpg` }],
  sourceCount: 1,
  sourceProviderIds: [1],
}));

const MOCK_SERIES: ManagedSeries[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  title: i === 0 ? 'Breaking Bad' : `Series ${i + 1}`,
  year: 2008 + i,
  status: 'ended',
  monitored: true,
  tvdbId: 81189 + i,
  images: [
    {
      coverType: 'poster',
      remoteUrl: `https://example.com/series${i + 1}.jpg`,
    },
  ],
  sourceCount: 1,
  sourceProviderIds: [2],
}));

/** One browse page of `items`, as the browse procedures answer it. */
function browsePage<T>(items: T[], request: Request, yearRange: { min: number; max: number }) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page') ?? '1');
  const pageSize = Number(url.searchParams.get('pageSize') ?? '48');
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    totalCount: items.length,
    page,
    pageSize,
    yearRange,
    errors: [],
  };
}

/** Mirrors media.rules' provider-gated MediaRuleDescriptor projection
 * (server/modules/media/ruleRegistry.ts) — the default set every RADARR+SONARR test
 * fixture implies is configured, per providers.ts's default handler. */
export const MOCK_RULES: MediaRuleDescriptor[] = [
  {
    key: 'title',
    label: 'Title',
    contentTypes: ['movie', 'series'],
    dataType: 'string',
  },
  {
    key: 'year',
    label: 'Year',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
  },
  {
    key: 'watched',
    label: 'Watched',
    group: 'Play History',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Watched', false: 'Unwatched' },
  },
  {
    key: 'addedDaysAgo',
    label: 'Added (days ago)',
    group: 'Library',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
  },
  {
    key: 'sizeOnDiskGb',
    label: 'Size on disk (GB)',
    group: 'Library',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
  },
  {
    key: 'hasFile',
    label: 'Has file',
    group: 'Library',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Downloaded', false: 'Missing' },
  },
  {
    key: 'tagIds',
    label: 'Tags',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'instance-ids',
    lookup: 'tags',
    instanceScoped: true,
  },
  {
    key: 'qualityProfileIds',
    label: 'Quality profile',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'instance-ids',
    lookup: 'qualityProfiles',
    instanceScoped: true,
  },
  {
    key: 'genres',
    label: 'Genres',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    lookup: 'genres',
  },
  {
    key: 'imdbRating',
    label: 'IMDB rating',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
  },
  {
    key: 'monitored',
    label: 'Monitored',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'boolean',
    valueLabels: { true: 'Monitored', false: 'Unmonitored' },
  },
  {
    key: 'seriesStatus',
    label: 'Series status',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'string',
    options: [
      { value: 'continuing', label: 'Continuing' },
      { value: 'ended', label: 'Ended' },
    ],
    shortLabel: 'Status',
  },
  {
    key: 'tagIds',
    label: 'Tags',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'instance-ids',
    lookup: 'tags',
    instanceScoped: true,
  },
  {
    key: 'qualityProfileIds',
    label: 'Quality profile',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'instance-ids',
    lookup: 'qualityProfiles',
    instanceScoped: true,
  },
  {
    key: 'genres',
    label: 'Genres',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    lookup: 'genres',
  },
  {
    key: 'seriesType',
    label: 'Series type',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'string',
    options: [
      { value: 'standard', label: 'Standard' },
      { value: 'anime', label: 'Anime' },
      { value: 'daily', label: 'Daily' },
    ],
    shortLabel: 'Type',
  },
  {
    key: 'network',
    label: 'Network',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    lookup: 'networks',
  },
  {
    key: 'communityRating',
    label: 'Community rating',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
  },
  {
    key: 'ended',
    label: 'Ended',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'boolean',
    valueLabels: { true: 'Finished', false: 'Running' },
  },
  {
    key: 'lastAiredDaysAgo',
    label: 'Last aired (days ago)',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
  },
  {
    key: 'episodePercentage',
    label: 'Episode completion (%)',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
  },
  {
    key: 'tmdbStatus',
    label: 'TMDB status',
    group: 'TMDB',
    contentTypes: ['movie', 'series'],
    dataType: 'string',
    options: [
      { value: 'Released', label: 'Released' },
      { value: 'In Production', label: 'In Production' },
      { value: 'Ended', label: 'Ended' },
      { value: 'Returning Series', label: 'Returning Series' },
      { value: 'Canceled', label: 'Canceled' },
    ],
    shortLabel: 'Status',
  },
  {
    key: 'overseerrRequestStatus',
    label: 'Overseerr request status',
    group: 'Requests',
    contentTypes: ['movie', 'series'],
    dataType: 'number',
    options: [
      { value: '1', label: 'Pending' },
      { value: '2', label: 'Approved' },
      { value: '3', label: 'Declined' },
      { value: '4', label: 'Available' },
    ],
    shortLabel: 'Status',
  },
  {
    key: 'overseerrHasIssue',
    label: 'Overseerr has issue',
    group: 'Requests',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Has Issue', false: 'No Issue' },
  },
  {
    key: 'lastWatchedDaysAgo',
    label: 'Last watched (days ago)',
    group: 'Play History',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
  },
];

export const mediaHandlers = [
  mockProcedure(contract.media.browse.movie, ({ request }) =>
    browsePage(MOCK_MOVIES, request, { min: 2000, max: 2029 })
  ),

  mockProcedure(contract.media.series, ({ request }) =>
    browsePage(MOCK_SERIES, request, { min: 2008, max: 2017 })
  ),

  mockProcedure(contract.media.tags, () => ({
    radarr: [
      { id: 1, label: 'action', providerId: 1, providerName: 'Radarr' },
      { id: 2, label: 'sci-fi', providerId: 1, providerName: 'Radarr' },
    ],
    sonarr: [{ id: 1, label: 'drama', providerId: 2, providerName: 'Sonarr' }],
  })),

  mockProcedure(contract.media.qualityProfiles, () => ({
    radarr: [
      { id: 1, name: 'HD-1080p', providerId: 1, providerName: 'Radarr' },
      { id: 2, name: 'Any', providerId: 1, providerName: 'Radarr' },
    ],
    sonarr: [
      { id: 1, name: 'HD-1080p', providerId: 2, providerName: 'Sonarr' },
      { id: 2, name: 'Any', providerId: 2, providerName: 'Sonarr' },
    ],
  })),

  mockProcedure(contract.media.genres, () => ({
    movies: ['Action', 'Comedy', 'Crime', 'Drama', 'Horror', 'Sci-Fi', 'Thriller'],
    series: ['Animation', 'Comedy', 'Crime', 'Drama', 'Reality', 'Sci-Fi'],
  })),

  mockProcedure(contract.media.networks, () => ['HBO', 'Netflix', 'Apple TV+', 'Disney+', 'AMC']),
  mockProcedure(contract.media.studio, () => ['Legendary Pictures', 'Warner Bros', 'AMC Studios']),
  mockProcedure(contract.media.releaseGroups, () => ['SPARKS', 'RARBG']),
  mockProcedure(contract.media.collectionNames, () => ['The Matrix Collection']),

  mockProcedure(contract.media.languageProfiles, () => [
    { id: 1, name: 'English', providerId: 2, providerName: 'Sonarr' },
    { id: 2, name: 'English/Japanese', providerId: 2, providerName: 'Sonarr' },
  ]),

  mockProcedure(contract.media.fileContainers, () => ['mkv', 'mp4']),
  mockProcedure(contract.media.videoCodecs, () => ['h264', 'hevc']),
  mockProcedure(contract.media.audioCodecs, () => ['aac', 'dts']),
  mockProcedure(contract.media.fileResolutions, () => ['1080', '4k']),
  mockProcedure(contract.media.labels, () => ['4K', 'Favorites']),

  // Configured state matches the default settings.ts fixture (RADARR active, no SONARR).
  mockProcedure(contract.media.sources, (): MediaSourceDescriptor[] => [
    {
      contentType: 'movie',
      ownerType: 'RADARR',
      configured: true,
      instances: [{ id: 1, name: 'Radarr' }],
    },
    {
      contentType: 'series',
      ownerType: 'SONARR',
      configured: false,
      instances: [],
    },
  ]),

  mockProcedure(contract.media.reset, () => ({ deletedIdentities: 0 })),

  mockProcedure(contract.media.rules, (): MediaRuleDescriptor[] => MOCK_RULES),
];
