import type { ReportedFactKey } from '../providers';
import type { MovieCatalogRecord, NormalizedMovie } from './movie';
import type { NormalizedSeries, SeriesCatalogRecord } from './series';

/** The canonical media model every provider role acts on — a movie or a series. */
export type MediaItem = NormalizedMovie | NormalizedSeries;

/**
 * Fails to compile when `R` holds a key that is also a reported fact. A catalog fact (the source
 * supplies it) and a reported fact (another provider reports it) are disjoint; a provider reporting
 * a catalog fact needs an owner decision on source-versus-reporter precedence first.
 */
export type NoReportedFacts<R> = Record<Extract<keyof R, ReportedFactKey>, never>;

const _catalogRecordsHoldNoReportedFacts: NoReportedFacts<
  MovieCatalogRecord & SeriesCatalogRecord
> = {};
