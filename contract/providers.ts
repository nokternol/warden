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

/** A provider type Warden offers, as the add-provider list presents it. */
export const ProviderTypeDescriptorSchema = z.object({
  type: ProviderTypeSchema,
  label: z.string(),
  /** The path appended to the host the user enters to reach the provider's API. */
  apiPath: z.string(),
  /** The URL every instance uses, for a hosted service; absent means the user enters a host. */
  defaultUrl: z.string().optional(),
  /** Whether a connection needs an API key; absent means it does not. */
  apiKeyRequired: z.boolean().optional(),
  /** An example host on the type's default port, for a type whose host the user enters. */
  hostPlaceholder: z.string().optional(),
  /** What the provider contributes to filtering, as short phrases. */
  filterData: z.array(z.string()),
});

export const providers = {
  // ─── Catalogue ───────────────────────────────────────────────────────────
  /** The provider types that can be configured, in display order. */
  types: base
    .route({ method: 'GET', path: '/api/providers/types' })
    .output(z.array(ProviderTypeDescriptorSchema)),

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
    .route({ method: 'DELETE', path: '/api/providers/{id}' })
    .input(z.object({ id: IdSchema }))
    .output(z.null()),

  /**
   * Probes a provider's connection details, saved or not. With `id` and no `apiKey`, it uses the
   * key stored for that provider, which the client never holds.
   */
  test: base
    .route({ method: 'GET', path: '/api/providers/test' })
    .input(
      z.object({
        type: ProviderTypeSchema,
        url: z.string().url(),
        apiKey: z.string().optional(),
        id: IdSchema.optional(),
      })
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
};

export type { ProviderType } from './schemas';
export type ProviderDraft = z.input<typeof ProviderDraftSchema>;
export type ProviderPatch = z.input<typeof ProviderPatchSchema>;
export type ProviderTypeDescriptor = z.infer<typeof ProviderTypeDescriptorSchema>;
export type TaskOptionsRoute = z.infer<typeof TaskOptionsRouteSchema>;
export type TaskParameter = z.infer<typeof TaskParameterSchema>;
export type ProviderTask = z.infer<typeof ProviderTaskSchema>;
export type ProviderTaskAvailability = z.infer<typeof ProviderTaskAvailabilitySchema>;
export type ProviderTaskOption = z.infer<typeof ProviderTaskOptionSchema>;
export type ProviderTaskOptionsAvailability = z.infer<typeof ProviderTaskOptionsAvailabilitySchema>;
