import '@testing-library/jest-dom/vitest';
import type { ContentScope, FilterState, FilterValue } from '@app/hooks/useMediaFilters';
import type { MediaRuleDescriptor } from '@contract/media';
import { fireEvent, render, screen, setupUser, within } from '@tests/helpers/component';
import { describe, expect, it, vi } from 'vitest';
import { MediaFilterBar } from '../index';
import type { MediaFilterBarProps } from '../index';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Mirrors MEDIA_RULES (server/modules/media/ruleRegistry.ts). `rulesFor()` filters
// it the same way GET /api/rules provider-gates its projection.
/** A descriptor plus the providers that produce it — only so `rulesFor` can
 *  gate the fixture the way `/api/rules` gates the registry. Never on the wire. */
type GatedRule = MediaRuleDescriptor & { providers: readonly string[] };

const ALL_RULES: GatedRule[] = [
  {
    key: 'title',
    label: 'Title',
    contentTypes: ['movie', 'series'],
    dataType: 'string',
    providers: ['RADARR', 'SONARR'],
  },
  {
    key: 'year',
    label: 'Year',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: ['RADARR', 'SONARR'],
  },
  {
    key: 'watched',
    label: 'Watched',
    group: 'Play History',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Watched', false: 'Unwatched' },
    providers: ['TAUTULLI', 'PLEX'],
  },
  {
    key: 'addedDaysAgo',
    label: 'Added',
    group: 'Library',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: ['RADARR', 'SONARR'],
  },
  {
    key: 'sizeOnDiskGb',
    label: 'Size (GB)',
    group: 'Library',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: ['RADARR', 'SONARR'],
  },
  {
    key: 'hasFile',
    label: 'Has file',
    group: 'Library',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Downloaded', false: 'Missing' },
    providers: ['RADARR'],
  },
  {
    key: 'tagIds',
    label: 'Movie Tags',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'instance-ids',
    lookup: 'tags',
    providers: ['RADARR'],
  },
  {
    key: 'qualityProfileIds',
    label: 'Movie Quality',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'instance-ids',
    lookup: 'qualityProfiles',
    providers: ['RADARR'],
  },
  {
    key: 'genres',
    label: 'Movie Genres',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    lookup: 'genres',
    providers: ['RADARR'],
  },
  {
    key: 'imdbRating',
    label: 'IMDB Rating',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: ['RADARR'],
  },
  {
    key: 'studio',
    label: 'Movie Studio',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    lookup: 'studio',
    providers: ['PLEX'],
  },
  {
    key: 'monitored',
    label: 'Monitored',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'boolean',
    valueLabels: { true: 'Monitored', false: 'Unmonitored' },
    providers: ['SONARR'],
  },
  {
    key: 'seriesStatus',
    label: 'Status',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'string',
    options: [
      { value: 'continuing', label: 'Continuing' },
      { value: 'ended', label: 'Ended' },
    ],
    shortLabel: 'Status',
    providers: ['SONARR'],
  },
  {
    key: 'tagIds',
    label: 'Series Tags',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'instance-ids',
    lookup: 'tags',
    providers: ['SONARR'],
  },
  {
    key: 'qualityProfileIds',
    label: 'Series Quality',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'instance-ids',
    lookup: 'qualityProfiles',
    providers: ['SONARR'],
  },
  {
    key: 'genres',
    label: 'Series Genres',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    lookup: 'genres',
    providers: ['SONARR'],
  },
  {
    key: 'seriesType',
    label: 'Type',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'string',
    options: [
      { value: 'standard', label: 'Standard' },
      { value: 'anime', label: 'Anime' },
      { value: 'daily', label: 'Daily' },
    ],
    shortLabel: 'Type',
    providers: ['SONARR'],
  },
  {
    key: 'network',
    label: 'Network',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    lookup: 'networks',
    providers: ['SONARR'],
  },
  {
    key: 'studio',
    label: 'Series Studio',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    lookup: 'studio',
    providers: ['PLEX'],
  },
  {
    key: 'communityRating',
    label: 'Sonarr Rating',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
    providers: ['SONARR'],
  },
  {
    key: 'ended',
    label: 'Ended',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'boolean',
    valueLabels: { true: 'Finished', false: 'Running' },
    providers: ['SONARR'],
  },
  {
    key: 'lastAiredDaysAgo',
    label: 'Last Aired',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
    providers: ['SONARR'],
  },
  {
    key: 'episodePercentage',
    label: '% Episodes',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
    providers: ['SONARR'],
  },
  {
    key: 'tmdbStatus',
    label: 'TMDB Status',
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
    providers: ['TMDB'],
  },
  {
    key: 'overseerrRequestStatus',
    label: 'Status',
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
    providers: ['OVERSEERR'],
  },
  {
    key: 'overseerrHasIssue',
    label: 'Has Issue',
    group: 'Requests',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Has Issue', false: 'No Issue' },
    providers: ['OVERSEERR'],
  },
  {
    key: 'lastWatchedDaysAgo',
    label: 'Last Watched',
    group: 'Play History',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: ['TAUTULLI', 'PLEX'],
  },
  {
    key: 'fileContainer',
    label: 'File container',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    lookup: 'fileContainers',
    providers: ['PLEX'],
  },
  {
    key: 'videoCodec',
    label: 'Video codec',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    lookup: 'videoCodecs',
    providers: ['PLEX'],
  },
  {
    key: 'audioCodec',
    label: 'Audio codec',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    lookup: 'audioCodecs',
    providers: ['PLEX'],
  },
  {
    key: 'fileResolution',
    label: 'File resolution',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    lookup: 'fileResolutions',
    providers: ['PLEX'],
  },
  {
    key: 'labels',
    label: 'Labels',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    lookup: 'labels',
    providers: ['PLEX', 'JELLYFIN'],
  },
  {
    key: 'fileSizeBytes',
    label: 'File size (bytes)',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: ['PLEX'],
  },
  {
    key: 'releaseDaysAgo',
    label: 'Release date (days ago)',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: ['PLEX'],
  },
  {
    key: 'runtimeMinutes',
    label: 'Runtime (minutes)',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: ['PLEX'],
  },
  {
    key: 'movieFileCount',
    label: 'Movie file count',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: ['RADARR'],
  },
  {
    key: 'releaseGroups',
    label: 'Release group',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    lookup: 'releaseGroups',
    providers: ['RADARR'],
  },
  {
    key: 'inCinemasDaysAgo',
    label: 'In cinemas (days ago)',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: ['RADARR'],
  },
  {
    key: 'physicalReleaseDaysAgo',
    label: 'Physical release (days ago)',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: ['RADARR'],
  },
  {
    key: 'digitalReleaseDaysAgo',
    label: 'Digital release (days ago)',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: ['RADARR'],
  },
  {
    key: 'collectionName',
    label: 'Collection',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    lookup: 'collectionNames',
    providers: ['RADARR'],
  },
  {
    key: 'isAvailable',
    label: 'Available',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'boolean',
    valueLabels: { true: 'Available', false: 'Unavailable' },
    providers: ['RADARR'],
  },
  {
    key: 'radarrStatus',
    label: 'Radarr status',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'string',
    options: [
      { value: 'tba', label: 'TBA' },
      { value: 'announced', label: 'Announced' },
      { value: 'inCinemas', label: 'In Cinemas' },
      { value: 'released', label: 'Released' },
      { value: 'deleted', label: 'Deleted' },
    ],
    providers: ['RADARR'],
  },
  {
    key: 'jellyfinIsFavorite',
    label: 'Jellyfin favorite',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Favorited', false: 'Not Favorited' },
    providers: ['JELLYFIN'],
  },
  {
    key: 'languageProfileIds',
    label: 'Language profile',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'instance-ids',
    lookup: 'languageProfiles',
    providers: ['SONARR'],
    instanceScoped: true,
  },
];

