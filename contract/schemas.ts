import { z } from 'zod';

// Accepts a Date object (from services) or an ISO string (from JSON.parse).
// Always outputs a string — matches the JSON wire format.
// Handlers can return Date values directly; no manual .toISOString() needed.
export const IsoDateSchema = z.union([z.date().transform((d) => d.toISOString()), z.string()]);

// Strips empty query-string values (e.g. ?kind=) before optional parsing,
// so absent params and empty params are both treated as undefined.
export const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const ContentTypeSchema = z.enum(['movie', 'show']);

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
    status: z.enum(['active', 'paused']),
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

export const CreateAutomationInputSchema = z.object({
  name: z.string().min(1).max(200),
  queryId: z.number().int().positive(),
  providerId: z.number().int().positive(),
  taskId: z.string().min(1),
  taskParameter: z.string().optional(),
  schedule: z.string().min(1),
});

export const UpdateAutomationStatusInputSchema = z.object({
  status: z.enum(['active', 'paused']),
});

export const CreateProviderInputSchema = z.object({
  type: z.string(),
  name: z.string().min(1),
  url: z.string().url(),
  apiKey: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const UpdateProviderInputSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  apiKey: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// ─── Additional response schemas ─────────────────────────────────────────────

export const ProviderSchema = z
  .object({
    id: z.number(),
    type: z.string(),
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
