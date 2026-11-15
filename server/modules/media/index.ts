/**
 * Public interface of the media module.
 *
 * Everything the HTTP layer and other modules may consume from the media
 * domain is exported here, chosen export by export — this is a designed
 * contract, not a barrel. Anything not exported is module-private, and a
 * growing export list is a design smell to challenge.
 */

// HTTP surface — the media procedures of the API contract. Absorbs the
// rules, backdrops, and search route-drawn modules; each keeps its own URL.
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

// A copy's collision-free key across instances, for matching evaluated items back to copies.
export { itemKey } from './mediaItem';
export type { NormalizedMovie } from './movie';
export type { NormalizedSeries } from './series';

// Per-provider DTO → canonical shape translation.
export { normalizeRadarrMovie, normalizeSonarrSeries } from './normalizeMedia';

// The read role the query engine evaluates over.
export type { MediaSource } from './mediaSource';

// The in-memory copy of the library every feature reads, and the records saying how current it is.
export { copiesSource, recordsFor } from './libraryCache';
export type { Library, LibraryCache, LibraryCopy } from './libraryCache';

// Owner-type policy: which provider type owns each content type, and its
// active instances.
export { sourceOwnership } from './mediaSourceFactory';
export type { MediaSourceDescriptor } from './mediaSourceFactory';

// Non-source actuator addressing: a copy's title in the actuator's own id space, from the ids
// the catalog refresh linked.
export {
  ADDRESS_COLUMN_BY_TYPE,
  MEDIA_SERVER_BY_COLUMN,
  actuatorIdOf,
  isAddressedActuator,
} from './actuatorIdResolver';

// Enrichment roles and the adapters that bind providers' native connections
// to them.
export { EnrichmentQueries } from './enrichment/enrichment.queries';
export type { EnrichableField, EnrichmentResult, MediaEnricher } from './enrichment/enricher';
export {
  seerrEnricher,
  plexEnricher,
  tautulliEnricher,
  tmdbEnricher,
} from './enrichment/enricherAdapters';

// The rule vocabulary and its client-facing projection.
export type {
  Filter,
  FilterValue,
  InstanceScopedValue,
  MediaRule,
  MediaRuleDescriptor,
  RangeValue,
} from './ruleRegistry';
export { MEDIA_RULES, getRule, toDescriptor } from './ruleRegistry';

// Filter readiness — the one place a filter list's findings are raised, worded and given a
// consequence. Facts are read once per request; the judging and answers are pure.
export { automationAnswer, filterAnswer, findingsFor } from './filterReadiness';
export type {
  AutomationAnswer,
  AutomationBlocks,
  AutomationProvider,
  EnrichmentOutcomeSource,
  FilterAnswer,
  FilterList,
  FilterReadiness,
  ReadinessFacts,
} from './filterReadiness';

// The query engine — matches a MediaSource against a MediaQuerySpec.
export { MediaQueryEngine, matchItems } from './mediaQueryEngine';
export type { MediaQuery, MediaQueryClause, MediaQuerySpec } from './mediaQueryEngine';

// Enrichment — the job that stores each provider's facts.
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
// and the cache the composition root derives providers/gating from.
export { fieldsByProviderType, ActiveFieldSetCache } from './activeFieldSet';
export type { EnrichmentFields } from './mediaFieldProvider';