function rulesFor(configuredTypes: Set<string>): MediaRuleDescriptor[] {
  return ALL_RULES.filter((rule) => rule.providers.some((sp) => configuredTypes.has(sp))).map(
    ({ providers: _providers, ...descriptor }) => descriptor
  );
}

const DEFAULT_VALUES: FilterState = {
  shared: { title: '' },
  movie: {},
  series: {},
  movieQualifiers: {},
  seriesQualifiers: {},
  movieSort: 'title_asc',
  seriesSort: 'title_asc',
};

const RICH_LOOKUPS: MediaFilterBarProps['lookups'] = {
  tags: {
    radarr: [
      { id: 1, label: '4K', providerId: 1, providerName: 'Radarr' },
      { id: 2, label: 'Remux', providerId: 1, providerName: 'Radarr' },
    ],
    sonarr: [
      { id: 1, label: 'Anime', providerId: 2, providerName: 'Sonarr' },
      { id: 2, label: 'Ongoing', providerId: 2, providerName: 'Sonarr' },
    ],
  },
  qualityProfiles: {
    radarr: [
      { id: 1, name: 'HD-1080p', providerId: 1, providerName: 'Radarr' },
      { id: 2, name: 'Any', providerId: 1, providerName: 'Radarr' },
    ],
    sonarr: [
      { id: 1, name: 'HD-1080p', providerId: 2, providerName: 'Sonarr' },
      { id: 2, name: 'Any', providerId: 2, providerName: 'Sonarr' },
    ],
  },
  genres: {
    movies: ['Action', 'Comedy', 'Drama'],
    series: ['Crime', 'Drama', 'Sci-Fi'],
  },
  networks: ['HBO', 'Netflix'],
  studio: ['Legendary Pictures', 'Warner Bros'],
  fileContainers: ['mkv', 'mp4'],
  videoCodecs: ['h264', 'hevc'],
  audioCodecs: ['aac', 'dts'],
  fileResolutions: ['1080', '4k'],
  labels: ['4K', 'Favorites'],
  releaseGroups: ['SPARKS', 'RARBG'],
  collectionNames: ['The Matrix Collection'],
  languageProfiles: [
    { id: 1, name: 'English', providerId: 2, providerName: 'Sonarr' },
    { id: 2, name: 'English/Japanese', providerId: 2, providerName: 'Sonarr' },
  ],
};

