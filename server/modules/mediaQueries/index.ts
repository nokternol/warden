/**
 * Public interface of the mediaQueries module.
 *
 * Everything the HTTP layer and other modules may consume from the
 * mediaQueries domain is exported here, chosen export by export — this is a
 * designed contract, not a barrel. Anything not exported is module-private,
 * and a growing export list is a design smell to challenge.
 *
 * This module owns the *construction* of filters over enriched source data —
 * `MediaQueryRecord` CRUD, filter-value persistence, query health —
 * deliberately not grouped with automations, which only ever consume this
 * interface and never reach into query internals.
 */

// HTTP surface — the mediaQueries procedures of the API contract.
export { createMediaQueryProcedures } from './mediaQueries.procedures';

// Container contribution — the app builder composes Cradle from this slice
// and calls the registration; the class stays module-private unless
// consumers construct it directly.
export { registerMediaQueriesDependencies } from './mediaQueries.registrations';
export type { MediaQueriesCradle } from './mediaQueries.registrations';

// The service and the shapes it produces.
export type {
  MediaQueryRecord,
  MediaQueryService,
  MediaQueryValue,
  ProviderStatus,
  QueryHealth,
} from './mediaQueryService';
