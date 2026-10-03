import type { ContentType } from '@contract/schemas';
import { MetadataProviderType } from '../../database/schema';
import { fieldsByProviderType } from './activeFieldSet';
import type { EnrichmentFields } from './mediaFieldProvider';
import type { NormalizedMovie } from './movie';
import type { NormalizedSeries } from './series';

export type { NormalizedMovie } from './movie';
export type { NormalizedSeries } from './series';

export type RangeValue = { min?: number; max?: number };
export type FilterValue = string | number | boolean | RangeValue;

/**
 * One predicate application: a registry key paired with the value to test it against.
 * `providerId` qualifies which instance's namespace the value belongs to — set only on
 * `instanceScoped` rules; namespace qualification, not targeting (see `automations.providerId`
 * for that). Undefined means unqualified: the native id is interpreted in each item's own
 * instance namespace, today's behavior.
 */
export interface FilterValueEntry {
  key: string;
  value: FilterValue;
  providerId?: number;
}

export type Predicate<
  T extends NormalizedMovie | NormalizedSeries = NormalizedMovie | NormalizedSeries,
> = (item: T, value: FilterValue) => boolean;

export interface MediaRule<
  T extends NormalizedMovie | NormalizedSeries = NormalizedMovie | NormalizedSeries,
> {
  key: string;
  label: string;
  contentTypes: readonly ContentType[];
  dataType: 'boolean' | 'number' | 'string' | 'csv-ids' | 'csv-strings' | 'range';
  sourceProviders: readonly MetadataProviderType[];
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
  predicate: Predicate<T>;
}

/** `MediaRule`'s JSON-honest transport projection — no `predicate`. */
export type MediaRuleDescriptor = Omit<MediaRule, 'predicate'>;

