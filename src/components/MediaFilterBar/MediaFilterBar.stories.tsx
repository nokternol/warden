import type {
  ContentScope,
  FilterState,
  FilterValue,
  QualifierScope,
} from '@app/hooks/useMediaFilters';
import type { MediaRuleDescriptor } from '@app/hooks/useMediaRules';
import type { MediaSourceDescriptor } from '@app/hooks/useMediaSources';
import type { ContentType } from '@contract/schemas';
import type { Story } from '@ladle/react';
import { useState } from 'react';
import { MediaFilterBar } from './index';

// ─── Mock data ────────────────────────────────────────────────────────────────

const TAGS = {
  radarr: [
    { id: 1, label: '4K', providerId: 1, providerName: 'Radarr' },
    { id: 2, label: 'Remux', providerId: 1, providerName: 'Radarr' },
    { id: 3, label: 'HDR', providerId: 1, providerName: 'Radarr' },
    { id: 4, label: 'BluRay', providerId: 1, providerName: 'Radarr' },
  ],
  sonarr: [
    { id: 1, label: 'Anime', providerId: 2, providerName: 'Sonarr' },
    { id: 2, label: 'Ongoing', providerId: 2, providerName: 'Sonarr' },
    { id: 3, label: 'Kids', providerId: 2, providerName: 'Sonarr' },
  ],
};

const QUALITY_PROFILES = {
  radarr: [
    { id: 1, name: 'Ultra-HD', providerId: 1, providerName: 'Radarr' },
    { id: 2, name: 'HD-1080p', providerId: 1, providerName: 'Radarr' },
    { id: 3, name: 'SD', providerId: 1, providerName: 'Radarr' },
  ],
  sonarr: [
    { id: 1, name: 'Ultra-HD', providerId: 2, providerName: 'Sonarr' },
    { id: 2, name: 'HD-720p/1080p', providerId: 2, providerName: 'Sonarr' },
  ],
};

// Two active Radarr instances — a 4k-only library and a standard-quality one —
// exercising the grouped, instance-qualified dropdown (§10). Sonarr stays
// single-instance so the Series group renders exactly as it does today.
const MULTI_INSTANCE_TAGS = {
  radarr: [
    { id: 1, label: '4K', providerId: 1, providerName: 'Radarr 4K' },
    { id: 2, label: 'Remux', providerId: 1, providerName: 'Radarr 4K' },
    { id: 1, label: 'Anime', providerId: 3, providerName: 'Radarr Standard' },
    { id: 2, label: 'Kids', providerId: 3, providerName: 'Radarr Standard' },
  ],
  sonarr: TAGS.sonarr,
};

const MULTI_INSTANCE_QUALITY_PROFILES = {
  radarr: [
    { id: 1, name: 'Ultra-HD', providerId: 1, providerName: 'Radarr 4K' },
    { id: 2, name: 'HD-1080p', providerId: 3, providerName: 'Radarr Standard' },
    { id: 3, name: 'SD', providerId: 3, providerName: 'Radarr Standard' },
  ],
  sonarr: QUALITY_PROFILES.sonarr,
};

const SINGLE_INSTANCE_SOURCES: Record<ContentType, MediaSourceDescriptor> = {
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
};

const MULTI_INSTANCE_SOURCES: Record<ContentType, MediaSourceDescriptor> = {
  movie: {
    contentType: 'movie',
    ownerType: 'RADARR',
    configured: true,
    instances: [
      { id: 1, name: 'Radarr 4K' },
      { id: 3, name: 'Radarr Standard' },
    ],
  },
  series: SINGLE_INSTANCE_SOURCES.series,
};

const GENRES = {
  movies: ['Action', 'Comedy', 'Crime', 'Drama', 'Horror', 'Sci-Fi', 'Thriller', 'Western'],
  series: ['Animation', 'Comedy', 'Crime', 'Drama', 'Reality', 'Sci-Fi', 'Talk'],
};

