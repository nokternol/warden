import type { MediaLookup, MediaRuleDescriptor } from '@contract/media';
import { MediaRuleDescriptorSchema } from '@contract/media';
import type { ContentType, FilterValue, InstanceScopedValue, RangeValue } from '@contract/schemas';
import { isInstanceScopedValue } from '@contract/schemas';
import { MetadataProviderType } from '../../database/schema';
import { fieldsByProviderType } from './activeFieldSet';
import type { EnrichmentFields } from './mediaFieldProvider';
import type { NormalizedMovie } from './movie';
import type { NormalizedSeries } from './series';

export type { NormalizedMovie } from './movie';
export type { NormalizedSeries } from './series';

export type { FilterValue, InstanceScopedValue, RangeValue };

/**
 * A filter: a rule's key paired with the value to test it against. Nothing here knows
 * which provider supplies the data — the rule resolves that.
 */
export interface Filter {
  ruleKey: string;
  value: FilterValue;
}

/** The section headings rules are grouped under in the filter bar. */
export type RuleGroup =
  | 'Movies'
  | 'Series'
  | 'Library'
  | 'Media server'
  | 'Play History'
  | 'Requests'
  | 'TMDB';

export type Predicate<
  T extends NormalizedMovie | NormalizedSeries = NormalizedMovie | NormalizedSeries,
> = (item: T, value: FilterValue) => boolean;

export interface MediaRule<
  T extends NormalizedMovie | NormalizedSeries = NormalizedMovie | NormalizedSeries,
> {
  key: string;
  label: string;
  contentTypes: readonly ContentType[];
  dataType: 'boolean' | 'number' | 'string' | 'instance-ids' | 'csv-strings' | 'range';
  providers: readonly MetadataProviderType[];
  required: boolean;
  /** True for rules whose values are a provider-*defined* id space (a quality profile id is
   *  minted by one instance) — the client must qualify these per instance when more than one
   *  is active. Flows into `MediaRuleDescriptor` automatically; the client learns the class
   *  from the registry projection instead of keeping its own list. */
  instanceScoped?: boolean;
  /** The `EnrichmentFields` key this rule's predicate reads, if any — most rules read a
   *  source-owned field instead (`title`, `year`, `hasFile`, …) and omit this. Declared,
   *  not inferred from the predicate body (TS can't introspect that): every
   *  `EnrichmentFields` key must be the `sourceField` of at least one rule, checked below
   *  `MEDIA_RULES` — a field with no rule at all is enriched, stored, and merged onto the
   *  item, and silently never filterable. */
  sourceField?: keyof EnrichmentFields;
  /** What a boolean rule's two values read as in the UI (*Monitored* / *Unmonitored*).
   *  Absent means the generic *Yes* / *No*. */
  valueLabels?: { true: string; false: string };
  /** The fixed values an enum-shaped `string`/`number` rule accepts, each with its display
   *  label. A `number` rule's values are its numbers as strings. */
  options?: readonly { value: string; label: string }[];
  /** A shorter label for places the rule's section heading already gives context
   *  ("Status" under a "Series" heading). Absent means `label`. */
  shortLabel?: string;
  /** For a multi-value rule: the `media` lookup procedure its selectable values come from. */
  lookup?: MediaLookup;
  /** The section heading the rule is shown under. Absent for the universal controls
   *  (title, year) that sit outside every section. */
  group?: RuleGroup;
  predicate: Predicate<T>;
}

export type { MediaRuleDescriptor };

/**
 * A rule as the client sees it: only the presentation fields the contract's
 * `MediaRuleDescriptorSchema` lists. Engine concerns (the predicate, the providers
 * that produce the rule, its `sourceField`, `required`) are left behind, because
 * the schema is an allowlist and drops every field it doesn't name.
 */
