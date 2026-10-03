import { MediaQueryRecordSchema } from '@contract/schemas';
import { defineRoute } from '@server/kernel/defineRoute';
import { isAuthenticated } from '@server/kernel/middleware/auth';
import type { MediaQueryEngine, MediaSourceFactory } from '@server/modules/media';
import { z } from 'zod';
import { mediaQuerySchemas } from './mediaQueries.schemas';
import type { MediaQueryService } from './mediaQueryService';

interface Cradle {
  mediaQueryService: MediaQueryService;
  mediaSourceFactory: MediaSourceFactory;
  mediaQueryEngine: MediaQueryEngine;
}

export function createMediaQueryHandlers(cradle: Cradle) {
  const { mediaQueryService, mediaSourceFactory, mediaQueryEngine } = cradle;

  return {
    list: [
      isAuthenticated(),
      defineRoute({
        schemas: { response: z.array(MediaQueryRecordSchema) },
        handler: async () => mediaQueryService.list(),
      }),
    ],

    create: [
      isAuthenticated(),
      defineRoute({
        schemas: { ...mediaQuerySchemas.create, response: MediaQueryRecordSchema },
        handler: async ({ body }) =>
          mediaQueryService.create({
            name: body.name,
            contentType: body.contentType,
            filterValues: body.filterValues,
          }),
      }),
    ],

    delete: [
      isAuthenticated(),
      defineRoute({
        schemas: mediaQuerySchemas.delete,
        handler: async ({ params }) => {
          await mediaQueryService.delete(params.id);
          return null;
        },
      }),
    ],

    preview: [
      isAuthenticated(),
      defineRoute({
        schemas: {
          params: mediaQuerySchemas.delete.params,
          response: z.object({
            count: z.number(),
            instances: z.array(
              z.object({ providerId: z.number(), name: z.string(), count: z.number() })
            ),
          }),
        },
        handler: async ({ params }) => {
          const query = await mediaQueryService.getById(params.id);
          const entries = await mediaSourceFactory.sourcesFor(query.contentType);

          const instances = await Promise.all(
            entries.map(async ({ providerId, name, source }) => {
              const set = await mediaQueryEngine.evaluate({
                source,
                contentType: query.contentType,
                sources: [{ filterValues: query.filterValues, role: 'include' }],
              });
              return { providerId, name, count: set.length };
            })
          );

          return {
            count: instances.reduce((sum, i) => sum + i.count, 0),
            instances,
          };
        },
      }),
    ],
  };
}