const NETWORKS = ['Netflix', 'HBO', 'Apple TV+', 'Disney+', 'Hulu', 'Prime Video', 'Peacock'];
const STUDIOS = ['Legendary Pictures', 'Warner Bros', 'Universal', 'A24', 'AMC Studios'];
const FILE_CONTAINERS = ['mkv', 'mp4', 'avi'];
const VIDEO_CODECS = ['h264', 'hevc', 'mpeg2video'];
const AUDIO_CODECS = ['aac', 'dts', 'ac3'];
const FILE_RESOLUTIONS = ['2160', '1080', '720', 'sd'];
const LABELS = ['4K', 'HDR', 'Favorites'];
const RELEASE_GROUPS = ['SPARKS', 'RARBG', 'FraMeSToR', 'CMRG'];
const COLLECTION_NAMES = ['The Matrix Collection', 'Rocky Collection', 'James Bond Collection'];
const LANGUAGE_PROFILES = [
  { id: 1, name: 'English', providerId: 2, providerName: 'Sonarr' },
  { id: 2, name: 'English/Japanese', providerId: 2, providerName: 'Sonarr' },
];

const YEAR_RANGE = { min: 1980, max: 2024 };

const EMPTY_LOOKUPS = {
  tags: { radarr: [], sonarr: [] },
  qualityProfiles: { radarr: [], sonarr: [] },
  genres: { movies: [], series: [] },
  networks: [],
  studio: [],
  fileContainers: [],
  videoCodecs: [],
  audioCodecs: [],
  fileResolutions: [],
  labels: [],
  releaseGroups: [],
  collectionNames: [],
  languageProfiles: [],
};

const RICH_LOOKUPS = {
  tags: TAGS,
  qualityProfiles: QUALITY_PROFILES,
  genres: GENRES,
  networks: NETWORKS,
  studio: STUDIOS,
  fileContainers: FILE_CONTAINERS,
  videoCodecs: VIDEO_CODECS,
  audioCodecs: AUDIO_CODECS,
  fileResolutions: FILE_RESOLUTIONS,
  labels: LABELS,
  releaseGroups: RELEASE_GROUPS,
  collectionNames: COLLECTION_NAMES,
  languageProfiles: LANGUAGE_PROFILES,
};

const MULTI_INSTANCE_LOOKUPS = {
  tags: MULTI_INSTANCE_TAGS,
  qualityProfiles: MULTI_INSTANCE_QUALITY_PROFILES,
  genres: GENRES,
  networks: NETWORKS,
  studio: STUDIOS,
  fileContainers: FILE_CONTAINERS,
  videoCodecs: VIDEO_CODECS,
  audioCodecs: AUDIO_CODECS,
  fileResolutions: FILE_RESOLUTIONS,
  labels: LABELS,
  releaseGroups: RELEASE_GROUPS,
  collectionNames: COLLECTION_NAMES,
  languageProfiles: LANGUAGE_PROFILES,
};

