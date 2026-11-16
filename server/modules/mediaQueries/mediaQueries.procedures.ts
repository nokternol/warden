import { api } from '@server/kernel/api';
import type { LibraryCache, MediaQueryEngine } from '@server/modules/media';
import type { MediaQueryService } from './mediaQueryService';

interface Cradle {
  mediaQueryService: MediaQueryService;
  mediaQueryEngine: MediaQueryEngine;
  libraryCache: Pick<LibraryCache, 'contentOf'>;
}

export function createMediaQueryProcedures(cradle: Cradle) {
  const { mediaQueryService, mediaQueryEngine, libraryCache } = cradle;

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
      const { copies, records } = await libraryCache.contentOf(query.contentType);
      const selected = mediaQueryEngine.select(copies, {
        contentType: query.contentType,
        include: [query.filters],
        exclude: [],
      });
      return { count: selected.length, records };
    }),
  });
}