export function toDescriptor(rule: MediaRule): MediaRuleDescriptor {
  const { predicate: _predicate, ...descriptor } = rule;
  return descriptor;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCsvIds(value: FilterValue): number[] {
  const csv = String(value);
  return csv
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0);
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
 * A rule's `sourceProviders` for a field `MediaFieldProvider`/`MediaFieldSource`
 * tracks — every provider type whose `fieldsByProviderType` entry includes it,
 * the inverse lookup of that declaration. Rules backed by a source-owned field
 * outside `EnrichmentFields` (most of `NormalizedMovie`/`NormalizedSeries`) still
 * hand-list `sourceProviders` until `movie.ts`/`series.ts` derive from
 * `EnrichmentFields` too (see spec's Risks section).
 *
 * Not content-type-scoped: a field produced by two providers who never both
 * apply to the same rule (`tags`: Radarr for movies, Sonarr for series) derives
 * to *both*, which is wrong for a content-type-scoped rule. Safe to call only
 * when the field's producer set doesn't vary by content type — see the
 * movie/series `tagIds` rules, which stay hand-listed for exactly this reason.
 */
export function deriveSourceProviders(field: keyof EnrichmentFields): MetadataProviderType[] {
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
    sourceProviders: [
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
    sourceProviders: [
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
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    sourceProviders: deriveSourceProviders('playCount'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.RADARR, MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      if (!item.addedDate) return false;
      return inRange(daysElapsed(item.addedDate), value);
    },
  },
  {
    key: 'plexAddedDaysAgo',
    label: 'Plex added (days ago)',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: deriveSourceProviders('plexAddedAt'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: deriveSourceProviders('jellyfinAddedAt'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.RADARR, MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      if (item.sizeOnDiskBytes === undefined) return false;
      return inRange(item.sizeOnDiskBytes / 1_073_741_824, value);
    },
  },
  {
    key: 'certification',
    label: 'Certification',
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    sourceProviders: [
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
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    sourceProviders: [
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
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: deriveSourceProviders('fileSizeBytes'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: deriveSourceProviders('releaseDate'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    sourceProviders: deriveSourceProviders('fileContainer'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    sourceProviders: deriveSourceProviders('videoCodec'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    sourceProviders: deriveSourceProviders('audioCodec'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    sourceProviders: deriveSourceProviders('fileResolution'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'csv-strings',
    sourceProviders: deriveSourceProviders('labels'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    sourceProviders: [MetadataProviderType.RADARR, MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => item.monitored === asBool(value),
  },
  {
    key: 'jellyfinIsFavorite',
    label: 'Jellyfin favorite',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    sourceProviders: deriveSourceProviders('isFavorite'),
    sourceField: 'isFavorite',
    required: false,
    predicate: (item, value) => Boolean(item.isFavorite) === asBool(value),
  },

  // ── Movie-only ─────────────────────────────────────────────────────────────
  {
    key: 'tagIds',
    label: 'Tags',
    contentTypes: ['movie'],
    dataType: 'csv-ids',
    // Hand-listed, not deriveSourceProviders('tags'): tags is now produced by
    // both Radarr and Sonarr, one per content type — deriving here would
    // wrongly list Sonarr on a movie-only rule. deriveSourceProviders has no
    // content-type scoping; only safe for a field with one producer regardless
    // of content type (see the series-side tagIds rule for the same reasoning).
    sourceProviders: [MetadataProviderType.RADARR],
    sourceField: 'tags',
    required: false,
    instanceScoped: true,
    predicate: (item, value) => {
      const ids = parseCsvIds(value);
      return ids.some((id) => (item.tags ?? []).includes(id));
    },
  },
  {
    key: 'qualityProfileIds',
    label: 'Quality profile',
    contentTypes: ['movie'],
    dataType: 'csv-ids',
    sourceProviders: [MetadataProviderType.RADARR],
    required: false,
    instanceScoped: true,
    predicate: (item, value) => {
      const ids = parseCsvIds(value);
      return item.qualityProfileId !== undefined && ids.includes(item.qualityProfileId);
    },
  },
  {
    key: 'genres',
    label: 'Genres',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    sourceProviders: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const genres = parseCsvStrings(value);
      return (item.genres ?? []).some((g) => genres.includes(g));
    },
  },
  {
    key: 'studio',
    label: 'Studio',
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    sourceProviders: deriveSourceProviders('studio'),
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
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: deriveSourceProviders('runtimeMinutes'),
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
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.RADARR],
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
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.RADARR],
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
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    sourceProviders: [MetadataProviderType.RADARR],
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
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.RADARR],
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
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.RADARR],
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
    contentTypes: ['movie'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.RADARR],
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
    contentTypes: ['movie'],
    dataType: 'csv-strings',
    sourceProviders: [MetadataProviderType.RADARR],
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
    contentTypes: ['movie'],
    dataType: 'boolean',
    sourceProviders: [MetadataProviderType.RADARR],
    required: false,
    predicate: (item, value) => {
      const movie = item as NormalizedMovie;
      return movie.isAvailable === asBool(value);
    },
  },
  {
    key: 'radarrStatus',
    label: 'Radarr status',
    contentTypes: ['movie'],
    dataType: 'string',
    sourceProviders: [MetadataProviderType.RADARR],
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
    contentTypes: ['series'],
    dataType: 'string',
    sourceProviders: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      return series.seriesStatus === String(value);
    },
  },
  {
    key: 'tagIds',
    label: 'Tags',
    contentTypes: ['series'],
    dataType: 'csv-ids',
    // Hand-listed for the same reason as the movie-side tagIds rule above —
    // deriveSourceProviders('tags') would wrongly include Radarr here.
    sourceProviders: [MetadataProviderType.SONARR],
    sourceField: 'tags',
    required: false,
    instanceScoped: true,
    predicate: (item, value) => {
      const ids = parseCsvIds(value);
      return ids.some((id) => (item.tags ?? []).includes(id));
    },
  },
  {
    key: 'qualityProfileIds',
    label: 'Quality profile',
    contentTypes: ['series'],
    dataType: 'csv-ids',
    sourceProviders: [MetadataProviderType.SONARR],
    required: false,
    instanceScoped: true,
    predicate: (item, value) => {
      const ids = parseCsvIds(value);
      return item.qualityProfileId !== undefined && ids.includes(item.qualityProfileId);
    },
  },
  {
    key: 'genres',
    label: 'Genres',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    sourceProviders: [MetadataProviderType.SONARR, MetadataProviderType.TMDB],
    required: false,
    predicate: (item, value) => {
      const genres = parseCsvStrings(value);
      return (item.genres ?? []).some((g) => genres.includes(g));
    },
  },
  {
    key: 'seriesType',
    label: 'Series type',
    contentTypes: ['series'],
    dataType: 'string',
    sourceProviders: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      return series.seriesType === String(value);
    },
  },
  {
    key: 'studio',
    label: 'Studio',
    contentTypes: ['series'],
    dataType: 'csv-strings',
    sourceProviders: deriveSourceProviders('studio'),
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
    contentTypes: ['series'],
    dataType: 'csv-strings',
    sourceProviders: [MetadataProviderType.SONARR, MetadataProviderType.TVMAZE],
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
    contentTypes: ['series'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.SONARR],
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
    contentTypes: ['series'],
    dataType: 'boolean',
    sourceProviders: [MetadataProviderType.SONARR],
    required: false,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      return series.ended === asBool(value);
    },
  },
  {
    key: 'lastAiredDaysAgo',
    label: 'Last aired (days ago)',
    contentTypes: ['series'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.SONARR],
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
    contentTypes: ['series'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.SONARR],
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
    contentTypes: ['series'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.SONARR],
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
    contentTypes: ['series'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.SONARR],
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
    contentTypes: ['series'],
    dataType: 'range',
    sourceProviders: [MetadataProviderType.SONARR],
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
    contentTypes: ['series'],
    dataType: 'csv-ids',
    sourceProviders: [MetadataProviderType.SONARR],
    required: false,
    instanceScoped: true,
    predicate: (item, value) => {
      const series = item as NormalizedSeries;
      const ids = parseCsvIds(value);
      return series.languageProfileId !== undefined && ids.includes(series.languageProfileId);
    },
  },
  {
    key: 'tmdbStatus',
    label: 'TMDB status',
    contentTypes: ['movie', 'series'],
    dataType: 'string',
    sourceProviders: deriveSourceProviders('tmdbStatus'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'number',
    sourceProviders: deriveSourceProviders('overseerrRequestStatus'),
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
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
    sourceProviders: deriveSourceProviders('overseerrHasIssue'),
    sourceField: 'overseerrHasIssue',
    required: false,
    // Truthy/falsy: "has issue" treats unknown (null/undefined) and false alike as "no issue".
    predicate: (item, value) => Boolean(item.overseerrHasIssue) === asBool(value),
  },
  {
    key: 'lastWatchedDaysAgo',
    label: 'Last watched (days ago)',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
    sourceProviders: deriveSourceProviders('lastWatchedAt'),
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