// The full rule set, unfiltered — mirrors `MEDIA_RULES` (server/modules/media/ruleRegistry.ts).
// `rulesFor()` below applies the same provider-gating `GET /api/filter-fields` does.
const ALL_RULES: MediaRuleDescriptor[] = [
  {
    key: 'title',
    label: 'Title',
    contentTypes: ['movie', 'series'],
    dataType: 'string',
    sourceProviders: ['RADARR', 'SONARR'],
    required: false,
  },
  {
    key: 'year',
    label: 'Year',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: ['RADARR', 'SONARR'],
    required: false,
  },
  {
    key: 'watched',
    label: 'Watched',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    sourceProviders: ['TAUTULLI'],
    required: false,
  },
  {
    key: 'addedDaysAgo',
    label: 'Added (days ago)',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: ['RADARR', 'SONARR'],
    required: false,
  },
  {
    key: 'sizeOnDiskGb',
    label: 'Size on disk (GB)',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: ['RADARR', 'SONARR'],
    required: false,
  },
  {
    key: 'hasFile',
    label: 'Has file',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    sourceProviders: ['RADARR', 'SONARR'],
    required: false,
  },
  {
    key: 'tagIds',
    label: 'Tags',
    contentTypes: ['movie'],
    dataType: 'csv-ids',
    sourceProviders: ['RADARR'],
    required: false,
    instanceScoped: true,
  },
  {
    key: 'qualityProfileIds',
    label: 'Quality profile',
    contentTypes: ['movie'],
    dataType: 'csv-ids',
    sourceProviders: ['RADARR'],
    required: false,
    instanceScoped: true,
  },
  {
    key: 'genres',
    label: 'Genres',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    sourceProviders: ['RADARR'],
    required: false,
  },
  {
    key: 'imdbRating',
    label: 'IMDB rating',
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: ['RADARR'],
    required: false,
  },
  {
    key: 'movieFileCount',
    label: 'Movie file count',
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: ['RADARR'],
    required: false,
  },
  {
    key: 'releaseGroups',
    label: 'Release group',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    sourceProviders: ['RADARR'],
    required: false,
  },
  {
    key: 'inCinemasDaysAgo',
    label: 'In cinemas (days ago)',
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: ['RADARR'],
    required: false,
  },
  {
    key: 'physicalReleaseDaysAgo',
    label: 'Physical release (days ago)',
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: ['RADARR'],
    required: false,
  },
  {
    key: 'digitalReleaseDaysAgo',
    label: 'Digital release (days ago)',
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: ['RADARR'],
    required: false,
  },
  {
    key: 'collectionName',
    label: 'Collection',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    sourceProviders: ['RADARR'],
    required: false,
  },
  {
    key: 'isAvailable',
    label: 'Available',
    contentTypes: ['movie'],
    dataType: 'boolean',
    sourceProviders: ['RADARR'],
    required: false,
  },
  {
    key: 'radarrStatus',
    label: 'Radarr status',
    contentTypes: ['movie'],
    dataType: 'string',
    sourceProviders: ['RADARR'],
    required: false,
  },
  {
    key: 'studio',
    label: 'Studio',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    sourceProviders: ['PLEX', 'JELLYFIN'],
    required: false,
  },
  {
    key: 'monitored',
    label: 'Monitored',
    contentTypes: ['series'],
    dataType: 'boolean',
    sourceProviders: ['SONARR'],
    required: false,
  },
  {
    key: 'seriesStatus',
    label: 'Series status',
    contentTypes: ['series'],
    dataType: 'string',
    sourceProviders: ['SONARR'],
    required: false,
  },
  {
    key: 'tagIds',
    label: 'Tags',
    contentTypes: ['series'],
    dataType: 'csv-ids',
    sourceProviders: ['SONARR'],
    required: false,
    instanceScoped: true,
  },
  {
    key: 'qualityProfileIds',
    label: 'Quality profile',
    contentTypes: ['series'],
    dataType: 'csv-ids',
    sourceProviders: ['SONARR'],
    required: false,
    instanceScoped: true,
  },
  {
    key: 'genres',
    label: 'Genres',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    sourceProviders: ['SONARR'],
    required: false,
  },
  {
    key: 'languageProfileIds',
    label: 'Language profile',
    contentTypes: ['series'],
    dataType: 'csv-ids',
    sourceProviders: ['SONARR'],
    required: false,
    instanceScoped: true,
  },
  {
    key: 'seriesType',
    label: 'Series type',
    contentTypes: ['series'],
    dataType: 'string',
    sourceProviders: ['SONARR'],
    required: false,
  },
  {
    key: 'network',
    label: 'Network',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    sourceProviders: ['SONARR'],
    required: false,
  },
  {
    key: 'studio',
    label: 'Studio',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    sourceProviders: ['PLEX', 'JELLYFIN'],
    required: false,
  },
  {
    key: 'communityRating',
    label: 'Community rating',
    contentTypes: ['series'],
    dataType: 'range',
    sourceProviders: ['SONARR'],
    required: false,
  },
  {
    key: 'ended',
    label: 'Ended',
    contentTypes: ['series'],
    dataType: 'boolean',
    sourceProviders: ['SONARR'],
    required: false,
  },
  {
    key: 'lastAiredDaysAgo',
    label: 'Last aired (days ago)',
    contentTypes: ['series'],
    dataType: 'range',
    sourceProviders: ['SONARR'],
    required: false,
  },
  {
    key: 'episodePercentage',
    label: 'Episode completion (%)',
    contentTypes: ['series'],
    dataType: 'range',
    sourceProviders: ['SONARR'],
    required: false,
  },
  {
    key: 'lastWatchedDaysAgo',
    label: 'Last watched (days ago)',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: ['TAUTULLI', 'PLEX', 'JELLYFIN'],
    required: false,
  },
  {
    key: 'runtimeMinutes',
    label: 'Runtime (minutes)',
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: ['PLEX', 'JELLYFIN'],
    required: false,
  },
  {
    key: 'fileSizeBytes',
    label: 'File size (bytes)',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: ['PLEX', 'JELLYFIN'],
    required: false,
  },
  {
    key: 'releaseDaysAgo',
    label: 'Release date (days ago)',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: ['PLEX', 'JELLYFIN'],
    required: false,
  },
  {
    key: 'fileContainer',
    label: 'File container',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    sourceProviders: ['PLEX', 'JELLYFIN'],
    required: false,
  },
  {
    key: 'videoCodec',
    label: 'Video codec',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    sourceProviders: ['PLEX', 'JELLYFIN'],
    required: false,
  },
  {
    key: 'audioCodec',
    label: 'Audio codec',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    sourceProviders: ['PLEX', 'JELLYFIN'],
    required: false,
  },
  {
    key: 'fileResolution',
    label: 'File resolution',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    sourceProviders: ['PLEX', 'JELLYFIN'],
    required: false,
  },
  {
    key: 'labels',
    label: 'Labels',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    sourceProviders: ['PLEX', 'JELLYFIN'],
    required: false,
  },
  {
    key: 'jellyfinAddedDaysAgo',
    label: 'Jellyfin added (days ago)',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: ['JELLYFIN'],
    required: false,
  },
  {
    key: 'jellyfinIsFavorite',
    label: 'Jellyfin favorite',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    sourceProviders: ['JELLYFIN'],
    required: false,
  },
];