const EMPTY_LOOKUPS: MediaFilterBarProps['lookups'] = {
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

function makeProps(overrides: Partial<MediaFilterBarProps> = {}): MediaFilterBarProps {
  return {
    rules: rulesFor(new Set(['RADARR', 'SONARR', 'TAUTULLI'])),
    values: DEFAULT_VALUES,
    onRuleChange: vi.fn(),
    onQualifierChange: vi.fn(),
    clearAll: vi.fn(),
    isActive: false,
    movieYearRange: { min: 1990, max: 2024 },
    seriesYearRange: { min: 2000, max: 2024 },
    lookups: EMPTY_LOOKUPS,
    mobileOpen: false,
    onMobileClose: vi.fn(),
    ...overrides,
  };
}

/** Builds `values` with one scoped field set, on top of `DEFAULT_VALUES`. */
function valuesWith(patch: {
  shared?: Record<string, FilterValue>;
  movie?: Record<string, FilterValue>;
  series?: Record<string, FilterValue>;
}): FilterState {
  return {
    ...DEFAULT_VALUES,
    shared: { ...DEFAULT_VALUES.shared, ...patch.shared },
    movie: { ...DEFAULT_VALUES.movie, ...patch.movie },
    series: { ...DEFAULT_VALUES.series, ...patch.series },
  };
}

function propsFor(configuredTypes: string[]): Partial<MediaFilterBarProps> {
  const types = new Set(configuredTypes);
  return { rules: rulesFor(types) };
}

/** Opens the "Add filter" picker and selects the rule with the given label —
 *  the add-filter pattern's controls only render once added (or already
 *  active), so most tests need this before asserting a control is present.
 *  The desktop bar's trigger stays mounted (just CSS-hidden) even when the
 *  mobile dialog is open, so mobile tests must pass `within(dialog)` to
 *  disambiguate the two "Add filter" triggers. */
async function addFilter(
  user: ReturnType<typeof setupUser>,
  label: string | RegExp,
  scope: Pick<typeof screen, 'getByRole'> = screen
) {
  await user.click(scope.getByRole('button', { name: /add filter/i }));
  await user.click(scope.getByRole('option', { name: label }));
}

// ─── Desktop bar — visibility ─────────────────────────────────────────────────

describe('MediaFilterBar — desktop bar renders', () => {
  it('renders the title search input', () => {
    render(<MediaFilterBar {...makeProps()} />);
    expect(screen.getByRole('searchbox', { name: /filter by title/i })).toBeInTheDocument();
  });

  it('renders a search landmark', () => {
    render(<MediaFilterBar {...makeProps()} />);
    expect(screen.getByRole('search', { name: /filter media library/i })).toBeInTheDocument();
  });

  it('does not show "Clear all" when isActive is false', () => {
    render(<MediaFilterBar {...makeProps({ isActive: false })} />);
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
  });

  it('shows "Clear all" button when isActive is true', () => {
    render(<MediaFilterBar {...makeProps({ isActive: true })} />);
    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
  });
});

// ─── Provider gating ──────────────────────────────────────────────────────────

describe('MediaFilterBar — provider gating', () => {
  it('renders movie filters when RADARR is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ ...propsFor(['RADARR']), lookups: EMPTY_LOOKUPS })} />);
    await addFilter(user, /has file/i);
    expect(screen.getByRole('button', { name: /downloaded/i })).toBeInTheDocument();
  });

  it('renders series filters when SONARR is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ ...propsFor(['SONARR']), lookups: EMPTY_LOOKUPS })} />);
    await addFilter(user, 'Monitored');
    expect(screen.getByRole('button', { name: 'Monitored' })).toBeInTheDocument();
  });

  it('renders tautulli watched filter when TAUTULLI is configured', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({ ...propsFor(['RADARR', 'TAUTULLI']), lookups: EMPTY_LOOKUPS })}
      />
    );
    await addFilter(user, 'Watched');
    expect(screen.getByRole('button', { name: 'Watched' })).toBeInTheDocument();
  });

  it('does not render movie filters when RADARR is not configured', () => {
    render(<MediaFilterBar {...makeProps({ ...propsFor(['SONARR']), lookups: EMPTY_LOOKUPS })} />);
    expect(screen.queryByRole('button', { name: /downloaded/i })).not.toBeInTheDocument();
  });

  it('does not render series filters when SONARR is not configured', () => {
    render(<MediaFilterBar {...makeProps({ ...propsFor(['RADARR']), lookups: EMPTY_LOOKUPS })} />);
    expect(screen.queryByRole('button', { name: /monitored/i })).not.toBeInTheDocument();
  });

  it('does not render tautulli filter when TAUTULLI is not configured', () => {
    render(
      <MediaFilterBar
        {...makeProps({ ...propsFor(['RADARR', 'SONARR']), lookups: EMPTY_LOOKUPS })}
      />
    );
    expect(screen.queryByRole('button', { name: /watched/i })).not.toBeInTheDocument();
  });

  it('renders a shared rule whose sole active producer is JELLYFIN, reachable via Add filter', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar {...makeProps({ ...propsFor(['JELLYFIN']), lookups: EMPTY_LOOKUPS })} />
    );
    await addFilter(user, 'Jellyfin favorite');
    expect(screen.getByRole('button', { name: 'Favorited' })).toBeInTheDocument();
  });

  it('renders a Plex+Jellyfin shared rule when only JELLYFIN is configured', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({
          ...propsFor(['JELLYFIN']),
          lookups: { ...RICH_LOOKUPS, labels: ['Anime'] },
        })}
      />
    );
    await addFilter(user, 'Labels');
    expect(screen.getByRole('button', { name: 'Labels' })).toBeInTheDocument();
  });
});

// ─── activeTab gating ─────────────────────────────────────────────────────────

