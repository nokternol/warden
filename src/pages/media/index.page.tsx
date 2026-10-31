import AppLayout from '@app/components/AppLayout';
import { LoadError } from '@app/components/AsyncBoundary';
import EmptyState from '@app/components/EmptyState';
import MediaCard from '@app/components/MediaCard';
import { MediaFilterBar } from '@app/components/MediaFilterBar';
import RatingsPanel from '@app/components/RatingsPanel';
import { SaveQueryDialog } from '@app/components/SaveQueryDialog';
import SidebarNav from '@app/components/SidebarNav';
import { Tabs } from '@app/components/Tabs';
import TopBar from '@app/components/TopBar';
import { VirtualMediaGrid } from '@app/components/VirtualMediaGrid';
import type { CardDensity } from '@app/hooks/useCardDensity';
import { useCardDensity } from '@app/hooks/useCardDensity';
import type {
  ContentScope,
  FilterState,
  FilterValue,
  QualifierScope,
} from '@app/hooks/useMediaFilters';
import { useMediaFilters } from '@app/hooks/useMediaFilters';
import { useMediaLookups } from '@app/hooks/useMediaLookups';
import type { MediaQualityProfile, MediaTag } from '@app/hooks/useMediaLookups';
import { useMediaQueries } from '@app/hooks/useMediaQueries';
import { useMediaRules } from '@app/hooks/useMediaRules';
import type { MediaSourceDescriptor } from '@app/hooks/useMediaSources';
import { useMediaSources } from '@app/hooks/useMediaSources';
import type { ManagedMovie } from '@app/hooks/useMovies';
import { useMovies } from '@app/hooks/useMovies';
import { descriptorFor, useProviderTypes } from '@app/hooks/useProviderTypes';
import type { ManagedSeries } from '@app/hooks/useSeries';
import { useSeries } from '@app/hooks/useSeries';
import { toFilters } from '@app/lib/mediaQueryAdapters';
import { cn } from '@app/lib/utils/cn';
import { guardPage } from '@app/lib/utils/guardPage';
import type { MediaRuleDescriptor } from '@contract/media';
import type { ProviderType } from '@contract/providers';
import type { ContentType } from '@contract/schemas';
import { isOfferedSection, scope } from '@contract/scope';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Film,
  Filter,
  SearchX,
  ServerOff,
  Tv2,
} from 'lucide-react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const RATINGS_PANEL_OFFERED = isOfferedSection(scope, 'mediaRatingsPanel');

// ─── Density icons ────────────────────────────────────────────────────────────

function GridIcon2x2() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <path d="M3 12h18M12 3v18" />
    </svg>
  );
}

function GridIcon3x3() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}

function GridIcon4x3() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <path d="M3 9h18M3 15h18M7.5 3v18M12 3v18M16.5 3v18" />
    </svg>
  );
}

function GridIcon5x3() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <path d="M3 9h18M3 15h18M6.6 3v18M10.2 3v18M13.8 3v18M17.4 3v18" />
    </svg>
  );
}

// ─── Sort bar ─────────────────────────────────────────────────────────────────

type SortField = 'title' | 'year' | 'status';

const SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'year', label: 'Year' },
  { value: 'status', label: 'Status' },
];

function parseSortValue(sort: string | undefined): { field: SortField; dir: 'asc' | 'desc' } {
  const s = sort ?? 'title_asc';
  const dir = s.endsWith('_desc') ? 'desc' : 'asc';
  const field = s.replace(/_(?:asc|desc)$/, '') as SortField;
  return { field, dir };
}

