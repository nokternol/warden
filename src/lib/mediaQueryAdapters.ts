/**
 * Two adapters from the registry-keyed, scoped `FilterState` (`useMediaFilters`)
 * to the two wire contracts that haven't caught up to it yet:
 *
 * - `toBrowseParams`: `GET /api/media/movies|series` (`server/modules/media/media.handler.ts`)
 *   still expects the pre-Stage-2 renamed param names (surface #2 in the
 *   fracture ledger's "Filter/rule vocabulary" entry) — deleting that
 *   translator server-side is separate, unscheduled work, so this mirrors it
 *   client-side until it's removed.
 * - `toSaveValues`: not a legacy shim — it's the permanent shape queries
 *   need. Scoping by contentType (merging `shared` with just the one relevant
 *   scope, rather than movie+show together) is what avoids the
 *   tagIds/qualityProfileIds/genres collision the two scopes intentionally
 *   share the same key for.
 */
import type {
  ContentScope,
  FilterState,
  FilterValue,
  QualifierScope,
  RangeValue,
} from '@app/hooks/useMediaFilters';
import type { FilterValueEntry } from '@app/hooks/useMediaQueries';
import type { MediaFilters } from '@app/types/media';
import type { MovieRangeRuleKey, ShowRangeRuleKey } from '@contract/browseRangeKeys';

type Bound = 'min' | 'max';

interface Binding {
  scope: ContentScope;
  key: string;
  bound?: Bound;
}

// Browse-path param name -> (scope, registry key, range bound if this name is
// one half of a since-collapsed Gte/Lte pair) — the exact names
// MOVIE_PARAM_TO_KEY / SERIES_PARAM_TO_KEY in media.handler.ts still expect.
const BROWSE_PARAM_BINDINGS = {
  title: { scope: 'shared', key: 'title' },
  yearMin: { scope: 'shared', key: 'year', bound: 'min' },
  yearMax: { scope: 'shared', key: 'year', bound: 'max' },
  tautulliWatched: { scope: 'shared', key: 'watched' },
  lastWatchedDaysAgoGte: { scope: 'shared', key: 'lastWatchedDaysAgo', bound: 'min' },
  lastWatchedDaysAgoLte: { scope: 'shared', key: 'lastWatchedDaysAgo', bound: 'max' },
  plexAddedDaysAgoGte: { scope: 'shared', key: 'plexAddedDaysAgo', bound: 'min' },
  plexAddedDaysAgoLte: { scope: 'shared', key: 'plexAddedDaysAgo', bound: 'max' },
  jellyfinAddedDaysAgoGte: { scope: 'shared', key: 'jellyfinAddedDaysAgo', bound: 'min' },
  jellyfinAddedDaysAgoLte: { scope: 'shared', key: 'jellyfinAddedDaysAgo', bound: 'max' },
  fileSizeBytesGte: { scope: 'shared', key: 'fileSizeBytes', bound: 'min' },
  fileSizeBytesLte: { scope: 'shared', key: 'fileSizeBytes', bound: 'max' },
  releaseDaysAgoGte: { scope: 'shared', key: 'releaseDaysAgo', bound: 'min' },
  releaseDaysAgoLte: { scope: 'shared', key: 'releaseDaysAgo', bound: 'max' },
  fileContainer: { scope: 'shared', key: 'fileContainer' },
  videoCodec: { scope: 'shared', key: 'videoCodec' },
  audioCodec: { scope: 'shared', key: 'audioCodec' },
  fileResolution: { scope: 'shared', key: 'fileResolution' },
  labels: { scope: 'shared', key: 'labels' },
  jellyfinIsFavorite: { scope: 'shared', key: 'jellyfinIsFavorite' },
  overseerrHasIssue: { scope: 'shared', key: 'overseerrHasIssue' },
  overseerrRequestStatus: { scope: 'shared', key: 'overseerrRequestStatus' },
  tmdbStatus: { scope: 'shared', key: 'tmdbStatus' },
  addedDaysAgoGte: { scope: 'shared', key: 'addedDaysAgo', bound: 'min' },
  addedDaysAgoLte: { scope: 'shared', key: 'addedDaysAgo', bound: 'max' },
  sizeOnDiskGbGte: { scope: 'shared', key: 'sizeOnDiskGb', bound: 'min' },
  sizeOnDiskGbLte: { scope: 'shared', key: 'sizeOnDiskGb', bound: 'max' },
  certification: { scope: 'shared', key: 'certification' },
  hasFile: { scope: 'movie', key: 'hasFile' },
  movieTagIds: { scope: 'movie', key: 'tagIds' },
  movieQualityProfileIds: { scope: 'movie', key: 'qualityProfileIds' },
  movieGenres: { scope: 'movie', key: 'genres' },
  radarrImdbRatingGte: { scope: 'movie', key: 'imdbRating', bound: 'min' },
  radarrImdbRatingLte: { scope: 'movie', key: 'imdbRating', bound: 'max' },
  runtimeMinutesGte: { scope: 'movie', key: 'runtimeMinutes', bound: 'min' },
  runtimeMinutesLte: { scope: 'movie', key: 'runtimeMinutes', bound: 'max' },
  movieFileCountGte: { scope: 'movie', key: 'movieFileCount', bound: 'min' },
  movieFileCountLte: { scope: 'movie', key: 'movieFileCount', bound: 'max' },
  releaseGroups: { scope: 'movie', key: 'releaseGroups' },
  inCinemasDaysAgoGte: { scope: 'movie', key: 'inCinemasDaysAgo', bound: 'min' },
  inCinemasDaysAgoLte: { scope: 'movie', key: 'inCinemasDaysAgo', bound: 'max' },
  physicalReleaseDaysAgoGte: { scope: 'movie', key: 'physicalReleaseDaysAgo', bound: 'min' },
  physicalReleaseDaysAgoLte: { scope: 'movie', key: 'physicalReleaseDaysAgo', bound: 'max' },
  digitalReleaseDaysAgoGte: { scope: 'movie', key: 'digitalReleaseDaysAgo', bound: 'min' },
  digitalReleaseDaysAgoLte: { scope: 'movie', key: 'digitalReleaseDaysAgo', bound: 'max' },
  collectionName: { scope: 'movie', key: 'collectionName' },
  isAvailable: { scope: 'movie', key: 'isAvailable' },
  radarrStatus: { scope: 'movie', key: 'radarrStatus' },
  monitored: { scope: 'show', key: 'monitored' },
  seriesStatus: { scope: 'show', key: 'seriesStatus' },
  seriesTagIds: { scope: 'show', key: 'tagIds' },
  seriesQualityProfileIds: { scope: 'show', key: 'qualityProfileIds' },
  seriesGenres: { scope: 'show', key: 'genres' },
  seriesType: { scope: 'show', key: 'seriesType' },
  network: { scope: 'show', key: 'network' },
  sonarrRatingGte: { scope: 'show', key: 'communityRating', bound: 'min' },
  sonarrRatingLte: { scope: 'show', key: 'communityRating', bound: 'max' },
  sonarrEnded: { scope: 'show', key: 'ended' },
  sonarrLastAiredDaysAgoGte: { scope: 'show', key: 'lastAiredDaysAgo', bound: 'min' },
  sonarrLastAiredDaysAgoLte: { scope: 'show', key: 'lastAiredDaysAgo', bound: 'max' },
  sonarrPercentEpisodesGte: { scope: 'show', key: 'episodePercentage', bound: 'min' },
  sonarrPercentEpisodesLte: { scope: 'show', key: 'episodePercentage', bound: 'max' },
  seasonCountGte: { scope: 'show', key: 'seasonCount', bound: 'min' },
  seasonCountLte: { scope: 'show', key: 'seasonCount', bound: 'max' },
  episodeCountGte: { scope: 'show', key: 'episodeCount', bound: 'min' },
  episodeCountLte: { scope: 'show', key: 'episodeCount', bound: 'max' },
  nextAiringInDaysGte: { scope: 'show', key: 'nextAiringInDays', bound: 'min' },
  nextAiringInDaysLte: { scope: 'show', key: 'nextAiringInDays', bound: 'max' },
  seriesLanguageProfileIds: { scope: 'show', key: 'languageProfileIds' },
} as const;