function rulesFor(configuredTypes: Set<string>): MediaRuleDescriptor[] {
  return ALL_RULES.filter((rule) => rule.sourceProviders.some((sp) => configuredTypes.has(sp)));
}

const EMPTY_FILTER_STATE: FilterState = {
  shared: { title: '' },
  movie: {},
  series: {},
  movieQualifiers: {},
  seriesQualifiers: {},
  movieSort: 'title_asc',
  seriesSort: 'title_asc',
};

function isBucketActive(bucket: Record<string, FilterValue>, skipEmptyTitle = false): boolean {
  return Object.entries(bucket).some(([key, value]) => {
    if (skipEmptyTitle && key === 'title') return value !== '';
    if (value === undefined) return false;
    if (typeof value === 'object') return value.min !== undefined || value.max !== undefined;
    return true;
  });
}

// ─── Wrapper ──────────────────────────────────────────────────────────────────

const CONFIGURED_TYPE_OPTIONS = {
  'All providers': new Set(['RADARR', 'SONARR', 'TAUTULLI', 'PLEX', 'JELLYFIN']),
  'Movies only (Radarr)': new Set(['RADARR']),
  'Series only (Sonarr)': new Set(['SONARR']),
  'Movies + Tautulli': new Set(['RADARR', 'TAUTULLI']),
  'Tautulli only': new Set(['TAUTULLI']),
  'Plex only': new Set(['PLEX']),
  'Jellyfin only': new Set(['JELLYFIN']),
};

