import { z } from 'zod';
import { base } from './base';
import { IdSchema, MediaQueryRecordSchema, MediaQueryValueSchema } from './schemas';

export const mediaQueries = {
  list: base
    .route({ method: 'GET', path: '/api/media-queries' })
    .output(z.array(MediaQueryRecordSchema)),

  create: base
    .route({ method: 'POST', path: '/api/media-queries' })
    .input(MediaQueryValueSchema)
    .output(MediaQueryRecordSchema),

  delete: base
    .route({ method: 'DELETE', path: '/api/media-queries/{id}' })
    .input(z.object({ id: IdSchema }))
    .output(z.null()),

  /** How many items the query matches now, per active source instance and in total. */
  preview: base
    .route({ method: 'GET', path: '/api/media-queries/{id}/preview' })
    .input(z.object({ id: IdSchema }))
    .output(
      z.object({
        count: z.number(),
        instances: z.array(
          z.object({ providerId: z.number(), name: z.string(), count: z.number() })
        ),
      })
    ),
};
