import { api } from '@server/kernel/api';
import {
  type MediaQueryEngine,
  type SourceReadCache,
  rowsSourceFor,
  titleKeyOf,
} from '@server/modules/media';
import type { MediaQueryService } from './mediaQueryService';

interface Cradle {
  mediaQueryService: MediaQueryService;
  mediaQueryEngine: MediaQueryEngine;
  sourceReadCache: Pick<SourceReadCache, 'readAll'>;
}

export function createMediaQueryProcedures(cradle: Cradle) {
  const { mediaQueryService, mediaQueryEngine, sourceReadCache } = cradle;

  return api.mediaQueries.router({
    list: api.mediaQueries.list.handler(async () => mediaQueryService.list()),

    create: api.mediaQueries.create.handler(async ({ input }) =>
      mediaQueryService.create({
        name: input.name,
        contentType: input.contentType,
        filters: input.filters,
      })
    ),

    delete: api.mediaQueries.delete.handler(async ({ input }) => {
      await mediaQueryService.delete(input.id);
      return null;
    }),

    preview: api.mediaQueries.preview.handler(async ({ input }) => {
      const query = await mediaQueryService.getById(input.id);
      const reads = await sourceReadCache.readAll(query.contentType);

      const matched = await Promise.all(
        reads.map((read) =>
          mediaQueryEngine.evaluate({
            source: rowsSourceFor(query.contentType, read),
            contentType: query.contentType,
            clauses: [{ filters: query.filters, role: 'include' }],
          })
        )
      );
      const titles = new Set(matched.flat().map((item) => titleKeyOf(item, query.contentType)));
      return { count: titles.size };
    }),
  });
}