describe('MediaFilterBar — activeTab prop', () => {
  it('shows only movie filters when activeTab is movies', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({
          ...propsFor(['RADARR', 'SONARR']),
          activeTab: 'movies',
          lookups: EMPTY_LOOKUPS,
        })}
      />
    );
    await addFilter(user, /has file/i);
    expect(screen.getByRole('button', { name: /downloaded/i })).toBeInTheDocument();
    // Series-only rules aren't even offered by the picker while on the movies tab.
    expect(screen.queryByRole('option', { name: 'Monitored' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /monitored/i })).not.toBeInTheDocument();
  });

  it('hides movie-only filters when activeTab is series', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({
          ...propsFor(['RADARR', 'SONARR']),
          activeTab: 'series',
          lookups: EMPTY_LOOKUPS,
        })}
      />
    );
    await addFilter(user, 'Monitored');
    // Movie-only rules aren't offered on the series tab; shared rules are.
    expect(screen.queryByRole('option', { name: /imdb rating/i })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /has file/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Monitored' })).toBeInTheDocument();
  });
});

// ─── Multi-select dropdowns ───────────────────────────────────────────────────

describe('MediaFilterBar — MultiSelectDropdown', () => {
  it('renders movie tags dropdown when radarr tags are present', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ lookups: RICH_LOOKUPS })} />);
    await addFilter(user, /movie tags/i);
    expect(screen.getByRole('button', { name: /movie tags/i })).toBeInTheDocument();
  });

  it('renders series tags dropdown when sonarr tags are present', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ lookups: RICH_LOOKUPS })} />);
    await addFilter(user, /series tags/i);
    expect(screen.getByRole('button', { name: /series tags/i })).toBeInTheDocument();
  });

  it('renders movie genres dropdown when movie genres are present', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ lookups: RICH_LOOKUPS })} />);
    await addFilter(user, /movie genres/i);
    expect(screen.getByRole('button', { name: /movie genres/i })).toBeInTheDocument();
  });

  it('renders network dropdown when networks are present', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ lookups: RICH_LOOKUPS })} />);
    await addFilter(user, /network/i);
    expect(screen.getByRole('button', { name: /network/i })).toBeInTheDocument();
  });

  it('renders movie studio dropdown when studio options are present', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({
          lookups: RICH_LOOKUPS,
          rules: rulesFor(new Set(['RADARR', 'SONARR', 'TAUTULLI', 'PLEX'])),
        })}
      />
    );
    await addFilter(user, /movie studio/i);
    expect(screen.getByRole('button', { name: /movie studio/i })).toBeInTheDocument();
  });

  it('renders file container dropdown when file container options are present', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({
          lookups: RICH_LOOKUPS,
          rules: rulesFor(new Set(['RADARR', 'SONARR', 'TAUTULLI', 'PLEX'])),
        })}
      />
    );
    await addFilter(user, /file container/i);
    expect(screen.getByRole('button', { name: /file container/i })).toBeInTheDocument();
  });

  it('renders labels dropdown when label options are present', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({
          lookups: RICH_LOOKUPS,
          rules: rulesFor(new Set(['RADARR', 'SONARR', 'TAUTULLI', 'PLEX'])),
        })}
      />
    );
    await addFilter(user, 'Labels');
    expect(screen.getByRole('button', { name: 'Labels' })).toBeInTheDocument();
  });

  it('renders language profile dropdown when sonarr language profiles are present', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ lookups: RICH_LOOKUPS })} />);
    await addFilter(user, /language profile/i);
    expect(screen.getByRole('button', { name: /language profile/i })).toBeInTheDocument();
  });

  it('does not render language profile dropdown when no sonarr language profiles', () => {
    render(<MediaFilterBar {...makeProps({ lookups: EMPTY_LOOKUPS })} />);
    expect(screen.queryByRole('button', { name: /language profile/i })).not.toBeInTheDocument();
  });

  it('does not render movie tags dropdown when no radarr tags', () => {
    render(<MediaFilterBar {...makeProps({ lookups: EMPTY_LOOKUPS })} />);
    expect(screen.queryByRole('button', { name: /movie tags/i })).not.toBeInTheDocument();
  });

  it('opens the dropdown menu on click', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ lookups: RICH_LOOKUPS })} />);
    await addFilter(user, /movie tags/i);
    await user.click(screen.getByRole('button', { name: /movie tags/i }));
    expect(screen.getByRole('menu', { name: /movie tags/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /4k/i })).toBeInTheDocument();
  });

  it('closes the dropdown on Escape', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ lookups: RICH_LOOKUPS })} />);
    await addFilter(user, /movie tags/i);
    await user.click(screen.getByRole('button', { name: /movie tags/i }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: /movie tags/i })).not.toBeInTheDocument();
  });

  it('calls onRuleChange when a tag is selected', async () => {
    const onRuleChange = vi.fn();
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ lookups: RICH_LOOKUPS, onRuleChange })} />);
    await addFilter(user, /movie tags/i);
    await user.click(screen.getByRole('button', { name: /movie tags/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /4k/i }));
    expect(onRuleChange).toHaveBeenCalledWith('movie', 'tagIds', '1');
  });

  it('deselects a tag by clicking it again', async () => {
    const onRuleChange = vi.fn();
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({
          lookups: RICH_LOOKUPS,
          onRuleChange,
          values: valuesWith({ movie: { tagIds: '1' } }),
        })}
      />
    );
    await user.click(screen.getByRole('button', { name: /movie tags, 1 selected/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /4k/i }));
    expect(onRuleChange).toHaveBeenCalledWith('movie', 'tagIds', undefined);
  });
});