export function toDescriptor(rule: MediaRule): MediaRuleDescriptor {
  return MediaRuleDescriptorSchema.parse(rule);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function instanceIds(value: FilterValue): number[] {
  return isInstanceScopedValue(value) ? value.ids : [];
}

function parseCsvStrings(value: FilterValue): string[] {
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function daysElapsed(isoDate: string): number {
  return Math.floor((Date.now() - Date.parse(isoDate)) / 86_400_000);
}

/** Mirror of `daysElapsed` for a forward-looking date — days *until* `isoDate`,
 *  not days since. Kept separate rather than negating `daysElapsed`'s result:
 *  a "days ago" rule and a "days until" rule read their min/max bounds in
 *  opposite directions, and this keeps that direction explicit at the call site. */
function daysUntil(isoDate: string): number {
  return Math.floor((Date.parse(isoDate) - Date.now()) / 86_400_000);
}

function asBool(value: FilterValue): boolean {
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

/** Tests `actual` against a `{ min?, max? }` range value — either bound may be omitted. */
function inRange(actual: number, value: FilterValue): boolean {
  const { min, max } = value as RangeValue;
  if (min !== undefined && actual < min) return false;
  if (max !== undefined && actual > max) return false;
  return true;
}

/**
 * A rule's `providers` for a field `MediaFieldProvider`/`MediaFieldSource`
 * tracks — every provider type whose `fieldsByProviderType` entry includes it,
 * the inverse lookup of that declaration. Rules backed by a source-owned field
 * outside `EnrichmentFields` (most of `NormalizedMovie`/`NormalizedSeries`) still
 * hand-list `providers` until `movie.ts`/`series.ts` derive from
 * `EnrichmentFields` too (see spec's Risks section).
 *
 * Not content-type-scoped: a field produced by two providers who never both
 * apply to the same rule (`tags`: Radarr for movies, Sonarr for series) derives
 * to *both*, which is wrong for a content-type-scoped rule. Safe to call only
 * when the field's producer set doesn't vary by content type — see the
 * movie/series `tagIds` rules, which stay hand-listed for exactly this reason.
 */
export function deriveProviders(field: keyof EnrichmentFields): MetadataProviderType[] {
  return (Object.entries(fieldsByProviderType) as [MetadataProviderType, readonly string[]][])
    .filter(([, fields]) => fields.includes(field))
    .map(([type]) => type);
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const MEDIA_RULES = [
  // ── Shared: both content types ─────────────────────────────────────────────
  {
    key: 'title',
    label: 'Title',
    contentTypes: ['movie', 'series'],
    dataType: 'string',
    providers: [
      MetadataProviderType.RADARR,
      MetadataProviderType.SONARR,
      MetadataProviderType.PLEX,
    ],
    required: false,
    predicate: (item, value) => item.title.toLowerCase().includes(String(value).toLowerCase()),
  },
  {
    key: 'year',
    label: 'Year',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: [
      MetadataProviderType.RADARR,
      MetadataProviderType.SONARR,
      MetadataProviderType.PLEX,
      MetadataProviderType.TMDB,
    ],
    required: false,
    predicate: (item, value) => item.year !== undefined && inRange(item.year, value),
  },
  {
    key: 'watched',
    label: 'Watched',
    group: 'Play History',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Watched', false: 'Unwatched' },
    providers: deriveProviders('playCount'),
    sourceField: 'playCount',
    required: false,
    predicate: (item, value) => {
      const watched = (item.playCount ?? 0) > 0;
      return watched === asBool(value);
    },
  },
  {
    key: 'addedDaysAgo',
    label: 'Added (days ago)',
    group: 'Library',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: [MetadataProviderType.RADARR, MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      if (!item.addedDate) return false;
      return inRange(daysElapsed(item.addedDate), value);
    },
  },
  {
    key: 'plexAddedDaysAgo',
    label: 'Plex added (days ago)',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: deriveProviders('plexAddedAt'),
    sourceField: 'plexAddedAt',
    required: false,
    predicate: (item, value) => {
      if (!item.plexAddedAt) return false;
      return inRange(daysElapsed(item.plexAddedAt), value);
    },
  },
  {
    key: 'jellyfinAddedDaysAgo',
    label: 'Jellyfin added (days ago)',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: deriveProviders('jellyfinAddedAt'),
    sourceField: 'jellyfinAddedAt',
    required: false,
    predicate: (item, value) => {
      if (!item.jellyfinAddedAt) return false;
      return inRange(daysElapsed(item.jellyfinAddedAt), value);
    },
  },
  {
    key: 'sizeOnDiskGb',
    label: 'Size on disk (GB)',
    group: 'Library',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: [MetadataProviderType.RADARR, MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      if (item.sizeOnDiskBytes === undefined) return false;
      return inRange(item.sizeOnDiskBytes / 1_073_741_824, value);
    },
  },
  {
    key: 'certification',
    label: 'Certification',
    group: 'Library',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    providers: [
      MetadataProviderType.RADARR,
      MetadataProviderType.SONARR,
      MetadataProviderType.TMDB,
      MetadataProviderType.OMDB,
    ],
    required: false,
    predicate: (item, value) => {
      if (!item.certification) return false;
      const certs = parseCsvStrings(value).map((c) => c.toLowerCase());
      return certs.includes(item.certification.toLowerCase());
    },
  },
  {
    key: 'hasFile',
    label: 'Has file',
    group: 'Library',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Downloaded', false: 'Missing' },
    providers: [
      MetadataProviderType.RADARR,
      MetadataProviderType.SONARR,
      MetadataProviderType.PLEX,
    ],
    required: false,
    predicate: (item, value) => item.hasFile === asBool(value),
  },
  {
    key: 'fileSizeBytes',
    label: 'File size (bytes)',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: deriveProviders('fileSizeBytes'),
    sourceField: 'fileSizeBytes',
    required: false,
    predicate: (item, value) => {
      if (item.fileSizeBytes === undefined) return false;
      return inRange(item.fileSizeBytes, value);
    },
  },
  {
    key: 'releaseDaysAgo',
    label: 'Release date (days ago)',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: deriveProviders('releaseDate'),
    sourceField: 'releaseDate',
    required: false,
    predicate: (item, value) => {
      if (!item.releaseDate) return false;
      return inRange(daysElapsed(item.releaseDate), value);
    },
  },
  {
    key: 'fileContainer',
    label: 'File container',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    lookup: 'fileContainers',
    providers: deriveProviders('fileContainer'),
    sourceField: 'fileContainer',
    required: false,
    predicate: (item, value) => {
      if (!item.fileContainer) return false;
      return parseCsvStrings(value).includes(item.fileContainer);
    },
  },
  {
    key: 'videoCodec',
    label: 'Video codec',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    lookup: 'videoCodecs',
    providers: deriveProviders('videoCodec'),
    sourceField: 'videoCodec',
    required: false,
    predicate: (item, value) => {
      if (!item.videoCodec) return false;
      return parseCsvStrings(value).includes(item.videoCodec);
    },
  },
  {
    key: 'audioCodec',
    label: 'Audio codec',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    lookup: 'audioCodecs',
    providers: deriveProviders('audioCodec'),
    sourceField: 'audioCodec',
    required: false,
    predicate: (item, value) => {
      if (!item.audioCodec) return false;
      return parseCsvStrings(value).includes(item.audioCodec);
    },
  },
  {
    key: 'fileResolution',
    label: 'File resolution',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    lookup: 'fileResolutions',
    providers: deriveProviders('fileResolution'),
    sourceField: 'fileResolution',
    required: false,
    predicate: (item, value) => {
      if (!item.fileResolution) return false;
      return parseCsvStrings(value).includes(item.fileResolution);
    },
  },
  {
    key: 'labels',
    label: 'Labels',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    lookup: 'labels',
    providers: deriveProviders('labels'),
    sourceField: 'labels',
    required: false,
    predicate: (item, value) => {
      const labels = parseCsvStrings(value);
      return (item.labels ?? []).some((l) => labels.includes(l));
    },
  },
  {
    key: 'monitored',
    label: 'Monitored',
    group: 'Library',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Monitored', false: 'Unmonitored' },
    providers: [MetadataProviderType.RADARR, MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => item.monitored === asBool(value),
  },
  {
    key: 'jellyfinIsFavorite',
    label: 'Jellyfin favorite',
    group: 'Media server',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Favorited', false: 'Not Favorited' },
    providers: deriveProviders('isFavorite'),
    sourceField: 'isFavorite',
    required: false,
    predicate: (item, value) => Boolean(item.isFavorite) === asBool(value),
  },

  // ── Movie-only ─────────────────────────────────────────────────────────────
  {
    key: 'tagIds',
    label: 'Tags',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'instance-ids',
    lookup: 'tags',
    // Hand-listed, not deriveProviders('tags'): tags is now produced by
    // both Radarr and Sonarr, one per content type — deriving here would
    // wrongly list Sonarr on a movie-only rule. deriveProviders has no
    // content-type scoping; only safe for a field with one producer regardless
    // of content type (see the series-side tagIds rule for the same reasoning).
    providers: [MetadataProviderType.RADARR],
    sourceField: 'tags',
    required: false,
    instanceScoped: true,
    predicate: (item, value) => {
      const ids = instanceIds(value);
      return ids.some((id) => (item.tags ?? []).includes(id));
    },
  },
  {
    key: 'qualityProfileIds',
    label: 'Quality profile',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'instance-ids',
    lookup: 'qualityProfiles',
    providers: [MetadataProviderType.RADARR],
    required: false,
    instanceScoped: true,
    predicate: (item, value) => {
      const ids = instanceIds(value);
      return item.qualityProfileId !== undefined && ids.includes(item.qualityProfileId);
    },
  },
  {
    key: 'genres',
    label: 'Genres',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    lookup: 'genres',
    providers: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const genres = parseCsvStrings(value);
      return (item.genres ?? []).some((g) => genres.includes(g));
    },
  },
  {
    key: 'studio',
    label: 'Studio',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    lookup: 'studio',
    providers: deriveProviders('studio'),
    sourceField: 'studio',
    required: false,
    predicate: (item, value) => {
      if (!item.studio) return false;
      return parseCsvStrings(value).includes(item.studio);
    },
  },
  {
    key: 'runtimeMinutes',
    label: 'Runtime (minutes)',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: deriveProviders('runtimeMinutes'),
    sourceField: 'runtimeMinutes',
    required: false,
    predicate: (item, value) => {
      const movie = item as NormalizedMovie;
      if (movie.runtimeMinutes === undefined) return false;
      return inRange(movie.runtimeMinutes, value);
    },
  },
  {
    key: 'imdbRating',
    label: 'IMDB rating',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const movie = item as NormalizedMovie;
      if (movie.imdbRating === undefined) return false;
      return inRange(movie.imdbRating, value);
    },
  },
  {
    key: 'movieFileCount',
    label: 'Movie file count',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const movie = item as NormalizedMovie;
      if (movie.movieFileCount === undefined) return false;
      return inRange(movie.movieFileCount, value);
    },
  },
  {
    key: 'releaseGroups',
    label: 'Release group',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    lookup: 'releaseGroups',
    providers: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const movie = item as NormalizedMovie;
      const groups = parseCsvStrings(value);
      return (movie.releaseGroups ?? []).some((g) => groups.includes(g));
    },
  },
  {
    key: 'inCinemasDaysAgo',
    label: 'In cinemas (days ago)',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const movie = item as NormalizedMovie;
      if (!movie.inCinemasDate) return false;
      return inRange(daysElapsed(movie.inCinemasDate), value);
    },
  },
  {
    key: 'physicalReleaseDaysAgo',
    label: 'Physical release (days ago)',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const movie = item as NormalizedMovie;
      if (!movie.physicalReleaseDate) return false;
      return inRange(daysElapsed(movie.physicalReleaseDate), value);
    },
  },
  {
    key: 'digitalReleaseDaysAgo',
    label: 'Digital release (days ago)',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'range',
    providers: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const movie = item as NormalizedMovie;
      if (!movie.digitalReleaseDate) return false;
      return inRange(daysElapsed(movie.digitalReleaseDate), value);
    },
  },
  {
    key: 'collectionName',
    label: 'Collection',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    lookup: 'collectionNames',
    providers: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const movie = item as NormalizedMovie;
      if (!movie.collectionName) return false;
      return parseCsvStrings(value).includes(movie.collectionName);
    },
  },
  {
    key: 'isAvailable',
    label: 'Available',
    group: 'Movies',
    contentTypes: ['movie'],
    dataType: 'boolean',
    valueLabels: { true: 'Available', false: 'Unavailable' },
    providers: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const movie = item as NormalizedMovie;
      return movie.isAvailable === asBool(value);
    },
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
    providers: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const movie = item as NormalizedMovie;
      if (!movie.radarrStatus) return false;
      return movie.radarrStatus === String(value);
    },
  },

  // ── Series-only ──────────────────────────────────────────────────────────────
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
    providers: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      return series.seriesStatus === String(value);
    },
  },
  {
    key: 'tagIds',
    label: 'Tags',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'instance-ids',
    lookup: 'tags',
    // Hand-listed for the same reason as the movie-side tagIds rule above —
    // deriveProviders('tags') would wrongly include Radarr here.
    providers: [MetadataProviderType.SONARR],
    sourceField: 'tags',
    required: false,
    instanceScoped: true,
    predicate: (item, value) => {
      const ids = instanceIds(value);
      return ids.some((id) => (item.tags ?? []).includes(id));
    },
  },
  {
    key: 'qualityProfileIds',
    label: 'Quality profile',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'instance-ids',
    lookup: 'qualityProfiles',
    providers: [MetadataProviderType.SONARR],
    required: false,
    instanceScoped: true,
    predicate: (item, value) => {
      const ids = instanceIds(value);
      return item.qualityProfileId !== undefined && ids.includes(item.qualityProfileId);
    },
  },
  {
    key: 'genres',
    label: 'Genres',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    lookup: 'genres',
    providers: [MetadataProviderType.SONARR, MetadataProviderType.TMDB],
    required: false,
    predicate: (item, value) => {
      const genres = parseCsvStrings(value);
      return (item.genres ?? []).some((g) => genres.includes(g));
    },
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
    providers: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      return series.seriesType === String(value);
    },
  },
  {
    key: 'studio',
    label: 'Studio',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    lookup: 'studio',
    providers: deriveProviders('studio'),
    sourceField: 'studio',
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      if (!series.studio) return false;
      return parseCsvStrings(value).includes(series.studio);
    },
  },
  {
    key: 'network',
    label: 'Network',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    lookup: 'networks',
    providers: [MetadataProviderType.SONARR, MetadataProviderType.TVMAZE],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      if (!series.network) return false;
      return parseCsvStrings(value).includes(series.network);
    },
  },
  {
    key: 'communityRating',
    label: 'Community rating',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
    providers: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      if (series.communityRating === undefined) return false;
      return inRange(series.communityRating, value);
    },
  },
  {
    key: 'ended',
    label: 'Ended',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'boolean',
    valueLabels: { true: 'Finished', false: 'Running' },
    providers: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      return series.ended === asBool(value);
    },
  },
  {
    key: 'lastAiredDaysAgo',
    label: 'Last aired (days ago)',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
    providers: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      if (!series.lastAiredAt) return false;
      return inRange(daysElapsed(series.lastAiredAt), value);
    },
  },
  {
    key: 'episodePercentage',
    label: 'Episode completion (%)',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
    providers: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      if (series.episodePercentage === undefined) return false;
      return inRange(series.episodePercentage, value);
    },
  },
  {
    key: 'seasonCount',
    label: 'Season count',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
    providers: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      if (series.seasonCount === undefined) return false;
      return inRange(series.seasonCount, value);
    },
  },
  {
    key: 'episodeCount',
    label: 'Episode count',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
    providers: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      const count = series.totalEpisodeCount ?? series.episodeCount;
      if (count === undefined) return false;
      return inRange(count, value);
    },
  },
  {
    key: 'nextAiringInDays',
    label: 'Next airing (days)',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'range',
    providers: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      if (!series.nextAiring) return false;
      return inRange(daysUntil(series.nextAiring), value);
    },
  },
  {
    key: 'languageProfileIds',
    label: 'Language profile',
    group: 'Series',
    contentTypes: ['series'],
    dataType: 'instance-ids',
    lookup: 'languageProfiles',
    providers: [MetadataProviderType.SONARR],
    required: false,
    instanceScoped: true,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      const ids = instanceIds(value);
      return series.languageProfileId !== undefined && ids.includes(series.languageProfileId);
    },
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
    providers: deriveProviders('tmdbStatus'),
    sourceField: 'tmdbStatus',
    required: false,
    predicate: (item, value) => {
      if (!item.tmdbStatus) return false;
      return item.tmdbStatus === String(value);
    },
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
    providers: deriveProviders('overseerrRequestStatus'),
    sourceField: 'overseerrRequestStatus',
    required: false,
    predicate: (item, value) => {
      if (item.overseerrRequestStatus === undefined) return false;
      return item.overseerrRequestStatus === Number(value);
    },
  },
  {
    key: 'overseerrHasIssue',
    label: 'Overseerr has issue',
    group: 'Requests',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    valueLabels: { true: 'Has Issue', false: 'No Issue' },
    providers: deriveProviders('overseerrHasIssue'),
    sourceField: 'overseerrHasIssue',
    required: false,
    // Truthy/falsy: "has issue" treats unknown (null/undefined) and false alike as "no issue".
    predicate: (item, value) => Boolean(item.overseerrHasIssue) === asBool(value),
  },
  {
    key: 'lastWatchedDaysAgo',
    label: 'Last watched (days ago)',
    group: 'Play History',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    providers: deriveProviders('lastWatchedAt'),
    sourceField: 'lastWatchedAt',
    required: false,
    predicate: (item, value) => {
      if (!item.lastWatchedAt) return false;
      return inRange(daysElapsed(item.lastWatchedAt), value);
    },
  },
] as const satisfies readonly MediaRule[];

