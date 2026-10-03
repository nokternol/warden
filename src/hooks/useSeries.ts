import { api } from '@app/lib/api/client';
import type { MediaFilters } from '@app/types/media';
import type { ManagedSeries } from '@contract/media';
import { usePaginatedMedia } from './usePaginatedMedia';

export type { MediaFilters, ManagedSeries };

export const useSeries = (filters?: MediaFilters) => usePaginatedMedia(api.media.series, filters);