// ─── Title search input ───────────────────────────────────────────────────────

describe('MediaFilterBar — title input', () => {
  it('shows the current title value', () => {
    render(
      <MediaFilterBar {...makeProps({ values: valuesWith({ shared: { title: 'batman' } }) })} />
    );
    expect(screen.getByRole('searchbox', { name: /filter by title/i })).toHaveValue('batman');
  });

  it('calls onRuleChange on input change', () => {
    const onRuleChange = vi.fn();
    render(<MediaFilterBar {...makeProps({ onRuleChange })} />);
    fireEvent.change(screen.getByRole('searchbox', { name: /filter by title/i }), {
      target: { value: 'matrix' },
    });
    expect(onRuleChange).toHaveBeenCalledWith('shared', 'title', 'matrix');
  });
});

// ─── Clear all ────────────────────────────────────────────────────────────────

describe('MediaFilterBar — clearAll', () => {
  it('calls clearAll when the button is clicked', async () => {
    const clearAll = vi.fn();
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ isActive: true, clearAll })} />);
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(clearAll).toHaveBeenCalledOnce();
  });
});

// ─── Active-conditions summary row ────────────────────────────────────────────

describe('MediaFilterBar — active conditions summary', () => {
  it('does not render the summary row when inactive', () => {
    render(<MediaFilterBar {...makeProps({ isActive: false })} />);
    expect(screen.queryByText(/filtering by/i)).not.toBeInTheDocument();
  });

  it('summarises active filters as a labelled count', () => {
    render(
      <MediaFilterBar
        {...makeProps({
          isActive: true,
          values: valuesWith({ shared: { title: '', hasFile: 'true', year: { min: 2010 } } }),
        })}
      />
    );
    // hasFile=Downloaded + Year → 2 conditions
    expect(screen.getByText(/filtering by 2 conditions/i)).toBeInTheDocument();
  });

  it('uses the singular noun for a single condition', () => {
    render(
      <MediaFilterBar
        {...makeProps({ isActive: true, values: valuesWith({ shared: { hasFile: 'true' } }) })}
      />
    );
    expect(screen.getByText(/filtering by 1 condition$/i)).toBeInTheDocument();
  });

  it('renders a removable chip per active condition that clears just that filter', async () => {
    const onRuleChange = vi.fn();
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({
          isActive: true,
          values: valuesWith({ shared: { title: '', hasFile: 'true', year: { min: 2010 } } }),
          onRuleChange,
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: /remove filter: downloaded/i }));
    expect(onRuleChange).toHaveBeenCalledWith('shared', 'hasFile', undefined);
    expect(onRuleChange).not.toHaveBeenCalledWith('shared', 'year', undefined);
  });

  it('clears both ends of a range filter from its chip', async () => {
    const onRuleChange = vi.fn();
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({
          isActive: true,
          values: valuesWith({ shared: { title: '', year: { min: 2010, max: 2020 } } }),
          onRuleChange,
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: /remove filter: year/i }));
    expect(onRuleChange).toHaveBeenCalledWith('shared', 'year', undefined);
  });

  it('shows the Save as query action only when onSaveQuery is provided', () => {
    const onSaveQuery = vi.fn();
    const { rerender } = render(
      <MediaFilterBar
        {...makeProps({ isActive: true, values: valuesWith({ shared: { hasFile: 'true' } }) })}
      />
    );
    expect(screen.queryByRole('button', { name: /save as query/i })).not.toBeInTheDocument();

    rerender(
      <MediaFilterBar
        {...makeProps({
          isActive: true,
          values: valuesWith({ shared: { hasFile: 'true' } }),
          onSaveQuery,
        })}
      />
    );
    expect(screen.getByRole('button', { name: /save as query/i })).toBeInTheDocument();
  });
});

// ─── Mobile bottom sheet ──────────────────────────────────────────────────────

describe('MediaFilterBar — mobile sheet', () => {
  it('does not render the mobile dialog when mobileOpen is false', () => {
    render(<MediaFilterBar {...makeProps({ mobileOpen: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the mobile dialog when mobileOpen is true', () => {
    render(<MediaFilterBar {...makeProps({ mobileOpen: true })} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('renders Done button in mobile dialog', () => {
    render(<MediaFilterBar {...makeProps({ mobileOpen: true })} />);
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
  });

  it('calls onMobileClose when Done is clicked', async () => {
    const onMobileClose = vi.fn();
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ mobileOpen: true, onMobileClose })} />);
    await user.click(screen.getByRole('button', { name: /done/i }));
    expect(onMobileClose).toHaveBeenCalledOnce();
  });

  it('calls onMobileClose on Escape key', async () => {
    const onMobileClose = vi.fn();
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ mobileOpen: true, onMobileClose })} />);
    await user.keyboard('{Escape}');
    expect(onMobileClose).toHaveBeenCalledOnce();
  });

  it('shows Clear all in mobile dialog when isActive', () => {
    render(<MediaFilterBar {...makeProps({ mobileOpen: true, isActive: true })} />);
    expect(screen.getAllByRole('button', { name: /clear all/i }).length).toBeGreaterThan(0);
  });

  it('renders movie chips section in mobile dialog when RADARR configured', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({ mobileOpen: true, ...propsFor(['RADARR']), lookups: EMPTY_LOOKUPS })}
      />
    );
    await addFilter(user, /imdb rating/i, within(screen.getByRole('dialog')));
    expect(screen.getByRole('heading', { name: 'Movies' })).toBeInTheDocument();
  });

  it('renders series chips section in mobile dialog when SONARR configured', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({ mobileOpen: true, ...propsFor(['SONARR']), lookups: EMPTY_LOOKUPS })}
      />
    );
    await addFilter(user, 'Monitored', within(screen.getByRole('dialog')));
    expect(screen.getByRole('heading', { name: 'Series' })).toBeInTheDocument();
  });
});

