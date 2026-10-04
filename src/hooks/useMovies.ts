import { api } from '@app/lib/api/client';
import type { ManagedMovie } from '@contract/media';
import { type BrowseRequest, usePaginatedMedia } from './usePaginatedMedia';

export type { BrowseRequest, ManagedMovie };

export const useMovies = (request?: BrowseRequest) =>
  usePaginatedMedia(api.media.browse.movie, request);
