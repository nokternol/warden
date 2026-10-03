import { api } from '@server/kernel/api';
import type { MediaQueryEngine, MediaSourceFactory } from '@server/modules/media';
import type { MediaQueryService } from './mediaQueryService';

interface Cradle {
  mediaQueryService: MediaQueryService;
  mediaSourceFactory: MediaSourceFactory;
  mediaQueryEngine: MediaQueryEngine;
}

export function createMediaQueryProcedures(cradle: Cradle) {
  const { mediaQueryService, mediaSourceFactory, mediaQueryEngine } = cradle;

  return api.mediaQueries.router({
    list: api.mediaQueries.list.handler(async () => mediaQueryService.list()),

    create: api.mediaQueries.create.handler(async ({ input }) =>
      mediaQueryService.create({
        name: input.name,
        contentType: input.contentType,
        filterValues: input.filterValues,
      })
    ),

    delete: api.mediaQueries.delete.handler(async ({ input }) => {
      await mediaQueryService.delete(input.id);
      return null;
    }),

    preview: api.mediaQueries.preview.handler(async ({ input }) => {
      const query = await mediaQueryService.getById(input.id);
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
    }),
  });
}
