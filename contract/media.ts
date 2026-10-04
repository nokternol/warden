import { z } from 'zod';
import { base } from './base';
import { ContentTypeSchema, ProviderTypeSchema } from './schemas';

// ─── Browse query (the content-prefixed param encoding the browse path reads) ──

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().optional().default(48),
});

// Query-param coercion helpers (browse params arrive as strings).
const num = () => z.coerce.number().optional();
const intNum = () => z.coerce.number().int().optional();
const bool3 = () =>
  z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional();
const sortField = z
  .enum(['title_asc', 'title_desc', 'year_asc', 'year_desc', 'status_asc', 'status_desc'])
  .optional()
  .default('title_asc');

// Fields valid for both content types — including the enriched predicates.
const sharedFilterFields = {
  title: z.string().optional(),
  yearMin: intNum(),
  yearMax: intNum(),
  certification: z.string().optional(),
  addedDaysAgoGte: intNum(),
  addedDaysAgoLte: intNum(),
  sizeOnDiskGbGte: num(),
  sizeOnDiskGbLte: num(),
  overseerrRequestStatus: intNum(),
  overseerrHasIssue: bool3(),
  tmdbStatus: z.string().optional(),
  lastWatchedDaysAgoGte: intNum(),
  lastWatchedDaysAgoLte: intNum(),
  plexAddedDaysAgoGte: intNum(),
  plexAddedDaysAgoLte: intNum(),
  jellyfinAddedDaysAgoGte: intNum(),
  jellyfinAddedDaysAgoLte: intNum(),
  fileSizeBytesGte: num(),
  fileSizeBytesLte: num(),
  releaseDaysAgoGte: intNum(),
  releaseDaysAgoLte: intNum(),
  fileContainer: z.string().optional(),
  videoCodec: z.string().optional(),
  audioCodec: z.string().optional(),
  fileResolution: z.string().optional(),
  labels: z.string().optional(),
  jellyfinIsFavorite: bool3(),
  sort: sortField,
  tautulliWatched: z.enum(['true', 'false']).optional(),
};

// Positive-int qualifier for an instance-scoped rule's sibling `*ProviderId` param —
// which instance's namespace the paired id list belongs to (§10). Absent means unqualified.
const providerIdParam = () => z.coerce.number().int().positive().optional();

export const MoviesBrowseQuerySchema = paginationQuerySchema.extend({
  ...sharedFilterFields,
  hasFile: bool3(),
  movieTagIds: z.string().optional(),
  movieTagIdsProviderId: providerIdParam(),
  movieQualityProfileIds: z.string().optional(),
  movieQualityProfileIdsProviderId: providerIdParam(),
  movieGenres: z.string().optional(),
  radarrImdbRatingGte: num(),
  radarrImdbRatingLte: num(),
  runtimeMinutesGte: intNum(),
  runtimeMinutesLte: intNum(),
  movieFileCountGte: intNum(),
  movieFileCountLte: intNum(),
  inCinemasDaysAgoGte: intNum(),
  inCinemasDaysAgoLte: intNum(),
  physicalReleaseDaysAgoGte: intNum(),
  physicalReleaseDaysAgoLte: intNum(),
  digitalReleaseDaysAgoGte: intNum(),
  digitalReleaseDaysAgoLte: intNum(),
  releaseGroups: z.string().optional(),
  collectionName: z.string().optional(),
  isAvailable: bool3(),
  radarrStatus: z.string().optional(),
});

