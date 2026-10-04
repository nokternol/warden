import type { ContentScope, FilterState, FilterValue } from '@app/hooks/useMediaFilters';
import type { MediaRuleDescriptor } from '@app/hooks/useMediaRules';
import type { ManagedMovie } from '@app/hooks/useMovies';
import type { ManagedSeries } from '@app/hooks/useSeries';
import type { Story } from '@ladle/react';
import { useState } from 'react';
import { MediaContent } from './index.page';
import type { ActiveTab, MediaSlice } from './index.page';

// ─── Fixture data ─────────────────────────────────────────────────────────────

const EMPTY_FILTER_STATE: FilterState = {
  shared: { title: '' },
  movie: {},
  series: {},
  movieQualifiers: {},
  seriesQualifiers: {},
  movieSort: 'title_asc',
  seriesSort: 'title_asc',
};

// Mirrors GET /api/rules' provider-gated MediaRuleDescriptor projection
// for a RADARR + SONARR + TAUTULLI library — matches ALL_PROVIDERS below.
const FIXTURE_RULES: MediaRuleDescriptor[] = [
  {
    key: 'title',
    label: 'Title',
    contentTypes: ['movie', 'series'],
    dataType: 'string',
    providers: ['RADARR', 'SONARR'],
    required: false,
  },
  {
    key: 'year',
    label: 'Year',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: ['RADARR', 'SONARR'],
    required: false,
  },
  {
    key: 'watched',
    label: 'Watched',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    providers: ['TAUTULLI'],
    required: false,
  },
  {
    key: 'addedDaysAgo',
    label: 'Added (days ago)',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: ['RADARR', 'SONARR'],
    required: false,
  },
  {
    key: 'sizeOnDiskGb',
    label: 'Size on disk (GB)',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: ['RADARR', 'SONARR'],
    required: false,
  },
  {
    key: 'hasFile',
    label: 'Has file',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    providers: ['RADARR', 'SONARR'],
    required: false,
  },
  {
    key: 'tagIds',
    label: 'Tags',
    contentTypes: ['movie'],
    dataType: 'csv-ids',
    providers: ['RADARR'],
    required: false,
  },
  {
    key: 'qualityProfileIds',
    label: 'Quality profile',
    contentTypes: ['movie'],
    dataType: 'csv-ids',
    providers: ['RADARR'],
    required: false,
  },
  {
    key: 'genres',
    label: 'Genres',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    providers: ['RADARR'],
    required: false,
  },
  {
    key: 'imdbRating',
    label: 'IMDB rating',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: ['RADARR'],
    required: false,
  },
  {
    key: 'monitored',
    label: 'Monitored',
    contentTypes: ['series'],
    dataType: 'boolean',
    providers: ['SONARR'],
    required: false,
  },
  {
    key: 'seriesStatus',
    label: 'Series status',
    contentTypes: ['series'],
    dataType: 'string',
    providers: ['SONARR'],
    required: false,
  },
  {
    key: 'tagIds',
    label: 'Tags',
    contentTypes: ['series'],
    dataType: 'csv-ids',
    providers: ['SONARR'],
    required: false,
  },
  {
    key: 'qualityProfileIds',
    label: 'Quality profile',
    contentTypes: ['series'],
    dataType: 'csv-ids',
    providers: ['SONARR'],
    required: false,
  },
  {
    key: 'genres',
    label: 'Genres',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    providers: ['SONARR'],
    required: false,
  },
  {
    key: 'seriesType',
    label: 'Series type',
    contentTypes: ['series'],
    dataType: 'string',
    providers: ['SONARR'],
    required: false,
  },
  {
    key: 'network',
    label: 'Network',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    providers: ['SONARR'],
    required: false,
  },
  {
    key: 'communityRating',
    label: 'Community rating',
    contentTypes: ['series'],
    dataType: 'range',
    providers: ['SONARR'],
    required: false,
  },
  {
    key: 'ended',
    label: 'Ended',
    contentTypes: ['series'],
    dataType: 'boolean',
    providers: ['SONARR'],
    required: false,
  },
  {
    key: 'lastAiredDaysAgo',
    label: 'Last aired (days ago)',
    contentTypes: ['series'],
    dataType: 'range',
    providers: ['SONARR'],
    required: false,
  },
  {
    key: 'episodePercentage',
    label: 'Episode completion (%)',
    contentTypes: ['series'],
    dataType: 'range',
    providers: ['SONARR'],
    required: false,
  },
  {
    key: 'lastWatchedDaysAgo',
    label: 'Last watched (days ago)',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: ['TAUTULLI'],
    required: false,
  },
];

function emptySlice<T>(): MediaSlice<T> {
  return {
    items: [],
    totalCount: 0,
    yearRange: { min: 1980, max: 2024 },
    isLoading: false,
    isFetchingMore: false,
    hasMore: false,
    fetchMore: () => {},
  };
}

