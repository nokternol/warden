import type { NormalizedMovie } from './movie';
import type { NormalizedSeries } from './series';

/** The canonical media model every provider role acts on — a movie or a series. */
export type MediaItem = NormalizedMovie | NormalizedSeries;