export const SeriesBrowseQuerySchema = paginationQuerySchema.extend({
  ...sharedFilterFields,
  monitored: bool3(),
  seriesStatus: z.string().optional(),
  seriesTagIds: z.string().optional(),
  seriesTagIdsProviderId: providerIdParam(),
  seriesQualityProfileIds: z.string().optional(),
  seriesQualityProfileIdsProviderId: providerIdParam(),
  seriesGenres: z.string().optional(),
  seriesType: z.string().optional(),
  network: z.string().optional(),
  sonarrRatingGte: num(),
  sonarrRatingLte: num(),
  sonarrEnded: bool3(),
  sonarrLastAiredDaysAgoGte: intNum(),
  sonarrLastAiredDaysAgoLte: intNum(),
  sonarrPercentEpisodesGte: num(),
  sonarrPercentEpisodesLte: num(),
  seasonCountGte: intNum(),
  seasonCountLte: intNum(),
  episodeCountGte: intNum(),
  episodeCountLte: intNum(),
  nextAiringInDaysGte: intNum(),
  nextAiringInDaysLte: intNum(),
  seriesLanguageProfileIds: z.string().optional(),
  seriesLanguageProfileIdsProviderId: providerIdParam(),
});

// ─── Outputs ──────────────────────────────────────────────────────────────────

const MediaImageSchema = z.looseObject({ coverType: z.string(), remoteUrl: z.string() });

/** How many configured copies a browse row stands for, and which instances hold them. */
const BrowseCopiesSchema = {
  sourceCount: z.number(),
  sourceProviderIds: z.array(z.number()),
};

/**
 * One movie as Radarr describes it. The fields the client reads are declared;
 * the rest of Radarr's record passes through unchanged.
 */
export const ManagedMovieSchema = z.looseObject({
  id: z.number(),
  title: z.string(),
  year: z.number().optional(),
  hasFile: z.boolean(),
  monitored: z.boolean(),
  tmdbId: z.number(),
  images: z.array(MediaImageSchema).optional(),
  ...BrowseCopiesSchema,
});

/**
 * One series as Sonarr describes it. The fields the client reads are declared;
 * the rest of Sonarr's record passes through unchanged.
 */
export const ManagedSeriesSchema = z.looseObject({
  id: z.number(),
  title: z.string(),
  year: z.number().optional(),
  status: z.string(),
  monitored: z.boolean(),
  tvdbId: z.number(),
  images: z.array(MediaImageSchema).optional(),
  ...BrowseCopiesSchema,
});

/** A source instance whose library could not be fetched for this page. */
const MediaErrorSchema = z.object({ provider: z.string(), error: z.string() });

const browsePage = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    totalCount: z.number(),
    page: z.number(),
    pageSize: z.number(),
    yearRange: z.object({ min: z.number().nullable(), max: z.number().nullable() }),
    errors: z.array(MediaErrorSchema),
  });

/** A provider-owned lookup entry, tagged with the instance it came from. */
const instanceTagged = <T extends z.ZodRawShape>(shape: T) =>
  z.looseObject({ ...shape, providerId: z.number(), providerName: z.string() });

export const MediaTagSchema = instanceTagged({ id: z.number(), label: z.string() });
export const MediaProfileSchema = instanceTagged({ id: z.number(), name: z.string() });

export const MediaSourceDescriptorSchema = z.object({
  contentType: ContentTypeSchema,
  ownerType: ProviderTypeSchema,
  configured: z.boolean(),
  /** Every active instance owning this content type — never collapsed to one. */
  instances: z.array(z.object({ id: z.number(), name: z.string() })),
});

/** A filterable rule as the client sees it: everything but its predicate. */
export const MediaRuleDescriptorSchema = z.object({
  key: z.string(),
  label: z.string(),
  contentTypes: z.array(ContentTypeSchema).readonly(),
  dataType: z.enum(['boolean', 'number', 'string', 'csv-ids', 'csv-strings', 'range']),
  providers: z.array(ProviderTypeSchema).readonly(),
  required: z.boolean(),
  /** True for rules whose values are a provider-defined id space (quality profiles, tags) —
   *  the client must qualify these per instance when more than one is active. */
  instanceScoped: z.boolean().optional(),
  sourceField: z.string().optional(),
  /** What a boolean rule's two values read as; absent means Yes / No. */
  valueLabels: z.object({ true: z.string(), false: z.string() }).optional(),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .readonly()
    .optional(),
  shortLabel: z.string().optional(),
});