/**
 * Range-rule coverage witness: exhaustive over `MovieRangeRuleKey`/`ShowRangeRuleKey`
 * (imported from the server's zero-dependency browse-range contract), each entry
 * pointing at the `BROWSE_PARAM_BINDINGS` param names that cover it — typo'd or
 * dangling references fail to compile via `keyof typeof BROWSE_PARAM_BINDINGS`. A
 * range rule missing from here (new, or content-type rescoped) is a compile error,
 * not a silently-dropped filter (caught the hard way once already: `plexAddedDaysAgo`
 * shipped with no entry here, and nothing failed to compile). `movie`/`show` witnesses
 * both check into the one shared `BROWSE_PARAM_BINDINGS` map — a rule reachable only
 * via its `shared`-scope entry (e.g. `year`) still resolves fine for both.
 */
const _MOVIE_RANGE_PARAM_WITNESS: Record<
  MovieRangeRuleKey,
  { gte: keyof typeof BROWSE_PARAM_BINDINGS; lte: keyof typeof BROWSE_PARAM_BINDINGS }
> = {
  year: { gte: 'yearMin', lte: 'yearMax' },
  addedDaysAgo: { gte: 'addedDaysAgoGte', lte: 'addedDaysAgoLte' },
  plexAddedDaysAgo: { gte: 'plexAddedDaysAgoGte', lte: 'plexAddedDaysAgoLte' },
  jellyfinAddedDaysAgo: { gte: 'jellyfinAddedDaysAgoGte', lte: 'jellyfinAddedDaysAgoLte' },
  sizeOnDiskGb: { gte: 'sizeOnDiskGbGte', lte: 'sizeOnDiskGbLte' },
  imdbRating: { gte: 'radarrImdbRatingGte', lte: 'radarrImdbRatingLte' },
  runtimeMinutes: { gte: 'runtimeMinutesGte', lte: 'runtimeMinutesLte' },
  fileSizeBytes: { gte: 'fileSizeBytesGte', lte: 'fileSizeBytesLte' },
  releaseDaysAgo: { gte: 'releaseDaysAgoGte', lte: 'releaseDaysAgoLte' },
  lastWatchedDaysAgo: { gte: 'lastWatchedDaysAgoGte', lte: 'lastWatchedDaysAgoLte' },
  movieFileCount: { gte: 'movieFileCountGte', lte: 'movieFileCountLte' },
  inCinemasDaysAgo: { gte: 'inCinemasDaysAgoGte', lte: 'inCinemasDaysAgoLte' },
  physicalReleaseDaysAgo: { gte: 'physicalReleaseDaysAgoGte', lte: 'physicalReleaseDaysAgoLte' },
  digitalReleaseDaysAgo: { gte: 'digitalReleaseDaysAgoGte', lte: 'digitalReleaseDaysAgoLte' },
};

