import { FilterValueEntrySchema } from '@contract/schemas';
import { z } from 'zod';

const idParams = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'id must be a positive integer')
    .transform((v) => Number.parseInt(v, 10)),
});

export const mediaQuerySchemas = {
  create: {
    body: z.object({
      name: z.string().min(1).max(200),
      contentType: z.enum(['movie', 'show']),
      filterValues: z.array(FilterValueEntrySchema),
    }),
  },
  delete: {
    params: idParams,
  },
};

export type CreateMediaQueryBody = z.infer<typeof mediaQuerySchemas.create.body>;
export type MediaQueryIdParams = z.infer<typeof idParams>;
