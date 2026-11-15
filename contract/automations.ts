import { z } from 'zod';
import { base } from './base';
import { ReadinessFindingSchema } from './readiness';
import {
  AutomationRunSchema,
  AutomationSchema,
  AutomationStatusSchema,
  ContentTypeSchema,
  IdSchema,
  QueryIntSchema,
  RunItemSchema,
  emptyToUndefined,
} from './schemas';

/** One query an automation draws from, included in or excluded from its media set. */
const AutomationQueryInputSchema = z.object({
  queryId: z.number().int().positive(),
  role: z.enum(['include', 'exclude']),
  sortOrder: z.number().int().optional(),
});

export type AutomationQueryInput = z.input<typeof AutomationQueryInputSchema>;

/**
 * A new automation's draft. `queryId` is the single-query shorthand: it becomes
 * one included query when `queries` is absent.
 */
const CreateAutomationInputSchema = z
  .object({
    name: z.string().min(1).max(200),
    providerId: z.number().int().positive(),
    taskId: z.string().min(1),
    taskParameter: z.string().min(1).optional(),
    schedule: z.string().min(1),
    queries: z.array(AutomationQueryInputSchema).min(1).optional(),
    queryId: z.number().int().positive().optional(),
  })
  .transform((val) => ({
    name: val.name,
    providerId: val.providerId,
    taskId: val.taskId,
    taskParameter: val.taskParameter,
    schedule: val.schedule,
    queries:
      val.queries ??
      (val.queryId ? [{ queryId: val.queryId, role: 'include' as const, sortOrder: 0 }] : []),
  }));

export type CreateAutomationInput = z.input<typeof CreateAutomationInputSchema>;

/** An unsaved automation's targeting: the queries it draws from and the task it would run. */
const AutomationPreviewInputSchema = z.object({
  providerId: z.number().int().positive(),
  taskId: z.string().min(1),
  queries: z
    .array(AutomationQueryInputSchema)
    .refine((queries) => queries.some((q) => q.role === 'include'), {
      message: 'At least one query must be included',
    }),
});

export type AutomationPreviewInput = z.input<typeof AutomationPreviewInputSchema>;

const AutomationPreviewSchema = z.object({
  /** How many items a run would hand the task now. */
  count: z.number().int().nonnegative(),
  contentType: ContentTypeSchema,
});

export type AutomationPreview = z.infer<typeof AutomationPreviewSchema>;

const AutomationReadinessSchema = z.object({
  schedule: z.enum(['runs', 'blocked']),
  /** `asks` while a finding awaits sign-off: Run Now proceeds only past findings it names. */
  runNow: z.enum(['runs', 'asks', 'stops']),
  blocks: z.object({
    needsFix: z.array(ReadinessFindingSchema),
    awaitingSignOff: z.array(ReadinessFindingSchema),
    signedOff: z.array(ReadinessFindingSchema),
  }),
  /** Reasons that belong to the automation rather than its filters, such as its provider. */
  problems: z.array(z.string()),
  /** How many items a run would hand the task now; null when the count failed. */
  count: z.number().int().nonnegative().nullable(),
  countError: z.string().optional(),
  contentType: ContentTypeSchema,
});

export type AutomationReadiness = z.infer<typeof AutomationReadinessSchema>;

export const automations = {
  list: base
    .route({ method: 'GET', path: '/api/automations' })
    .input(z.object({ kind: emptyToUndefined(z.enum(['user', 'system'])) }))
    .output(z.array(AutomationSchema)),

  create: base
    .route({ method: 'POST', path: '/api/automations' })
    .input(CreateAutomationInputSchema)
    .output(AutomationSchema),

  updateStatus: base
    .route({ method: 'PATCH', path: '/api/automations/{id}/status' })
    .input(z.object({ id: IdSchema, status: AutomationStatusSchema }))
    .output(AutomationSchema),

  delete: base
    .route({ method: 'DELETE', path: '/api/automations/{id}' })
    .input(z.object({ id: IdSchema }))
    .output(z.null()),

  /**
   * What an unsaved automation would act on if it ran now, resolved exactly as
   * a run resolves its targets. Nothing runs and no run is recorded. A POST
   * because the draft (several queries with roles) is a body, not a resource id.
   */
  preview: base
    .route({ method: 'POST', path: '/api/automations/preview' })
    .input(AutomationPreviewInputSchema)
    .output(AutomationPreviewSchema),

  /**
   * Starts a Run Now in the background; answers 202 once the automation is known to exist.
   * `consentedFindings` names the findings awaiting sign-off the user chose to proceed past for
   * this run only; one not named stops the run.
   */
  run: base
    .route({ method: 'POST', path: '/api/automations/{id}/run', successStatus: 202 })
    .input(z.object({ id: IdSchema, consentedFindings: z.array(z.string()).optional() }))
    .output(z.null()),

  /**
   * What a Run Now of the automation would do and why: its filter findings split into those
   * needing a fix, awaiting sign-off and signed off, plus how many items it would act on.
   */
  readiness: base
    .route({ method: 'GET', path: '/api/automations/{id}/readiness' })
    .input(z.object({ id: IdSchema }))
    .output(AutomationReadinessSchema),

  /**
   * Accepts a finding awaiting sign-off as known risk for this automation, so its schedule can
   * run. Answers 409 when the latest check no longer found it, or it is already signed off.
   */
  signOff: base
    .route({ method: 'POST', path: '/api/automations/{id}/sign-offs' })
    .input(z.object({ id: IdSchema, findingId: z.string().min(1) }))
    .output(z.null()),

  /** Run history, newest first; `limit` is capped at 100. */
  runs: base
    .route({ method: 'GET', path: '/api/automations/runs' })
    .input(
      z.object({
        automationId: emptyToUndefined(QueryIntSchema),
        limit: emptyToUndefined(QueryIntSchema.transform((v) => Math.min(v, 100))),
        offset: emptyToUndefined(QueryIntSchema),
      })
    )
    .output(z.object({ data: z.array(AutomationRunSchema), total: z.number() })),

  /** The items one run targeted, by title; `limit` is capped at 100. */
  runItems: base
    .route({ method: 'GET', path: '/api/automations/runs/{runId}/items' })
    .input(
      z.object({
        runId: IdSchema,
        limit: emptyToUndefined(QueryIntSchema.transform((v) => Math.min(v, 100))),
        offset: emptyToUndefined(QueryIntSchema),
      })
    )
    .output(z.object({ data: z.array(RunItemSchema), total: z.number() })),
};
