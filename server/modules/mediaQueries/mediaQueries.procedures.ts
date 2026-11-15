import { api } from '@server/kernel/api';
import {
  type LibraryCache,
  type MediaQueryEngine,
  copiesSource,
  recordsFor,
} from '@server/modules/media';
import type { MediaQueryService } from './mediaQueryService';

interface Cradle {
  mediaQueryService: MediaQueryService;
  mediaQueryEngine: MediaQueryEngine;
  libraryCache: Pick<LibraryCache, 'read'>;
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
      const library = await libraryCache.read();
      const copies = library.copies[query.contentType];
      const matched = new Set(
        (
          await mediaQueryEngine.evaluate({
            source: copiesSource(copies),
            contentType: query.contentType,
            clauses: [{ filters: query.filters, role: 'include' }],
          })
        ).map((item) => item._sourceIds.identity)
      );
      return { count: matched.size, records: recordsFor(library, query.contentType) };
    }),
  });
}
