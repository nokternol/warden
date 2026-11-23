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

// The canonical item shape a library copy carries: its catalog record and reported facts.
export type { MediaItem } from './mediaItem';
export type { NormalizedMovie } from './movie';
export type { NormalizedSeries } from './series';

// Per-provider DTO → canonical shape translation.
export { normalizeRadarrMovie, normalizeSonarrSeries } from './normalizeMedia';

// The in-memory copy of the library every feature reads, and the records saying how current it is.
export { recordsFor, reporterReliability } from './libraryCache';
export type { Library, LibraryCache, LibraryCopy, ReporterReliability } from './libraryCache';

// Owner-type policy: which provider type owns each content type, and its
// active instances.
export { sourceOwnership } from './mediaSourceFactory';
export type { MediaSourceDescriptor } from './mediaSourceFactory';

// Non-source actuator addressing: a copy's title in the actuator's own id space, from the ids
// the catalog refresh linked.
export { actuatorIdOf, isAddressedActuator } from './actuatorIdResolver';

// Enrichment's data access: each reporter's stored facts.
export { EnrichmentQueries } from './enrichment/enrichment.queries';

// The rule vocabulary and its client-facing projection.
export type {
  Filter,
  FilterValue,
  InstanceScopedValue,
  MediaRule,
  MediaRuleDescriptor,
  RangeValue,
} from './ruleRegistry';
export { MEDIA_RULES, getRule, suppliersOf, toDescriptor } from './ruleRegistry';

// Filter readiness — the one place a filter list's findings are raised, worded and given a
// consequence. Facts are read once per request; the judging and answers are pure.
export { automationAnswer, filterAnswer, findingsFor } from './filterReadiness';
export type {
  AutomationAnswer,
  AutomationBlocks,
  FilterAnswer,
  FilterList,
  FilterReadiness,
  ReadinessInputs,
} from './filterReadiness';

// The one evaluation of the catalog: which titles a set of conditions selects among copies.
export type { MediaQueryEngine } from './mediaQueryEngine';

// Enrichment — the job that stores each provider's facts.
export { EnrichmentJobFactory } from './enrichmentJobFactory';
export type { EnrichmentJobFactoryDeps } from './enrichmentJobFactory';
