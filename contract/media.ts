import { z } from 'zod';
import { base } from './base';
import { type ContentType, ContentTypeSchema, FilterSchema, ProviderTypeSchema } from './schemas';

// ─── Browse query ───────────────────────────────────────────────────────────────

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().optional().default(48),
});

const sortField = z
  .enum(['title_asc', 'title_desc', 'year_asc', 'year_desc', 'status_asc', 'status_desc'])
  .optional()
  .default('title_asc');

/**
 * A query-string value holding JSON, parsed and then validated by `schema`.
 * Bracket-encoded query values arrive as strings, so a structured value that
 * must keep its types (booleans, numbers, nested objects) travels as JSON.
 */
const jsonQuery = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'must be JSON' });
        return z.NEVER;
      }
    })
    .pipe(schema);

/**
 * A browse request: the saved-query `Filter` entries, plus sort and page. Strict,
 * so a filter sent as its own query param answers 400 rather than being dropped
 * and browsing unfiltered.
 */
export const BrowseQuerySchema = paginationQuerySchema
  .extend({
    filters: jsonQuery(z.array(FilterSchema)).optional(),
    sort: sortField,
  })
  .strict();

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

/**
 * The lookup a multi-value rule's selectable values come from. Each name is the
 * `media` procedure that serves that lookup (checked below `media`). Id lookups
 * hold provider-minted ids for `instance-ids` rules; string lookups hold library
 * values for `csv-strings` rules.
 */
export const InstanceIdLookupSchema = z.enum(['tags', 'qualityProfiles', 'languageProfiles']);
export const StringLookupSchema = z.enum([
  'genres',
  'networks',
  'studio',
  'releaseGroups',
  'collectionNames',
  'fileContainers',
  'videoCodecs',
  'audioCodecs',
  'fileResolutions',
  'labels',
]);

const ruleOptionSchema = z.object({ value: z.string(), label: z.string() });

/** The presentation every rule carries, whatever its data type. */
const ruleDescriptorBase = {
  key: z.string(),
  label: z.string(),
  contentTypes: z.array(ContentTypeSchema).readonly(),
  /** True for rules whose values are a provider-defined id space (quality profiles, tags) —
   *  the client must qualify these per instance when more than one is active. */
  instanceScoped: z.boolean().optional(),
  /** A shorter label for where the section heading already gives context; absent means `label`. */
  shortLabel: z.string().optional(),
  /** The section heading the rule is shown under; absent for the universal title and year. */
  group: z.string().optional(),
};

/**
 * A filterable rule as the client sees it: an allowlist of presentation fields,
 * with no predicate, producing providers, field mapping or precedence.
 *
 * Each data type states what its control needs, so every valid descriptor has a
 * control: a boolean may name its value labels (absent means Yes / No), a string
 * with options is an enum and without them is free text, a number is always an
 * enum, and a multi-value rule names the lookup its options come from. A rule
 * that cannot satisfy its variant cannot be described, and is not offered.
 */
export const MediaRuleDescriptorSchema = z.discriminatedUnion('dataType', [
  z.object({
    ...ruleDescriptorBase,
    dataType: z.literal('boolean'),
    valueLabels: z.object({ true: z.string(), false: z.string() }).optional(),
  }),
  z.object({ ...ruleDescriptorBase, dataType: z.literal('range') }),
  z.object({
    ...ruleDescriptorBase,
    dataType: z.literal('string'),
    options: z.array(ruleOptionSchema).readonly().optional(),
  }),
  z.object({
    ...ruleDescriptorBase,
    dataType: z.literal('number'),
    options: z.array(ruleOptionSchema).readonly(),
  }),
  z.object({
    ...ruleDescriptorBase,
    dataType: z.literal('csv-strings'),
    lookup: StringLookupSchema,
  }),
  z.object({
    ...ruleDescriptorBase,
    dataType: z.literal('instance-ids'),
    lookup: InstanceIdLookupSchema,
  }),
]);

/** One provider's answer to a cross-provider title search. */
export const SearchResultSchema = z.object({
  providerId: z.number(),
  name: z.string(),
  type: z.string(),
  status: z.enum(['ok', 'error', 'unavailable']),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

/** One page of a content type's library matching the filters, grouped across instances. */
const browse = <T extends z.ZodType>(contentType: ContentType, item: T) =>
  base
    .route({ method: 'GET', path: `/api/media/${contentType}` })
    .input(BrowseQuerySchema)
    .output(browsePage(item));

const lookup = (path: string) =>
  base.route({ method: 'GET', path: `/api/media/${path}` }).output(z.array(z.string()));

export const media = {
  /** The rules a configured, active provider can produce, optionally for one content type. */
  rules: base
    .route({ method: 'GET', path: '/api/rules' })
    .input(z.object({ contentType: ContentTypeSchema.optional() }))
    .output(z.array(MediaRuleDescriptorSchema)),

  /** Browse, per content type: `GET /api/media/{movie|series}`. Movies group by TMDB id, series by TVDB id. */
  browse: {
    movie: browse('movie', ManagedMovieSchema),
    series: browse('series', ManagedSeriesSchema),
  },

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

const _everyLookupIsAProcedure: readonly (keyof typeof media)[] = [
  ...InstanceIdLookupSchema.options,
  ...StringLookupSchema.options,
];

export type ManagedMovie = z.infer<typeof ManagedMovieSchema>;
export type ManagedSeries = z.infer<typeof ManagedSeriesSchema>;
export type MediaTag = z.infer<typeof MediaTagSchema>;
export type MediaProfile = z.infer<typeof MediaProfileSchema>;
export type MediaSourceDescriptor = z.infer<typeof MediaSourceDescriptorSchema>;
export type MediaRuleDescriptor = z.infer<typeof MediaRuleDescriptorSchema>;
export type InstanceIdLookup = z.infer<typeof InstanceIdLookupSchema>;
export type StringLookup = z.infer<typeof StringLookupSchema>;
export type MediaLookup = InstanceIdLookup | StringLookup;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type BrowseQuery = z.input<typeof BrowseQuerySchema>;
