import { z } from 'zod';
import { base } from './base';
import { IdSchema, ProviderSchema, ProviderTypeSchema } from './schemas';

/** The routes a `select`-parameter task names as `optionsRoute`. */
export const TaskOptionsRouteSchema = z.enum([
  'quality-profiles',
  'root-folders',
  'collections',
  'language-profiles',
]);

const TaskParameterFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(['select', 'text', 'boolean']),
  optionsRoute: z.string().optional(),
});

/** The value(s) a task takes, captured with the automation that runs it. */
export const TaskParameterSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('select'), label: z.string(), optionsRoute: z.string() }),
  z.object({ type: z.literal('text'), label: z.string() }),
  z.object({
    type: z.literal('fields'),
    label: z.string(),
    fields: z.array(TaskParameterFieldSchema),
  }),
]);

/** One task an actuator instance offers, and whether it is enabled there. */
export const ProviderTaskSchema = z.object({
  id: z.string(),
  label: z.string(),
  destructive: z.boolean(),
  affects: z.literal('media').optional(),
  parameter: TaskParameterSchema.optional(),
  enabled: z.boolean(),
});

export const ProviderTaskAvailabilitySchema = z.object({
  providerId: z.number(),
  type: z.string(),
  tasks: z.array(ProviderTaskSchema),
});

export const ProviderTaskOptionSchema = z.object({ id: z.string(), label: z.string() });

export const ProviderTaskOptionsAvailabilitySchema = z.object({
  providerId: z.number(),
  type: z.string(),
  options: z.array(ProviderTaskOptionSchema),
});

const TmdbRatingSchema = z.object({
  source: z.literal('tmdb'),
  tmdbId: z.number().optional(),
  imdbId: z.string().optional(),
  mediaType: z.enum(['movie', 'tv']).optional(),
  movieRating: z.number().optional(),
  movieVotes: z.number().optional(),
  tvRating: z.number().optional(),
  tvVotes: z.number().optional(),
  popularity: z.number().optional(),
  found: z.boolean(),
});

const OmdbRatingSchema = z.object({
  source: z.literal('omdb'),
  imdbId: z.string().optional(),
  imdbRating: z.number().optional(),
  imdbVotes: z.number().optional(),
  rottenTomatoesRating: z.number().optional(),
  metacriticRating: z.number().optional(),
  found: z.boolean(),
  awardWinner: z.boolean().optional(),
  oscarWinner: z.boolean().optional(),
  director: z.string().optional(),
  actors: z.string().optional(),
  language: z.string().optional(),
  boxOffice: z.number().optional(),
});

const TvMazeRatingSchema = z.object({
  source: z.literal('tvmaze'),
  tvMazeId: z.number().optional(),
  tvdbId: z.number().nullable().optional(),
  imdbId: z.string().nullable().optional(),
  rating: z.number().optional(),
  found: z.boolean(),
});

/** One title's ratings from every rating source that answered. */
export const AggregatedRatingsSchema = z.object({
  title: z.string(),
  year: z.number().optional(),
  ids: z.object({
    tmdbId: z.number().optional(),
    imdbId: z.string().optional(),
    tvdbId: z.number().nullable().optional(),
    tvMazeId: z.number().optional(),
  }),
  tmdb: TmdbRatingSchema.optional(),
  omdb: OmdbRatingSchema.optional(),
  tvmaze: TvMazeRatingSchema.optional(),
  summary: z.object({
    averageRating: z.number().optional(),
    totalSources: z.number(),
    foundSources: z.number(),
  }),
});

const ProviderSettingsInputSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  apiKey: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

/** A provider instance to configure. */
export const ProviderDraftSchema = ProviderSettingsInputSchema.extend({ type: ProviderTypeSchema });

/** Changes to a configured provider instance. */
export const ProviderPatchSchema = ProviderSettingsInputSchema.partial();

