import { api } from '@server/kernel/api';
import type { TmdbService } from '@server/modules/providers';

export function createBackdropsProcedures({ tmdbService }: { tmdbService: TmdbService }) {
  return {
    backdrops: api.media.backdrops.handler(async () => {
      const backdrops = await tmdbService.getTrendingBackdrops();
      return backdrops.map((path) => tmdbService.getImageUrl(path, 'original'));
    }),
  };
}