// ─── Lookup ───────────────────────────────────────────────────────────────────

export function getRule(key: string, contentType: ContentType): MediaRule | undefined {
  // Widened for iteration — see the comment on the derived range-param types below for why.
  return (MEDIA_RULES as readonly MediaRule[]).find(
    (d) => d.key === key && d.contentTypes.includes(contentType)
  );
}

// ─── Range-rule keys, by content type — checked against the API contract ──────
// The browse-path param translators (server `*_PARAM_TO_KEY`, client
// `BROWSE_PARAM_BINDINGS`) are checked against `MovieRangeRuleKey`/`SeriesRangeRuleKey`
// — declared in the API contract (`contract/browseRangeKeys.ts`), not derived here,
// because the contract depends on nothing in `server/`. `_ActualXRangeKey` below is
// the real derivation, used only to assert the contract's list hasn't drifted from
// `MEDIA_RULES`. A range rule added to, removed from, or re-scoped in `MEDIA_RULES`
// without a matching update to `contract/browseRangeKeys.ts` fails to compile right
// here, naming the mismatched key (caught the hard way once already:
// `plexAddedDaysAgo` shipped in the registry with no entry in any of the five
// browse-path translators, and nothing failed to compile).
export type { MovieRangeRuleKey, SeriesRangeRuleKey } from '@contract/browseRangeKeys';
import type { MovieRangeRuleKey, SeriesRangeRuleKey } from '@contract/browseRangeKeys';

