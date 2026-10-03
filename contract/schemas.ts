import { z } from 'zod';

// Accepts a Date object (from services) or an ISO string (from JSON.parse).
// Always outputs a string — matches the JSON wire format.
// Handlers can return Date values directly; no manual .toISOString() needed.
export const IsoDateSchema = z.union([z.date().transform((d) => d.toISOString()), z.string()]);

// Strips empty query-string values (e.g. ?kind=) before optional parsing,
// so absent params and empty params are both treated as undefined.
export const emptyToUndefined = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal('').transform(() => undefined), schema]).optional();

// A path id: callers pass a number, the server receives the URL segment as a string.
export const IdSchema = z.union([
  z.number().int().positive(),
  z
    .string()
    .regex(/^\d+$/, 'id must be a positive integer')
    .transform((v) => Number.parseInt(v, 10)),
]);

// A non-negative integer query param: callers pass a number, the server
// receives the query-string value as a string.
export const QueryIntSchema = z.union([
  z.number().int().nonnegative(),
  z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10)),
]);

export const ContentTypeSchema = z.enum(['movie', 'show']);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({ min: z.number().optional(), max: z.number().optional() }).strict(),
]);

export const FilterValueEntrySchema = z
  .object({
    key: z.string(),
    value: FilterValueSchema,
    // Namespace qualification for provider-defined id spaces (quality profiles, tags) —
    // not targeting (see automations.providerId for that). Undefined means unqualified.
    providerId: z.number().int().positive().optional(),
  })
  .strict();

export const ProviderStatusSchema = z
  .object({
    providerType: z.string(),
    required: z.boolean(),
    configured: z.boolean(),
    affectedFilterKeys: z.array(z.string()),
  })
  .strict();

export const QualificationIssueSchema = z
  .object({
    filterKey: z.string(),
    providerId: z.number(),
    reason: z.enum(['not_active', 'wrong_automation_provider']),
  })
  .strict();

export const QueryHealthSchema = z
  .object({
    status: z.enum(['healthy', 'degraded', 'unavailable']),
    providerStatus: z.array(ProviderStatusSchema),
    qualificationIssues: z.array(QualificationIssueSchema),
  })
  .strict();

export const MediaQueryRecordSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    contentType: ContentTypeSchema,
    filterValues: z.array(FilterValueEntrySchema),
    health: QueryHealthSchema,
    createdAt: z.string(),
  })
  .strict();

export const AutomationQueryRefSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    contentType: ContentTypeSchema,
  })
  .strict()
  .nullable();

export const ProviderRefSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    type: z.string(),
  })
  .strict()
  .nullable();

export const AutomationLastRunSchema = z
  .object({
    at: z.string(),
    itemCount: z.number(),
    status: z.enum(['success', 'error']),
    error: z.string().optional(),
  })
  .strict();

export const AutomationQuerySourceSchema = z
  .object({
    queryId: z.number(),
    role: z.enum(['include', 'exclude']),
    sortOrder: z.number(),
  })
  .strict();

export const AutomationStatusSchema = z.enum(['active', 'disabled']);

export const AutomationSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    kind: z.enum(['user', 'system']),
    query: AutomationQueryRefSchema,
    querySources: z.array(AutomationQuerySourceSchema),
    provider: ProviderRefSchema,
    taskId: z.string(),
    taskParameter: z.string().optional(),
    schedule: z.string(),
    status: AutomationStatusSchema,
    lastRun: AutomationLastRunSchema.optional(),
    nextRun: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

// ─── Input schemas (request bodies) ─────────────────────────────────────────

export const MediaQueryValueSchema = z.object({
  name: z.string().min(1).max(200),
  contentType: ContentTypeSchema,
  filterValues: z.array(FilterValueEntrySchema),
});

// ─── Additional response schemas ─────────────────────────────────────────────

/** Every provider type the server knows how to configure. */
export const ProviderTypeSchema = z.enum([
  'RADARR',
  'SONARR',
  'TAUTULLI',
  'PLEX',
  'JELLYFIN',
  'OVERSEERR',
  'SEERR',
  'TMDB',
  'OMDB',
  'TVMAZE',
]);

export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const ProviderSchema = z
  .object({
    id: z.number(),
    type: ProviderTypeSchema,
    name: z.string(),
    url: z.string(),
    apiKey: z.union([z.literal('***'), z.null()]),
    settings: z.record(z.string(), z.unknown()).nullable(),
    isActive: z.boolean(),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
  })
  .strict();

export const AutomationRunSchema = z
  .object({
    id: z.number(),
    automationId: z.number(),
    automationName: z.string(),
    ranAt: IsoDateSchema,
    status: z.enum(['success', 'error']),
    itemCount: z.number().nullable(),
    error: z.string().nullable(),
    createdAt: IsoDateSchema,
  })
  .strict();

export type AutomationStatus = z.infer<typeof AutomationStatusSchema>;
export type AutomationDto = z.infer<typeof AutomationSchema>;
export type AutomationRunDto = z.infer<typeof AutomationRunSchema>;
export type MediaQueryRecord = z.infer<typeof MediaQueryRecordSchema>;
export type ProviderSummary = z.infer<typeof ProviderSchema>;
