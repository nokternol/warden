import { api } from '@app/lib/api/client';
import type { MediaFilters } from '@app/types/media';
import type { ManagedMovie } from '@contract/media';
import { usePaginatedMedia } from './usePaginatedMedia';

export type { MediaFilters, ManagedMovie };

export const useMovies = (filters?: MediaFilters) =>
  usePaginatedMedia(api.media.browse.movie, filters);