const _SHOW_RANGE_PARAM_WITNESS: Record<
  ShowRangeRuleKey,
  { gte: keyof typeof BROWSE_PARAM_BINDINGS; lte: keyof typeof BROWSE_PARAM_BINDINGS }
> = {
  year: { gte: 'yearMin', lte: 'yearMax' },
  addedDaysAgo: { gte: 'addedDaysAgoGte', lte: 'addedDaysAgoLte' },
  plexAddedDaysAgo: { gte: 'plexAddedDaysAgoGte', lte: 'plexAddedDaysAgoLte' },
  jellyfinAddedDaysAgo: { gte: 'jellyfinAddedDaysAgoGte', lte: 'jellyfinAddedDaysAgoLte' },
  sizeOnDiskGb: { gte: 'sizeOnDiskGbGte', lte: 'sizeOnDiskGbLte' },
  fileSizeBytes: { gte: 'fileSizeBytesGte', lte: 'fileSizeBytesLte' },
  releaseDaysAgo: { gte: 'releaseDaysAgoGte', lte: 'releaseDaysAgoLte' },
  communityRating: { gte: 'sonarrRatingGte', lte: 'sonarrRatingLte' },
  lastAiredDaysAgo: { gte: 'sonarrLastAiredDaysAgoGte', lte: 'sonarrLastAiredDaysAgoLte' },
  episodePercentage: { gte: 'sonarrPercentEpisodesGte', lte: 'sonarrPercentEpisodesLte' },
  lastWatchedDaysAgo: { gte: 'lastWatchedDaysAgoGte', lte: 'lastWatchedDaysAgoLte' },
  seasonCount: { gte: 'seasonCountGte', lte: 'seasonCountLte' },
  episodeCount: { gte: 'episodeCountGte', lte: 'episodeCountLte' },
  nextAiringInDays: { gte: 'nextAiringInDaysGte', lte: 'nextAiringInDaysLte' },
};

type ScopedBuckets = Record<
  'shared' | 'movie' | 'show',
  Record<string, FilterValue | undefined>
> & {
  movieQualifiers?: Record<string, number>;
  showQualifiers?: Record<string, number>;
};

function readBinding(buckets: ScopedBuckets, binding: Binding): FilterValue | undefined {
  const value = buckets[binding.scope][binding.key];
  if (binding.bound) return (value as RangeValue | undefined)?.[binding.bound];
  return value;
}

function scopesFor(contentType: 'movie' | 'show'): ContentScope[] {
  return ['shared', contentType];
}

function qualifierFor(
  buckets: ScopedBuckets,
  scope: QualifierScope,
  key: string
): number | undefined {
  const qualifiers = scope === 'movie' ? buckets.movieQualifiers : buckets.showQualifiers;
  return qualifiers?.[key];
}

export function toBrowseParams(
  buckets: ScopedBuckets,
  contentType: 'movie' | 'show'
): MediaFilters {
  const relevantScopes = new Set(scopesFor(contentType));
  const params: MediaFilters = {};
  for (const [name, binding] of Object.entries(BROWSE_PARAM_BINDINGS) as [string, Binding][]) {
    if (!relevantScopes.has(binding.scope)) continue;
    const value = readBinding(buckets, binding);
    if (value === undefined) continue;
    params[name] = value as string | number | boolean;
    if (binding.bound) continue;
    if (binding.scope !== 'movie' && binding.scope !== 'show') continue;
    const providerId = qualifierFor(buckets, binding.scope, binding.key);
    if (providerId !== undefined) params[`${name}ProviderId`] = providerId;
  }
  return params;
}

export function toSaveValues(
  filterState: FilterState,
  contentType: 'movie' | 'show'
): FilterValueEntry[] {
  const scoped = contentType === 'movie' ? filterState.movie : filterState.show;
  const qualifiers =
    contentType === 'movie' ? filterState.movieQualifiers : filterState.showQualifiers;
  const merged: Record<string, FilterValue> = { ...filterState.shared, ...scoped };
  return Object.entries(merged)
    .filter((entry): entry is [string, FilterValue] => entry[1] !== undefined)
    .map(([key, value]) => {
      const providerId = qualifiers[key];
      return providerId === undefined ? { key, value } : { key, value, providerId };
    });
}