// ─── OptionFilter integration ─────────────────────────────────────────────────

describe('MediaFilterBar — OptionFilter interactions', () => {
  it('calls onRuleChange when a movie file-status option is clicked', async () => {
    const onRuleChange = vi.fn();
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({ ...propsFor(['RADARR']), lookups: EMPTY_LOOKUPS, onRuleChange })}
      />
    );
    await addFilter(user, /has file/i);
    await user.click(screen.getByRole('button', { name: /downloaded/i }));
    expect(onRuleChange).toHaveBeenCalledWith('shared', 'hasFile', 'true');
  });

  it('clears hasFile when clicking the active option again', async () => {
    const onRuleChange = vi.fn();
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({
          ...propsFor(['RADARR']),
          lookups: EMPTY_LOOKUPS,
          onRuleChange,
          values: valuesWith({ shared: { hasFile: 'true' } }),
        })}
      />
    );
    await user.click(screen.getByRole('button', { name: /downloaded/i }));
    expect(onRuleChange).toHaveBeenCalledWith('shared', 'hasFile', undefined);
  });

  it('calls onRuleChange when a series status option is clicked', async () => {
    const onRuleChange = vi.fn();
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({ ...propsFor(['SONARR']), lookups: EMPTY_LOOKUPS, onRuleChange })}
      />
    );
    await addFilter(user, 'Status');
    await user.click(screen.getByRole('button', { name: /continuing/i }));
    expect(onRuleChange).toHaveBeenCalledWith('series', 'seriesStatus', 'continuing');
  });

  it('calls onRuleChange when a watched option is clicked', async () => {
    const onRuleChange = vi.fn();
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({ ...propsFor(['TAUTULLI']), lookups: EMPTY_LOOKUPS, onRuleChange })}
      />
    );
    await addFilter(user, 'Watched');
    await user.click(screen.getByRole('button', { name: /unwatched/i }));
    expect(onRuleChange).toHaveBeenCalledWith('shared', 'watched', 'false');
  });
});

// ─── Predicate controls ────────────────────────────────────────────────────────

describe('MediaFilterBar — movie predicate controls', () => {
  it('renders Added filter in movies section when RADARR is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps(propsFor(['RADARR']))} />);
    await addFilter(user, 'Added');
    expect(screen.getByRole('button', { name: /added/i })).toBeInTheDocument();
  });

  it('renders Size filter in movies section when RADARR is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps(propsFor(['RADARR']))} />);
    await addFilter(user, /size/i);
    expect(screen.getByRole('button', { name: /size/i })).toBeInTheDocument();
  });

  it('renders IMDB Rating filter in movies section when RADARR is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps(propsFor(['RADARR']))} />);
    await addFilter(user, /imdb rating/i);
    expect(screen.getByRole('button', { name: /imdb rating/i })).toBeInTheDocument();
  });

  it('does not render movie-specific filters when RADARR is not configured', () => {
    render(<MediaFilterBar {...makeProps(propsFor(['SONARR']))} />);
    expect(screen.queryByRole('button', { name: /imdb rating/i })).not.toBeInTheDocument();
  });
});

describe('MediaFilterBar — Radarr new-field controls', () => {
  it('renders movie file count range filter when RADARR is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps(propsFor(['RADARR']))} />);
    await addFilter(user, /movie file count/i);
    expect(screen.getByRole('button', { name: /movie file count/i })).toBeInTheDocument();
  });

  it('renders in cinemas / physical release / digital release range filters', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps(propsFor(['RADARR']))} />);
    await addFilter(user, /in cinemas/i);
    expect(screen.getByRole('button', { name: /in cinemas/i })).toBeInTheDocument();
    await addFilter(user, /physical release/i);
    expect(screen.getByRole('button', { name: /physical release/i })).toBeInTheDocument();
    await addFilter(user, /digital release/i);
    expect(screen.getByRole('button', { name: /digital release/i })).toBeInTheDocument();
  });

  it('renders release group dropdown when release group options are present', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ ...propsFor(['RADARR']), lookups: RICH_LOOKUPS })} />);
    await addFilter(user, /release group/i);
    expect(screen.getByRole('button', { name: /release group/i })).toBeInTheDocument();
  });

  it('does not render release group dropdown when no release group options', () => {
    render(<MediaFilterBar {...makeProps({ ...propsFor(['RADARR']), lookups: EMPTY_LOOKUPS })} />);
    expect(screen.queryByRole('button', { name: /release group/i })).not.toBeInTheDocument();
  });

  it('renders collection dropdown when collection name options are present', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ ...propsFor(['RADARR']), lookups: RICH_LOOKUPS })} />);
    await addFilter(user, 'Collection');
    expect(screen.getByRole('button', { name: 'Collection' })).toBeInTheDocument();
  });

  it('does not render collection dropdown when no collection name options', () => {
    render(<MediaFilterBar {...makeProps({ ...propsFor(['RADARR']), lookups: EMPTY_LOOKUPS })} />);
    expect(screen.queryByRole('button', { name: 'Collection' })).not.toBeInTheDocument();
  });

  it('renders isAvailable boolean filter with Available/Unavailable labels', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps(propsFor(['RADARR']))} />);
    await addFilter(user, 'Available');
    expect(screen.getByRole('button', { name: 'Available' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeInTheDocument();
  });

  it('calls onRuleChange when an isAvailable option is clicked', async () => {
    const onRuleChange = vi.fn();
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({ ...propsFor(['RADARR']), lookups: EMPTY_LOOKUPS, onRuleChange })}
      />
    );
    await addFilter(user, 'Available');
    await user.click(screen.getByRole('button', { name: 'Available' }));
    expect(onRuleChange).toHaveBeenCalledWith('movie', 'isAvailable', 'true');
  });

  it('renders radarrStatus enum options', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps(propsFor(['RADARR']))} />);
    await addFilter(user, /radarr status/i);
    expect(screen.getByRole('button', { name: 'Released' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In Cinemas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deleted' })).toBeInTheDocument();
  });

  it('calls onRuleChange when a radarrStatus option is clicked', async () => {
    const onRuleChange = vi.fn();
    const user = setupUser();
    render(
      <MediaFilterBar
        {...makeProps({ ...propsFor(['RADARR']), lookups: EMPTY_LOOKUPS, onRuleChange })}
      />
    );
    await addFilter(user, /radarr status/i);
    await user.click(screen.getByRole('button', { name: 'Released' }));
    expect(onRuleChange).toHaveBeenCalledWith('movie', 'radarrStatus', 'released');
  });
});

