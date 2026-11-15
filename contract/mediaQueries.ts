import { z } from 'zod';
import { base } from './base';
import { RefreshRecordSchema } from './media';
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

  /**
   * How many titles the query matches in the library copy, counting the copies the catalog refresh
   * grouped into one title once, with the refresh records saying how current that copy is.
   */
  preview: base
    .route({ method: 'GET', path: '/api/media-queries/{id}/preview' })
    .input(z.object({ id: IdSchema }))
    .output(z.object({ count: z.number(), records: z.array(RefreshRecordSchema) })),
};
