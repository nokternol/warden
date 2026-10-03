/**
 * Public interface of the system module.
 *
 * Everything the HTTP layer and other modules may consume from the system
 * domain is exported here, chosen export by export — this is a designed
 * contract, not a barrel. Anything not exported is module-private, and a
 * growing export list is a design smell to challenge.
 *
 * Merges two processes that shared the `health` name before this module
 * existed: HTTP liveness (`GET /health`) and system self-healing
 * (`ensureSystemJobs`, `failedStateMiddleware`) — see the fracture ledger.
 */

// HTTP surface — the system procedures of the API contract.
export { createSystemProcedures } from './system.procedures';

// Startup-time self-healing — called directly by server/index.ts before the
// container exists, so these are value exports rather than container-only.
export { systemHealthCheck } from './systemHealthCheck';
export { failedStateMiddleware } from './failedStateMiddleware';

// Container contribution — the app builder composes Cradle from this slice
// and calls the registration; the class stays module-private unless
// consumers construct it directly.
export { registerSystemDependencies } from './system.registrations';
export type { SystemCradle } from './system.registrations';

// The job-factory contracts system's dispatcher depends on. Media and
// providers implement these to be runnable as system tasks — the dependent
// (system) defines the abstraction, per dependency inversion, rather than
// depending on the concrete factory classes.
export type { EnrichmentJobFactoryLike, IdentityJobFactoryLike } from './systemTaskRunner';
