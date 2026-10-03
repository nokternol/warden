import { z } from 'zod';
import { base } from './base';
import {
  AutomationRunSchema,
  AutomationSchema,
  IdSchema,
  QueryIntSchema,
  emptyToUndefined,
} from './schemas';

const AutomationStatusSchema = z.enum(['active', 'paused']);

/**
 * A new automation's draft. `queryId` is the single-query form older callers
 * send; it becomes one include source when `querySources` is absent.
 */
const CreateAutomationInputSchema = z
  .object({
    name: z.string().min(1).max(200),
    providerId: z.number().int().positive(),
    taskId: z.string().min(1),
    taskParameter: z.string().min(1).optional(),
    schedule: z.string().min(1),
    querySources: z
      .array(
        z.object({
          queryId: z.number().int().positive(),
          role: z.enum(['include', 'exclude']),
          sortOrder: z.number().int().optional(),
        })
      )
      .min(1)
      .optional(),
    queryId: z.number().int().positive().optional(),
  })
  .transform((val) => ({
    name: val.name,
    providerId: val.providerId,
    taskId: val.taskId,
    taskParameter: val.taskParameter,
    schedule: val.schedule,
    querySources:
      val.querySources ??
      (val.queryId ? [{ queryId: val.queryId, role: 'include' as const, sortOrder: 0 }] : []),
  }));

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

  /** Starts a run in the background; answers 202 once the automation is known to exist. */
  run: base
    .route({ method: 'POST', path: '/api/automations/{id}/run', successStatus: 202 })
    .input(z.object({ id: IdSchema }))
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
};