export const providers = {
  // ─── Configured instances ────────────────────────────────────────────────
  list: base.route({ method: 'GET', path: '/api/providers' }).output(z.array(ProviderSchema)),

  create: base
    .route({ method: 'POST', path: '/api/providers' })
    .input(ProviderDraftSchema)
    .output(ProviderSchema),

  update: base
    .route({ method: 'PATCH', path: '/api/providers/{id}' })
    .input(
      ProviderPatchSchema.extend({ id: IdSchema }).refine(
        ({ id: _id, ...patch }) => Object.keys(patch).length > 0,
        {
          message: 'At least one field required',
        }
      )
    )
    .output(ProviderSchema),

  delete: base
    .route({ method: 'DELETE', path: '/api/settings/providers/{id}' })
    .input(z.object({ id: IdSchema }))
    .output(z.null()),

  /** Probes a provider's connection details before they are saved. */
  test: base
    .route({ method: 'GET', path: '/api/settings/providers/test' })
    .input(
      z.object({ type: ProviderTypeSchema, url: z.string().url(), apiKey: z.string().optional() })
    )
    .output(z.object({ ok: z.boolean(), error: z.string().optional() })),

  // ─── Capabilities ────────────────────────────────────────────────────────
  /** Per configured actuator instance, the tasks it offers. Non-actuators are absent. */
  tasks: base
    .route({ method: 'GET', path: '/api/providers/tasks' })
    .output(z.array(ProviderTaskAvailabilitySchema)),

  /** Per configured instance, the live choices it offers for one options route. */
  taskOptions: base
    .route({ method: 'GET', path: '/api/providers/task-options/{route}' })
    .input(z.object({ route: TaskOptionsRouteSchema }))
    .output(z.array(ProviderTaskOptionsAvailabilitySchema)),

  /** A provider's raw catalogue data, fetched with ad-hoc connection details. */
  metadata: base
    .route({ method: 'GET', path: '/api/providers/metadata' })
    .input(
      z.object({
        type: ProviderTypeSchema,
        url: z.string().url(),
        apiKey: z.string().optional().default(''),
        /** JSON-encoded extra settings (e.g. `{"userId":"abc"}` for Jellyfin). */
        settings: z
          .string()
          .optional()
          .transform((val) => {
            if (!val) return {};
            try {
              return JSON.parse(val) as Record<string, unknown>;
            } catch {
              return {};
            }
          }),
      })
    )
    .output(z.object({ type: z.string(), data: z.record(z.string(), z.unknown()) }).optional()),

  /** A title's ratings aggregated across TMDB, OMDb and TVmaze. */
  ratings: base
    .route({ method: 'GET', path: '/api/providers/ratings' })
    .input(
      z.object({
        title: z.string().min(1),
        year: z
          .union([
            z.number(),
            z.string().transform((v) => (v ? Number.parseInt(v, 10) : undefined)),
          ])
          .optional(),
        tmdbApiKey: z.string().optional(),
        omdbApiKey: z.string().optional(),
      })
    )
    .output(AggregatedRatingsSchema),
};

export type { ProviderType } from './schemas';
export type ProviderDraft = z.input<typeof ProviderDraftSchema>;
export type ProviderPatch = z.input<typeof ProviderPatchSchema>;
export type TaskOptionsRoute = z.infer<typeof TaskOptionsRouteSchema>;
export type TaskParameter = z.infer<typeof TaskParameterSchema>;
export type ProviderTask = z.infer<typeof ProviderTaskSchema>;
export type ProviderTaskAvailability = z.infer<typeof ProviderTaskAvailabilitySchema>;
export type ProviderTaskOption = z.infer<typeof ProviderTaskOptionSchema>;
export type ProviderTaskOptionsAvailability = z.infer<typeof ProviderTaskOptionsAvailabilitySchema>;
export type AggregatedRatings = z.infer<typeof AggregatedRatingsSchema>;
