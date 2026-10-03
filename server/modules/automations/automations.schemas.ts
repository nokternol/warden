import { emptyToUndefined } from '@contract/schemas';
import { z } from 'zod';

const idParams = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a positive integer')
    .transform((v) => Number.parseInt(v, 10)),
});

const optionalInt = emptyToUndefined(
  z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number.parseInt(v, 10))
);

const listRunsQuery = z.object({
  automationId: optionalInt,
  limit: emptyToUndefined(
    z
      .string()
      .regex(/^\d+$/)
      .transform((v) => Math.min(Number.parseInt(v, 10), 100))
  ),
  offset: optionalInt,
});

export const automationSchemas = {
  list: {
    query: z.object({
      kind: emptyToUndefined(z.enum(['user', 'system'])),
    }),
  },

  create: {
    body: z
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
        // Deprecated — convert to single include source when querySources not provided
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
      })),
  },

  updateStatus: {
    params: idParams,
    body: z.object({
      status: z.enum(['active', 'paused']),
    }),
  },

  delete: {
    params: idParams,
  },

  run: {
    params: idParams,
  },

  listRuns: {
    query: listRunsQuery,
  },
};

export type CreateAutomationBody = z.infer<typeof automationSchemas.create.body>;
export type UpdateAutomationStatusBody = z.infer<typeof automationSchemas.updateStatus.body>;
export type AutomationIdParams = z.infer<typeof idParams>;
export type ListRunsQuery = z.infer<typeof listRunsQuery>;