describe('MediaFilterBar — play history controls', () => {
  it('shows Watched filter when PLEX is configured (not just TAUTULLI)', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ ...propsFor(['PLEX']), lookups: EMPTY_LOOKUPS })} />);
    await addFilter(user, 'Watched');
    expect(screen.getByRole('button', { name: 'Watched' })).toBeInTheDocument();
  });

  it('shows Last Watched range filter when TAUTULLI is configured', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar {...makeProps({ ...propsFor(['TAUTULLI']), lookups: EMPTY_LOOKUPS })} />
    );
    await addFilter(user, /last watched/i);
    expect(screen.getByRole('button', { name: /last watched/i })).toBeInTheDocument();
  });

  it('shows Last Watched range filter when PLEX is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ ...propsFor(['PLEX']), lookups: EMPTY_LOOKUPS })} />);
    await addFilter(user, /last watched/i);
    expect(screen.getByRole('button', { name: /last watched/i })).toBeInTheDocument();
  });

  it('does not show play history controls when neither TAUTULLI nor PLEX configured', () => {
    render(<MediaFilterBar {...makeProps({ ...propsFor(['RADARR']), lookups: EMPTY_LOOKUPS })} />);
    expect(screen.queryByRole('button', { name: /last watched/i })).not.toBeInTheDocument();
  });
});

describe('MediaFilterBar — Overseerr controls', () => {
  it('shows Has Issue filter when OVERSEERR is configured', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar {...makeProps({ ...propsFor(['OVERSEERR']), lookups: EMPTY_LOOKUPS })} />
    );
    await addFilter(user, /has issue/i);
    expect(screen.getByRole('button', { name: /has issue/i })).toBeInTheDocument();
  });

  it('shows Request Status options (e.g. Approved) when OVERSEERR is configured', async () => {
    const user = setupUser();
    render(
      <MediaFilterBar {...makeProps({ ...propsFor(['OVERSEERR']), lookups: EMPTY_LOOKUPS })} />
    );
    await addFilter(user, 'Status');
    expect(screen.getByRole('button', { name: 'Approved' })).toBeInTheDocument();
  });

  it('does not show Overseerr controls when OVERSEERR is not configured', () => {
    render(<MediaFilterBar {...makeProps({ ...propsFor(['RADARR']), lookups: EMPTY_LOOKUPS })} />);
    expect(screen.queryByRole('button', { name: /has issue/i })).not.toBeInTheDocument();
  });
});

describe('MediaFilterBar — TMDB controls', () => {
  it('shows TMDB Status options (e.g. Returning Series) when TMDB is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps({ ...propsFor(['TMDB']), lookups: EMPTY_LOOKUPS })} />);
    await addFilter(user, /tmdb status/i);
    expect(screen.getByRole('button', { name: 'Returning Series' })).toBeInTheDocument();
  });

  it('does not show TMDB Status options when TMDB is not configured', () => {
    render(<MediaFilterBar {...makeProps({ ...propsFor(['RADARR']), lookups: EMPTY_LOOKUPS })} />);
    expect(screen.queryByRole('button', { name: 'Returning Series' })).not.toBeInTheDocument();
  });
});

