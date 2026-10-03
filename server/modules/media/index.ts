/**
 * Public interface of the media module.
 *
 * Everything the HTTP layer and other modules may consume from the media
 * domain is exported here, chosen export by export — this is a designed
 * contract, not a barrel. Anything not exported is module-private, and a
 * growing export list is a design smell to challenge.
 */

// HTTP surface — the media procedures of the API contract. Absorbs the
// filterFields, backdrops, and search route-drawn modules; each keeps its own URL.
export { createMediaProcedures } from './media.procedures';
export { createRulesProcedures } from './media.rules.procedures';
export { createBackdropsProcedures } from './media.backdrops.procedures';
export { createSearchProcedures } from './media.search.procedures';

// Container contribution — the app builder composes Cradle from this slice
// and calls the registration; classes registered here stay module-private
// unless consumers construct them directly.
export { registerMediaDependencies } from './media.registrations';
export type { MediaCradle } from './media.registrations';

// Canonical item shapes every provider role (Source, Enricher) operates on.
export type { MediaItem, MediaItemSet } from './mediaItem';
export type { NormalizedMovie } from './movie';
export type { NormalizedSeries } from './series';

// Per-provider DTO → canonical shape translation.
export { normalizeRadarrMovie, normalizeSonarrSeries } from './normalizeMedia';

// The read role a media-owning provider plays for the query engine, and the
// adapters that bind providers' native connections to it.
export type { MediaSource } from './mediaSource';
export { mediaSourceFor, radarrMediaSource, sonarrMediaSource } from './sourceAdapters';

// Owner-type policy: which provider type owns each content type, resolved to
// a bound MediaSource.
export { sourceOwnership } from './mediaSourceFactory';
export type { MediaSourceDescriptor, MediaSourceFactory } from './mediaSourceFactory';

// Non-source actuator addressing: query-matched items translated into the
// actuator's own id space through the identity graph.
export { resolveActuatorTargets } from './actuatorIdResolver';

// Run history: the recorded source copies a run's targeted items resolve to.
export { sourceCopyIds } from './sourceCopies';

// Enrichment roles and the adapters that bind providers' native connections
// to them.
export { EnrichmentQueries } from './enrichment/enrichment.queries';
export type { EnrichableField, EnrichmentResult, MediaEnricher } from './enrichment/enricher';
export {
  overseerrEnricher,
  plexEnricher,
  tautulliEnricher,
  tmdbEnricher,
} from './enrichment/enricherAdapters';

// The rule vocabulary and its client-facing projection.
export type {
  FilterValue,
  FilterValueEntry,
  MediaRule,
  MediaRuleDescriptor,
  MovieRangeRuleKey,
  RangeValue,
  SeriesRangeRuleKey,
} from './filterRegistry';
export { MEDIA_RULES, getRule, toDescriptor } from './filterRegistry';

// The query engine — matches a MediaSource against a MediaQuerySpec.
export { MediaQueryEngine, matchItems } from './mediaQueryEngine';
export type { MediaQuery, MediaQuerySource, MediaQuerySpec } from './mediaQueryEngine';

// Enrichment — the identity → media_enrichment materialization.
export { mergeEnrichment } from './enrichmentMerge';
export { EnrichmentJobFactory } from './enrichmentJobFactory';
export type { EnrichmentJobFactoryDeps } from './enrichmentJobFactory';

// Precedence — per-field resolution order for a contested field, and the
// fail-fast guardrail the composition root wires into
// ProviderSettingsService's precedenceCoverageValidator hook.
export {
  assertContestedFieldsCovered,
  contestedFieldPrecedence,
} from './enrichment/precedence';
export type { ContestedFieldPrecedence } from './enrichment/precedence';

// Field ownership — which provider type produces which EnrichmentFields key,
// and the cache the composition root derives sourceProviders/gating from.
export { fieldsByProviderType, ActiveFieldSetCache } from './activeFieldSet';
export type { EnrichmentFields } from './mediaFieldProvider';