type WrapperArgs = {
  configuredTypes: keyof typeof CONFIGURED_TYPE_OPTIONS;
  richLookups: boolean;
  mobileOpen: boolean;
  multiInstance?: boolean;
};

function FilterBarWrapper({
  configuredTypes = 'All providers',
  richLookups = true,
  mobileOpen: initialMobileOpen = false,
  multiInstance = false,
}: WrapperArgs) {
  const [values, setValues] = useState<FilterState>(EMPTY_FILTER_STATE);
  const [mobileOpen, setMobileOpen] = useState(initialMobileOpen);

  const isActive =
    isBucketActive(values.shared, true) ||
    isBucketActive(values.movie) ||
    isBucketActive(values.series);

  const onRuleChange = (scope: ContentScope, key: string, value: FilterValue | undefined) =>
    setValues((s) => {
      const bucket = { ...s[scope] };
      if (value === undefined) delete bucket[key];
      else bucket[key] = value;
      return { ...s, [scope]: bucket };
    });

  const onQualifierChange = (scope: QualifierScope, key: string, providerId: number | undefined) =>
    setValues((s) => {
      const qualifiersKey = scope === 'movie' ? 'movieQualifiers' : 'seriesQualifiers';
      const qualifiers = { ...s[qualifiersKey] };
      if (providerId === undefined) delete qualifiers[key];
      else qualifiers[key] = providerId;
      return { ...s, [qualifiersKey]: qualifiers };
    });

  const types =
    CONFIGURED_TYPE_OPTIONS[configuredTypes] ?? CONFIGURED_TYPE_OPTIONS['All providers'];
  const lookups = multiInstance
    ? MULTI_INSTANCE_LOOKUPS
    : richLookups
      ? RICH_LOOKUPS
      : EMPTY_LOOKUPS;
  const sources = multiInstance ? MULTI_INSTANCE_SOURCES : SINGLE_INSTANCE_SOURCES;

  const activeQualifier = values.movieQualifiers.tagIds ?? values.movieQualifiers.qualityProfileIds;
  const activeInstanceName = activeQualifier
    ? MULTI_INSTANCE_SOURCES.movie.instances.find((i) => i.id === activeQualifier)?.name
    : undefined;

  return (
    <div className="bg-surface-bg min-h-screen">
      <div className="px-6 py-2 bg-surface-elevated border-b border-border">
        <span className="text-xs text-text-muted font-mono">
          filter state:{' '}
          <span className={isActive ? 'text-primary' : 'text-text-muted'}>
            {isActive ? 'active' : 'default'}
          </span>
          {values.shared.title && (
            <span className="ml-2 text-text-secondary">title="{String(values.shared.title)}"</span>
          )}
          {activeInstanceName && (
            <span className="ml-2 text-text-secondary">qualified to: {activeInstanceName}</span>
          )}
        </span>
      </div>

      <MediaFilterBar
        rules={rulesFor(types)}
        values={values}
        onQualifierChange={onQualifierChange}
        sources={sources}
        onRuleChange={onRuleChange}
        clearAll={() => setValues(EMPTY_FILTER_STATE)}
        isActive={isActive}
        movieYearRange={YEAR_RANGE}
        seriesYearRange={YEAR_RANGE}
        lookups={lookups}
        configuredTypes={types}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
    </div>
  );
}

// ─── Shared argTypes ──────────────────────────────────────────────────────────

const sharedArgTypes = {
  configuredTypes: {
    control: { type: 'radio' as const },
    options: Object.keys(CONFIGURED_TYPE_OPTIONS),
    description: 'Which media providers are configured',
  },
  richLookups: {
    control: { type: 'boolean' as const },
    description: 'Populate tags, quality profiles, genres, and networks',
  },
  mobileOpen: {
    control: { type: 'boolean' as const },
    description: 'Open the mobile filter sheet',
  },
  multiInstance: {
    control: { type: 'boolean' as const },
    description: 'Simulate two active Radarr instances (grouped, qualified tag/profile options)',
  },
};

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Interactive: Story<WrapperArgs> = (args) => <FilterBarWrapper {...args} />;
Interactive.args = { configuredTypes: 'All providers', richLookups: true, mobileOpen: false };
Interactive.argTypes = sharedArgTypes;

