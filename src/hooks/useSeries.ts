import { api } from '@app/lib/api/client';
import type { ManagedSeries } from '@contract/media';
import { type BrowseRequest, usePaginatedMedia } from './usePaginatedMedia';

export type { BrowseRequest, ManagedSeries };

export const useSeries = (request?: BrowseRequest) =>
  usePaginatedMedia(api.media.browse.series, request);