/** One provider's answer to a cross-provider title search. */
export const SearchResultSchema = z.object({
  providerId: z.number(),
  name: z.string(),
  type: z.string(),
  status: z.enum(['ok', 'error', 'unavailable']),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

const lookup = (path: string) =>
  base.route({ method: 'GET', path: `/api/media/${path}` }).output(z.array(z.string()));

export const media = {
  /** The rules a configured, active provider can produce, optionally for one content type. */
  rules: base
    .route({ method: 'GET', path: '/api/rules' })
    .input(z.object({ contentType: ContentTypeSchema.optional() }))
    .output(z.array(MediaRuleDescriptorSchema)),

  /** One page of movies matching the browse filters, grouped by TMDB id across instances. */
  movies: base
    .route({ method: 'GET', path: '/api/media/movies' })
    .input(MoviesBrowseQuerySchema)
    .output(browsePage(ManagedMovieSchema)),

  /** One page of series matching the browse filters, grouped by TVDB id across instances. */
  series: base
    .route({ method: 'GET', path: '/api/media/series' })
    .input(SeriesBrowseQuerySchema)
    .output(browsePage(ManagedSeriesSchema)),

  tags: base
    .route({ method: 'GET', path: '/api/media/tags' })
    .output(z.object({ radarr: z.array(MediaTagSchema), sonarr: z.array(MediaTagSchema) })),

  qualityProfiles: base
    .route({ method: 'GET', path: '/api/media/quality-profiles' })
    .output(z.object({ radarr: z.array(MediaProfileSchema), sonarr: z.array(MediaProfileSchema) })),

  languageProfiles: base
    .route({ method: 'GET', path: '/api/media/language-profiles' })
    .output(z.array(MediaProfileSchema)),

  genres: base
    .route({ method: 'GET', path: '/api/media/genres' })
    .output(z.object({ movies: z.array(z.string()), series: z.array(z.string()) })),

  networks: lookup('networks'),
  studio: lookup('studio'),
  releaseGroups: lookup('release-groups'),
  collectionNames: lookup('collection-names'),
  fileContainers: lookup('file-containers'),
  videoCodecs: lookup('video-codecs'),
  audioCodecs: lookup('audio-codecs'),
  fileResolutions: lookup('file-resolutions'),
  labels: lookup('labels'),

  /** Which provider type owns each content type, and its active instances. */
  sources: base
    .route({ method: 'GET', path: '/api/media/sources' })
    .output(z.array(MediaSourceDescriptorSchema)),

  /** TMDB's trending backdrop image URLs, shown behind the sign-in page. */
  backdrops: base
    .meta({ public: true })
    .route({ method: 'GET', path: '/api/backdrops' })
    .output(z.array(z.string())),

  /** Searches every active searchable provider for a title. */
  search: base
    .route({ method: 'GET', path: '/api/search/metadata' })
    .input(z.object({ title: z.string().min(1) }))
    .output(z.array(SearchResultSchema)),

  /** Deletes Warden's stored media identity and enrichment data. */
  reset: base
    .route({ method: 'DELETE', path: '/api/media/reset' })
    .output(z.object({ deletedIdentities: z.number() })),
};

export type ManagedMovie = z.infer<typeof ManagedMovieSchema>;
export type ManagedSeries = z.infer<typeof ManagedSeriesSchema>;
export type MediaTag = z.infer<typeof MediaTagSchema>;
export type MediaProfile = z.infer<typeof MediaProfileSchema>;
export type MediaSourceDescriptor = z.infer<typeof MediaSourceDescriptorSchema>;
export type MediaRuleDescriptor = z.infer<typeof MediaRuleDescriptorSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type MoviesBrowseQuery = z.input<typeof MoviesBrowseQuerySchema>;
export type SeriesBrowseQuery = z.input<typeof SeriesBrowseQuerySchema>;