describe('MediaFilterBar — series predicate controls', () => {
  it('renders Sonarr Rating filter in series section when SONARR is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps(propsFor(['SONARR']))} />);
    await addFilter(user, /sonarr rating/i);
    expect(screen.getByRole('button', { name: /sonarr rating/i })).toBeInTheDocument();
  });

  it('renders Ended filter in series section when SONARR is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps(propsFor(['SONARR']))} />);
    await addFilter(user, 'Ended');
    expect(screen.getByRole('button', { name: 'Finished' })).toBeInTheDocument();
  });

  it('renders Last Aired filter in series section when SONARR is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps(propsFor(['SONARR']))} />);
    await addFilter(user, /last aired/i);
    expect(screen.getByRole('button', { name: /last aired/i })).toBeInTheDocument();
  });

  it('renders % Episodes filter in series section when SONARR is configured', async () => {
    const user = setupUser();
    render(<MediaFilterBar {...makeProps(propsFor(['SONARR']))} />);
    await addFilter(user, /% episodes/i);
    expect(screen.getByRole('button', { name: /% episodes/i })).toBeInTheDocument();
  });

  it('does not render series-specific filters when SONARR is not configured', () => {
    render(<MediaFilterBar {...makeProps(propsFor(['RADARR']))} />);
    expect(screen.queryByRole('button', { name: /sonarr rating/i })).not.toBeInTheDocument();
  });
});

// ─── Rendering from the descriptor alone ──────────────────────────────────────
//
// Rules here exist only as descriptors: no key in this file's fixtures or in the
// component names them, so they render correctly only if the descriptor carries
// everything the control needs.

describe('MediaFilterBar — renders a rule it has never seen', () => {
  it('labels a boolean rule with the value labels its descriptor carries', async () => {
    const user = setupUser();
    const remastered: MediaRuleDescriptor = {
      key: 'isRemastered',
      label: 'Remaster',
      group: 'Movies',
      contentTypes: ['movie'],
      dataType: 'boolean',
      valueLabels: { true: 'Remastered', false: 'Original cut' },
    };
    render(<MediaFilterBar {...makeProps({ rules: [remastered] })} />);
    await addFilter(user, 'Remaster');
    expect(screen.getByRole('button', { name: 'Remastered' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Original cut' })).toBeInTheDocument();
  });

  it("offers an enum rule's descriptor options under its short label", async () => {
    const user = setupUser();
    const hdrFormat: MediaRuleDescriptor = {
      key: 'hdrFormat',
      label: 'HDR format',
      group: 'Movies',
      contentTypes: ['movie'],
      dataType: 'string',
      options: [
        { value: 'dolbyVision', label: 'Dolby Vision' },
        { value: 'hdr10', label: 'HDR10' },
      ],
      shortLabel: 'HDR',
    };
    const onRuleChange = vi.fn();
    render(<MediaFilterBar {...makeProps({ rules: [hdrFormat], onRuleChange })} />);
    await addFilter(user, 'HDR format');
    expect(screen.getByText('HDR')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dolby Vision' }));
    expect(onRuleChange).toHaveBeenCalledWith('movie', 'hdrFormat', 'dolbyVision');
  });

  it("offers a multi-value rule's options from the lookup its descriptor names", async () => {
    const user = setupUser();
    const codecFamily: MediaRuleDescriptor = {
      key: 'codecFamily',
      label: 'Codec family',
      group: 'Movies',
      contentTypes: ['movie'],
      dataType: 'csv-strings',
      lookup: 'videoCodecs',
    };
    const preferredProfile: MediaRuleDescriptor = {
      key: 'preferredProfileIds',
      label: 'Preferred profile',
      group: 'Movies',
      contentTypes: ['movie'],
      dataType: 'instance-ids',
      instanceScoped: true,
      lookup: 'qualityProfiles',
    };
    render(
      <MediaFilterBar
        {...makeProps({ rules: [codecFamily, preferredProfile], lookups: RICH_LOOKUPS })}
      />
    );
    await addFilter(user, 'Codec family');
    await user.click(screen.getByRole('button', { name: /codec family/i }));
    expect(screen.getByRole('menuitemcheckbox', { name: /hevc/i })).toBeInTheDocument();

    await addFilter(user, 'Preferred profile');
    await user.click(screen.getByRole('button', { name: /preferred profile/i }));
    expect(screen.getByRole('menuitemcheckbox', { name: /HD-1080p/i })).toBeInTheDocument();
  });

  it('renders a string rule with no options as a free-text input', async () => {
    const user = setupUser();
    const edition: MediaRuleDescriptor = {
      key: 'edition',
      label: 'Edition',
      group: 'Movies',
      contentTypes: ['movie'],
      dataType: 'string',
    };
    const onRuleChange = vi.fn();
    render(<MediaFilterBar {...makeProps({ rules: [edition], onRuleChange })} />);
    await addFilter(user, 'Edition');
    fireEvent.change(screen.getByRole('textbox', { name: 'Edition' }), {
      target: { value: "Director's Cut" },
    });
    expect(onRuleChange).toHaveBeenCalledWith('movie', 'edition', "Director's Cut");
  });

  it('shows a rule under the section heading its descriptor names, on desktop and mobile', async () => {
    const user = setupUser();
    const atmos: MediaRuleDescriptor = {
      key: 'dolbyAtmos',
      label: 'Dolby Atmos',
      contentTypes: ['movie', 'series'],
      dataType: 'boolean',
      valueLabels: { true: 'Atmos', false: 'No Atmos' },
      group: 'Audio',
    };
    render(<MediaFilterBar {...makeProps({ rules: [atmos], mobileOpen: true })} />);
    await addFilter(user, 'Dolby Atmos', within(screen.getByRole('dialog')));
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'Audio' })
    ).toBeVisible();
    expect(within(screen.getByRole('search')).getByText('Audio')).toBeInTheDocument();
  });
});