export const MoviesOnly: Story<WrapperArgs> = (args) => <FilterBarWrapper {...args} />;
MoviesOnly.args = { configuredTypes: 'Movies only (Radarr)', richLookups: true, mobileOpen: false };
MoviesOnly.argTypes = sharedArgTypes;

export const SeriesOnly: Story<WrapperArgs> = (args) => <FilterBarWrapper {...args} />;
SeriesOnly.args = { configuredTypes: 'Series only (Sonarr)', richLookups: true, mobileOpen: false };
SeriesOnly.argTypes = sharedArgTypes;

export const NoLookups: Story<WrapperArgs> = (args) => <FilterBarWrapper {...args} />;
NoLookups.args = { configuredTypes: 'All providers', richLookups: false, mobileOpen: false };
NoLookups.argTypes = sharedArgTypes;

export const MobileSheet: Story<WrapperArgs> = (args) => <FilterBarWrapper {...args} />;
MobileSheet.args = { configuredTypes: 'All providers', richLookups: true, mobileOpen: true };
MobileSheet.argTypes = sharedArgTypes;

// Two active Radarr instances ("Radarr 4K" / "Radarr Standard") — Tags and
// Quality profile render as labeled per-instance sections, and picking values
// from only one section qualifies the entry to that instance (§10). Sonarr
// stays single-instance, so the Series group renders exactly as it does
// today — the byte-identical-with-one-instance guarantee, visible side by
// side in the same story.
export const MultiInstance: Story<WrapperArgs> = (args) => <FilterBarWrapper {...args} />;
MultiInstance.args = {
  configuredTypes: 'All providers',
  richLookups: true,
  mobileOpen: false,
  multiInstance: true,
};
MultiInstance.argTypes = sharedArgTypes;

export const WithActiveFilters: Story = () => {
  const [values, setValues] = useState<FilterState>({
    shared: { title: '', watched: 'false', year: { min: 2010 }, hasFile: 'true' },
    movie: {},
    series: { seriesStatus: 'continuing', seriesType: 'anime' },
    movieQualifiers: {},
    seriesQualifiers: {},
    movieSort: 'title_asc',
    seriesSort: 'title_asc',
  });
  const onRuleChange = (scope: ContentScope, key: string, value: FilterValue | undefined) =>
    setValues((s) => {
      const bucket = { ...s[scope] };
      if (value === undefined) delete bucket[key];
      else bucket[key] = value;
      return { ...s, [scope]: bucket };
    });
  const onQualifierChange = () => {};

  return (
    <div className="bg-surface-bg min-h-screen">
      <div className="px-6 py-2 bg-surface-elevated border-b border-border">
        <span className="text-xs text-text-muted font-mono">
          filter state: <span className="text-primary">active</span>
          <span className="ml-2 text-text-secondary">
            hasFile=true · seriesStatus=continuing · anime · unwatched · year≥2010
          </span>
        </span>
      </div>
      <MediaFilterBar
        rules={ALL_RULES}
        values={values}
        onRuleChange={onRuleChange}
        onQualifierChange={onQualifierChange}
        clearAll={() => setValues(EMPTY_FILTER_STATE)}
        isActive={true}
        movieYearRange={YEAR_RANGE}
        seriesYearRange={YEAR_RANGE}
        lookups={RICH_LOOKUPS}
        configuredTypes={new Set(['RADARR', 'SONARR', 'TAUTULLI'])}
        sources={SINGLE_INSTANCE_SOURCES}
        mobileOpen={false}
        onMobileClose={() => {}}
      />
    </div>
  );
};
