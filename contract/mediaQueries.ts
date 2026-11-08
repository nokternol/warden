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

  /**
   * How many titles the query matches now, read live from every active source instance of its
   * content type. Copies sharing a provider id (TMDB for movies, TVDB for series) are one title.
   * Rejects when any instance cannot be read, so a count is never quietly short.
   */
  preview: base
    .route({ method: 'GET', path: '/api/media-queries/{id}/preview' })
    .input(z.object({ id: IdSchema }))
    .output(z.object({ count: z.number() })),
};