const LOOKUPS = {
  tags: {
    radarr: [
      { id: 1, label: '4K', providerId: 1, providerName: 'Radarr' },
      { id: 2, label: 'Remux', providerId: 1, providerName: 'Radarr' },
      { id: 3, label: 'HDR', providerId: 1, providerName: 'Radarr' },
    ],
    sonarr: [
      { id: 1, label: 'Anime', providerId: 2, providerName: 'Sonarr' },
      { id: 2, label: 'Ongoing', providerId: 2, providerName: 'Sonarr' },
    ],
  },
  qualityProfiles: {
    radarr: [
      { id: 1, name: 'Ultra-HD', providerId: 1, providerName: 'Radarr' },
      { id: 2, name: 'HD-1080p', providerId: 1, providerName: 'Radarr' },
    ],
    sonarr: [
      { id: 1, name: 'Ultra-HD', providerId: 2, providerName: 'Sonarr' },
      { id: 2, name: 'HD-720p/1080p', providerId: 2, providerName: 'Sonarr' },
    ],
  },
  genres: {
    movies: ['Action', 'Comedy', 'Crime', 'Drama', 'Horror', 'Sci-Fi', 'Thriller'],
    series: ['Animation', 'Comedy', 'Crime', 'Drama', 'Reality', 'Sci-Fi'],
  },
  networks: ['Netflix', 'HBO', 'Apple TV+', 'Disney+', 'Hulu'],
  studio: ['Legendary Pictures', 'Warner Bros', 'Universal'],
  fileContainers: ['mkv', 'mp4'],
  videoCodecs: ['h264', 'hevc'],
  audioCodecs: ['aac', 'dts'],
  fileResolutions: ['2160', '1080'],
  labels: ['4K', 'HDR'],
  releaseGroups: ['SPARKS', 'RARBG'],
  collectionNames: ['The Matrix Collection', 'Rocky Collection'],
  languageProfiles: [
    { id: 1, name: 'English', providerId: 2, providerName: 'Sonarr' },
    { id: 2, name: 'English/Japanese', providerId: 2, providerName: 'Sonarr' },
  ],
};

const ALL_PROVIDERS = new Set(['RADARR', 'SONARR', 'TAUTULLI']);

// ─── Controlled wrapper ───────────────────────────────────────────────────────

function isBucketActive(bucket: Record<string, FilterValue>, skipEmptyTitle = false): boolean {
  return Object.entries(bucket).some(([key, value]) => {
    if (skipEmptyTitle && key === 'title') return value !== '';
    if (value === undefined) return false;
    if (typeof value === 'object') return value.min !== undefined || value.max !== undefined;
    return true;
  });
}

function Controlled({
  filtersOpen,
  onFiltersClose,
  activeTab = 'movies',
}: {
  filtersOpen: boolean;
  onFiltersClose: () => void;
  activeTab?: ActiveTab;
}) {
  const [values, setValues] = useState<FilterState>(EMPTY_FILTER_STATE);
  const onRuleChange = (scope: ContentScope, key: string, value: FilterValue | undefined) =>
    setValues((s) => {
      const bucket = { ...s[scope] };
      if (value === undefined) delete bucket[key];
      else bucket[key] = value;
      return { ...s, [scope]: bucket };
    });
  const onQualifierChange = () => {};
  const isActive =
    isBucketActive(values.shared, true) ||
    isBucketActive(values.movie) ||
    isBucketActive(values.series);

  return (
    <MediaContent
      rules={FIXTURE_RULES}
      values={values}
      onRuleChange={onRuleChange}
      onQualifierChange={onQualifierChange}
      clearAll={() => setValues(EMPTY_FILTER_STATE)}
      isActive={isActive}
      activeFilterCount={0}
      movieSort={values.movieSort}
      seriesSort={values.seriesSort}
      setMovieSort={(v) => setValues((s) => ({ ...s, movieSort: v }))}
      setSeriesSort={(v) => setValues((s) => ({ ...s, seriesSort: v }))}
      activeTab={activeTab}
      filtersOpen={filtersOpen}
      onFiltersClose={onFiltersClose}
      movies={emptySlice<ManagedMovie>()}
      series={emptySlice<ManagedSeries>()}
      lookups={LOOKUPS}
      configuredTypes={ALL_PROVIDERS}
      sources={{
        movie: {
          contentType: 'movie',
          ownerType: 'RADARR',
          configured: true,
          instances: [{ id: 1, name: 'Radarr' }],
        },
        series: {
          contentType: 'series',
          ownerType: 'SONARR',
          configured: true,
          instances: [{ id: 2, name: 'Sonarr' }],
        },
      }}
      density="normal"
      onDensityChange={() => {}}
    />
  );
}

// ─── Stories ──────────────────────────────────────────────────────────────────

/** Mobile viewport, filters open. "Done" is intentionally non-functional — the story exists to show filter state. */
export const MobileFiltersOpen: Story = () => (
  <Controlled filtersOpen={true} onFiltersClose={() => {}} />
);
MobileFiltersOpen.meta = { width: 390 };

/** Mobile viewport, filters closed. Shows the empty library state at mobile width. */
export const Mobile: Story = () => <Controlled filtersOpen={false} onFiltersClose={() => {}} />;
Mobile.meta = { width: 390 };

/** Tablet viewport (md breakpoint). Desktop filter bar is visible; mobile filter controls are hidden. */
export const Tablet: Story = () => <Controlled filtersOpen={false} onFiltersClose={() => {}} />;
Tablet.meta = { width: 768 };