type RangeRule = Extract<(typeof MEDIA_RULES)[number], { dataType: 'range' }>;

/** Every range rule whose `contentTypes` includes the given content type. */
type _ActualRangeRuleFor<CT extends ContentType> = RangeRule extends infer R
  ? R extends { contentTypes: readonly (infer U)[] }
    ? CT extends U
      ? R
      : never
    : never
  : never;

type _ActualMovieRangeKey = _ActualRangeRuleFor<'movie'>['key'];
type _ActualSeriesRangeKey = _ActualRangeRuleFor<'series'>['key'];

/** Symmetric difference — non-`never` in either direction means the two lists disagree. */
type _SymmetricDiff<A extends string, B extends string> = Exclude<A, B> | Exclude<B, A>;

const _movieRangeKeysMatchContract: Record<
  _SymmetricDiff<_ActualMovieRangeKey, MovieRangeRuleKey>,
  never
> = {};
const _seriesRangeKeysMatchContract: Record<
  _SymmetricDiff<_ActualSeriesRangeKey, SeriesRangeRuleKey>,
  never
> = {};

// ─── Every EnrichmentFields key must be reachable through at least one rule ────
// `sourceField` is declared per rule, not inferred (a predicate body isn't
// TS-introspectable) — this checks that declaration against `EnrichmentFields`
// itself, so a field with no rule at all (enriched, stored, and merged onto the
// item, but never filterable) fails to compile, naming it.
type _DeclaredSourceField = Extract<
  (typeof MEDIA_RULES)[number],
  { sourceField: string }
>['sourceField'];
type _FieldWithNoRule = Exclude<keyof EnrichmentFields, _DeclaredSourceField>;
const _everyFieldHasARule: Record<_FieldWithNoRule, never> = {};