function SortFieldPicker({
  field,
  onChange,
  isNonDefault,
}: {
  field: SortField;
  onChange: (f: SortField) => void;
  isNonDefault: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus the currently-selected item when the menu opens
  useEffect(() => {
    if (!open) return;
    const selectedIndex = SORT_FIELDS.findIndex((f_) => f_.value === field);
    itemRefs.current[selectedIndex >= 0 ? selectedIndex : 0]?.focus();
  }, [open, field]);

  const handleMenuKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      itemRefs.current[(index + 1) % SORT_FIELDS.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      itemRefs.current[(index - 1 + SORT_FIELDS.length) % SORT_FIELDS.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      itemRefs.current[SORT_FIELDS.length - 1]?.focus();
    }
  };

  const currentLabel = SORT_FIELDS.find((f_) => f_.value === field)?.label ?? 'Title';

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Sort by"
        className={cn(
          'flex items-center gap-1 text-xs font-medium px-1.5 py-1 max-sm:min-h-[44px] rounded transition-colors',
          isNonDefault
            ? 'text-primary-text hover:text-primary-text'
            : 'text-text-secondary hover:text-text-primary'
        )}
      >
        {currentLabel}
        <ChevronDown
          size={12}
          strokeWidth={2.5}
          className="opacity-50 flex-shrink-0"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Sort by"
          className="absolute top-full left-0 mt-1 bg-surface-elevated border border-border rounded-md shadow-lg py-1 z-20 min-w-[80px]"
        >
          {SORT_FIELDS.map((opt, index) => (
            <button
              key={opt.value}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={field === opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              onKeyDown={(e) => handleMenuKeyDown(e, index)}
              className={cn(
                'w-full text-left px-3 py-1.5 max-sm:min-h-[44px] text-xs transition-colors focus:bg-surface-panel',
                field === opt.value
                  ? 'text-primary-text font-medium'
                  : 'text-text-secondary hover:bg-surface-panel'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortBar({
  sortValue,
  onSortChange,
  count,
  tab,
  isLoading,
  failed,
  density,
  onDensityChange,
}: {
  sortValue: string;
  onSortChange: (v: string) => void;
  count: number;
  tab: ActiveTab;
  isLoading: boolean;
  failed: boolean;
  density: CardDensity;
  onDensityChange: (d: CardDensity) => void;
}) {
  const { field, dir } = parseSortValue(sortValue);
  const isNonDefault = sortValue !== 'title_asc';

  const handleFieldChange = (f: SortField) => onSortChange(`${f}_${dir}`);
  const handleDirToggle = () => onSortChange(`${field}_${dir === 'asc' ? 'desc' : 'asc'}`);

  return (
    <div
      role="toolbar"
      aria-label="Sort and result count"
      className="flex items-center justify-between px-4 sm:px-6 py-2 bg-surface-panel border-b border-border"
    >
      <div className="flex items-center gap-0.5">
        <span className="text-xs text-text-muted select-none mr-0.5">Sort:</span>
        <SortFieldPicker field={field} onChange={handleFieldChange} isNonDefault={isNonDefault} />
        <button
          type="button"
          onClick={handleDirToggle}
          aria-label={dir === 'asc' ? 'Sort descending' : 'Sort ascending'}
          className={cn(
            'flex items-center justify-center size-11 sm:size-6 rounded transition-colors',
            isNonDefault
              ? 'text-primary-text hover:text-primary-text'
              : 'text-text-muted hover:text-text-secondary'
          )}
        >
          {dir === 'asc' ? (
            <ArrowUp size={14} strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <ArrowDown size={14} strokeWidth={2.5} aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* Card density toggle */}
        <div
          className="hidden md:flex items-center border border-border rounded-md overflow-hidden"
          role="group"
          aria-label="Card density"
        >
          {(
            [
              { value: 'large', label: 'Large card size', Icon: GridIcon2x2 },
              { value: 'normal', label: 'Normal card size', Icon: GridIcon3x3 },
              { value: 'compact', label: 'Compact card size', Icon: GridIcon4x3 },
              { value: 'mini', label: 'Mini card size', Icon: GridIcon5x3 },
            ] as const
          ).map(({ value, label, Icon }, i) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              aria-pressed={density === value}
              onClick={() => onDensityChange(value)}
              className={cn(
                'flex items-center justify-center w-7 h-7 transition-colors',
                i > 0 && 'border-l border-border',
                density === value
                  ? 'bg-primary text-on-primary'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              )}
            >
              <Icon />
            </button>
          ))}
        </div>

        <div aria-live="polite" aria-atomic="true" className="flex items-center">
          {isLoading ? (
            <span className="inline-block h-3 w-16 rounded bg-surface-elevated animate-pulse" />
          ) : failed ? null : (
            <span className="text-xs text-text-muted tabular-nums">
              <span className="text-text-secondary font-medium">{count.toLocaleString()}</span>{' '}
              {tab === 'movies' ? 'movies' : 'series'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPosterUrl(images?: { coverType: string; remoteUrl: string }[]): string | undefined {
  return images?.find((img) => img.coverType === 'poster')?.remoteUrl;
}

function isFilterValueActive(value: FilterValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === 'object') return value.min !== undefined || value.max !== undefined;
  return value !== '';
}

/** Counts every active condition affecting this tab's results: shared values plus the tab's own scope. */
function countActiveFilters(values: FilterState, tab: ActiveTab): number {
  const scope: ContentScope = tab === 'movies' ? 'movie' : 'series';
  const countBucket = (bucket: Record<string, FilterValue>) =>
    Object.values(bucket).filter(isFilterValueActive).length;
  return countBucket(values.shared) + countBucket(values[scope]);
}

function useSentinel(onIntersect: () => void) {
  const onIntersectRef = useRef(onIntersect);
  useEffect(() => {
    onIntersectRef.current = onIntersect;
  }, [onIntersect]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  return useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onIntersectRef.current();
      },
      { rootMargin: '200px' }
    );
    observerRef.current.observe(el);
  }, []);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectedMedia {
  title: string;
  year?: number;
}

export type ActiveTab = 'movies' | 'series';

export interface MediaSlice<T> {
  items: T[];
  totalCount: number;
  yearRange: { min: number | null; max: number | null } | null;
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  fetchMore: () => void;
  error?: Error;
  refresh?: () => unknown;
  /** Sources that failed while the browse itself succeeded. */
  sourceErrors?: { provider: string; error: string }[];
}

interface Lookups {
  tags: { radarr: MediaTag[]; sonarr: MediaTag[] };
  qualityProfiles: { radarr: MediaQualityProfile[]; sonarr: MediaQualityProfile[] };
  genres: { movies: string[]; series: string[] };
  networks: string[];
  studio: string[];
  fileContainers: string[];
  videoCodecs: string[];
  audioCodecs: string[];
  fileResolutions: string[];
  labels: string[];
  releaseGroups: string[];
  collectionNames: string[];
  languageProfiles: MediaQualityProfile[];
}

export interface MediaContentProps {
  // filter bar
  rules: MediaRuleDescriptor[];
  values: FilterState;
  onRuleChange: (scope: ContentScope, key: string, value: FilterValue | undefined) => void;
  onQualifierChange: (scope: QualifierScope, key: string, providerId: number | undefined) => void;
  clearAll: () => void;
  isActive: boolean;
  activeFilterCount: number;
  // sort
  movieSort: string;
  seriesSort: string;
  setMovieSort: (v: string) => void;
  setSeriesSort: (v: string) => void;
  // tab
  activeTab: ActiveTab;
  // save query
  onSaveQuery?: () => void;
  // mobile filter overlay
  filtersOpen: boolean;
  onFiltersClose: () => void;
  // data
  movies: MediaSlice<ManagedMovie>;
  series: MediaSlice<ManagedSeries>;
  lookups: Lookups;
  sources: Record<ContentType, MediaSourceDescriptor> | undefined;
  // card density
  density: CardDensity;
  onDensityChange: (d: CardDensity) => void;
}

/** Results may be partial when a source failed, so the failure is stated beside them. */
function SourceErrors({ errors = [] }: { errors?: { provider: string; error: string }[] }) {
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-text-primary"
    >
      {errors.map(({ provider, error }) => (
        <p key={provider} className="break-words">
          Couldn't reach {provider}: {error}
        </p>
      ))}
    </div>
  );
}

// ─── MediaContent ─────────────────────────────────────────────────────────────

export function MediaContent({
  rules,
  values,
  onRuleChange,
  onQualifierChange,
  clearAll,
  onSaveQuery,
  isActive,
  activeFilterCount,
  movieSort,
  seriesSort,
  setMovieSort,
  setSeriesSort,
  activeTab,
  filtersOpen,
  onFiltersClose,
  movies,
  series,
  lookups,
  sources,
  density,
  onDensityChange,
}: MediaContentProps) {
  const { types } = useProviderTypes();
  const providerLabel = (type: ProviderType) => descriptorFor(types, type)?.label ?? type;
  const [selected, setSelected] = useState<SelectedMedia | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const movieSentinelRef = useSentinel(movies.fetchMore);
  const seriesSentinelRef = useSentinel(series.fetchMore);

  return (
    <>
      <MediaFilterBar
        rules={rules}
        values={values}
        onRuleChange={onRuleChange}
        onQualifierChange={onQualifierChange}
        clearAll={clearAll}
        onSaveQuery={onSaveQuery}
        isActive={isActive}
        movieYearRange={movies.yearRange}
        seriesYearRange={series.yearRange}
        lookups={lookups}
        sources={sources}
        activeTab={activeTab}
        mobileOpen={filtersOpen}
        onMobileClose={onFiltersClose}
      />

      <SortBar
        sortValue={activeTab === 'movies' ? movieSort : seriesSort}
        onSortChange={activeTab === 'movies' ? setMovieSort : setSeriesSort}
        count={activeTab === 'movies' ? movies.totalCount : series.totalCount}
        tab={activeTab}
        isLoading={activeTab === 'movies' ? movies.isLoading : series.isLoading}
        failed={Boolean(activeTab === 'movies' ? movies.error : series.error)}
        density={density}
        onDensityChange={onDensityChange}
      />

      <div className="p-3 sm:p-6 space-y-6">
        {/* Movies section — always in DOM for tests, hidden when tab is series */}
        <section
          role="tabpanel"
          id="tabpanel-movies"
          aria-labelledby="tab-movies"
          tabIndex={activeTab === 'movies' ? 0 : undefined}
          className={cn(activeTab !== 'movies' && 'hidden')}
        >
          <h2 className="sr-only">Movies</h2>
          <SourceErrors errors={movies.sourceErrors} />
          <VirtualMediaGrid
            items={movies.items}
            isLoading={movies.isLoading}
            isFetchingMore={movies.isFetchingMore}
            density={density}
            renderItem={(movie: ManagedMovie) => (
              <MediaCard
                key={`movie-${movie.id}`}
                id={`movie-${movie.id}`}
                data-testid={`media-card-movie-${movie.id}`}
                className={
                  selectedId === `movie-${movie.id}` ? 'ring-2 ring-primary rounded-lg' : undefined
                }
                onClick={
                  RATINGS_PANEL_OFFERED
                    ? (id) => {
                        setSelected({ title: movie.title, year: movie.year });
                        setSelectedId(id);
                      }
                    : undefined
                }
              >
                <MediaCard.Poster src={getPosterUrl(movie.images)} alt={movie.title} />
                <MediaCard.Content>
                  <MediaCard.Title>{movie.title}</MediaCard.Title>
                  <MediaCard.Year>{movie.year}</MediaCard.Year>
                  <MediaCard.StatusBadge status={movie.hasFile ? 'downloaded' : 'missing'} />
                </MediaCard.Content>
              </MediaCard>
            )}
          />
          {movies.hasMore && !movies.isFetchingMore && (
            <div ref={movieSentinelRef} style={{ height: 1 }} />
          )}
          {movies.error && movies.items.length === 0 && (
            <LoadError what="movies" onRetry={() => movies.refresh?.()} />
          )}
          {!movies.isLoading &&
            !movies.error &&
            movies.items.length === 0 &&
            sources &&
            (!sources.movie.configured ? (
              <EmptyState
                icon={<ServerOff size={28} strokeWidth={1.25} aria-hidden="true" />}
                title={`No ${providerLabel(sources.movie.ownerType)} connection configured`}
                description={`Add a ${providerLabel(sources.movie.ownerType)} provider to manage your movie library.`}
                action={{ label: 'Go to Providers', href: '/settings' }}
              />
            ) : activeFilterCount > 0 ? (
              <EmptyState
                icon={<SearchX size={28} strokeWidth={1.25} aria-hidden="true" />}
                title="No movies match your current filters"
                action={{ label: 'Clear filters', onClick: clearAll }}
              />
            ) : (
              <EmptyState
                icon={<Film size={28} strokeWidth={1.25} aria-hidden="true" />}
                title="Your movie library is empty"
                description={`Movies synced from ${providerLabel(sources.movie.ownerType)} will appear here.`}
              />
            ))}
        </section>

        {/* Series section — always in DOM for tests, hidden when tab is movies */}
        <section
          role="tabpanel"
          id="tabpanel-series"
          aria-labelledby="tab-series"
          tabIndex={activeTab === 'series' ? 0 : undefined}
          className={cn(activeTab !== 'series' && 'hidden')}
        >
          <h2 className="sr-only">Series</h2>
          <SourceErrors errors={series.sourceErrors} />
          <VirtualMediaGrid
            items={series.items}
            isLoading={series.isLoading}
            isFetchingMore={series.isFetchingMore}
            density={density}
            renderItem={(item: ManagedSeries) => (
              <MediaCard
                key={`series-${item.id}`}
                id={`series-${item.id}`}
                data-testid={`media-card-series-${item.id}`}
                className={
                  selectedId === `series-${item.id}` ? 'ring-2 ring-primary rounded-lg' : undefined
                }
                onClick={
                  RATINGS_PANEL_OFFERED
                    ? (id) => {
                        setSelected({ title: item.title, year: item.year });
                        setSelectedId(id);
                      }
                    : undefined
                }
              >
                <MediaCard.Poster src={getPosterUrl(item.images)} alt={item.title} />
                <MediaCard.Content>
                  <MediaCard.Title>{item.title}</MediaCard.Title>
                  <MediaCard.Year>{item.year}</MediaCard.Year>
                  <MediaCard.StatusBadge status={item.monitored ? 'monitored' : undefined} />
                </MediaCard.Content>
              </MediaCard>
            )}
          />
          {series.hasMore && !series.isFetchingMore && (
            <div ref={seriesSentinelRef} style={{ height: 1 }} />
          )}
          {series.error && series.items.length === 0 && (
            <LoadError what="series" onRetry={() => series.refresh?.()} />
          )}
          {!series.isLoading &&
            !series.error &&
            series.items.length === 0 &&
            sources &&
            (!sources.series.configured ? (
              <EmptyState
                icon={<ServerOff size={28} strokeWidth={1.25} aria-hidden="true" />}
                title={`No ${providerLabel(sources.series.ownerType)} connection configured`}
                description={`Add a ${providerLabel(sources.series.ownerType)} provider to manage your series library.`}
                action={{ label: 'Go to Providers', href: '/settings' }}
              />
            ) : activeFilterCount > 0 ? (
              <EmptyState
                icon={<SearchX size={28} strokeWidth={1.25} aria-hidden="true" />}
                title="No series match your current filters"
                action={{ label: 'Clear filters', onClick: clearAll }}
              />
            ) : (
              <EmptyState
                icon={<Tv2 size={28} strokeWidth={1.25} aria-hidden="true" />}
                title="Your series library is empty"
                description={`Series synced from ${providerLabel(sources.series.ownerType)} will appear here.`}
              />
            ))}
        </section>
      </div>

      {RATINGS_PANEL_OFFERED && (
        <RatingsPanel
          isOpen={selected !== null}
          onClose={() => {
            setSelected(null);
            setSelectedId(null);
          }}
          title={selected?.title ?? ''}
          year={selected?.year}
        />
      )}
    </>
  );
}

// ─── Page guard ───────────────────────────────────────────────────────────────

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const refusal = await guardPage(ctx);
  if (refusal) return refusal;
  return { props: {} };
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MediaPage() {
  const {
    filterState: values,
    debouncedFilters,
    setValue: onRuleChange,
    setQualifier: onQualifierChange,
    setMovieSort,
    setSeriesSort,
    clearAll,
    isActive,
  } = useMediaFilters();
  const { rules = [], error: rulesError, refresh: refreshRules } = useMediaRules();

  const movies = useMovies({
    filters: toFilters(debouncedFilters, 'movie', rules),
    sort: values.movieSort,
  });
  const series = useSeries({
    filters: toFilters(debouncedFilters, 'series', rules),
    sort: values.seriesSort,
  });
  const lookups = useMediaLookups();
  const { sources, error: sourcesError, refresh: refreshSources } = useMediaSources();

  const { save: saveQuery } = useMediaQueries();
  const [density, setDensity] = useCardDensity();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const { query: routeQuery } = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    routeQuery.tab === 'series' ? 'series' : 'movies'
  );
  const [savedName, setSavedName] = useState<string | null>(null);

  const activeFilterCount = countActiveFilters(values, activeTab);

  const loadFailures = [
    { what: 'media sources', error: sourcesError, onRetry: refreshSources },
    { what: 'filters', error: rulesError, onRetry: refreshRules },
    { what: 'filter options', error: lookups.error, onRetry: lookups.refresh },
  ].filter((failure) => failure.error);

  return (
    <>
      <AppLayout
        sidebar={<SidebarNav />}
        topBar={
          <TopBar
            sticky
            title="Media"
            actions={
              <>
                <Tabs
                  tabs={[
                    {
                      value: 'movies',
                      label: 'Movies',
                      count: movies.totalCount,
                      loading: movies.isLoading || Boolean(movies.error),
                    },
                    {
                      value: 'series',
                      label: 'Series',
                      count: series.totalCount,
                      loading: series.isLoading || Boolean(series.error),
                    },
                  ]}
                  active={activeTab}
                  onChange={setActiveTab}
                />
                <button
                  type="button"
                  className={cn(
                    'md:hidden flex items-center gap-2 px-3 py-1.5 max-sm:min-h-[44px] rounded-sm text-sm font-medium border transition-colors',
                    isActive
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-transparent text-text-primary border-border hover:bg-surface-hover'
                  )}
                  onClick={() => setFiltersOpen(true)}
                >
                  <Filter size={16} strokeWidth={2} aria-hidden="true" />
                  Filters
                  {isActive && (
                    <span className="bg-on-primary/20 rounded-full w-5 h-5 flex items-center justify-center text-xs leading-none">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </>
            }
          />
        }
      >
        {savedName && (
          <p role="status" className="px-3 sm:px-6 pt-3 text-sm text-success">
            Saved query {savedName}.
          </p>
        )}
        {loadFailures.length > 0 && (
          <div className="px-3 sm:px-6 pt-3 space-y-2">
            {loadFailures.map(({ what, onRetry }) => (
              <LoadError key={what} what={what} onRetry={onRetry} />
            ))}
          </div>
        )}
        <MediaContent
          rules={rules}
          values={values}
          onRuleChange={onRuleChange}
          onQualifierChange={onQualifierChange}
          clearAll={clearAll}
          onSaveQuery={isActive ? () => setSaveDialogOpen(true) : undefined}
          isActive={isActive}
          activeFilterCount={activeFilterCount}
          movieSort={values.movieSort}
          seriesSort={values.seriesSort}
          setMovieSort={setMovieSort}
          setSeriesSort={setSeriesSort}
          activeTab={activeTab}
          filtersOpen={filtersOpen}
          onFiltersClose={() => setFiltersOpen(false)}
          movies={movies}
          series={series}
          lookups={lookups}
          sources={sources}
          density={density}
          onDensityChange={setDensity}
        />
      </AppLayout>
      <SaveQueryDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={async (name) => {
          const contentType = activeTab === 'movies' ? 'movie' : 'series';
          await saveQuery(name, contentType, toFilters(values, contentType, rules));
          setSavedName(name);
        }}
      />
    </>
  );
}
