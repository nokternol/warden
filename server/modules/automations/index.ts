/**
 * Public interface of the automations module.
 *
 * Everything the HTTP layer and other modules may consume from the
 * automations domain is exported here, chosen export by export — this is a
 * designed contract, not a barrel. Anything not exported is module-private,
 * and a growing export list is a design smell to challenge.
 *
 * Automations *use* media queries; the logic stays separate — the join is
 * the `automation_query_sources` database relation plus the mediaQueries
 * public interface, never query internals. No other module currently
 * consumes automations' own DTOs, so none are exported yet; add them here
 * deliberately if that changes.
 */

// HTTP surface — the automations procedures of the API contract.
export { createAutomationProcedures } from './automations.procedures';

// Container contribution — the app builder composes Cradle from this slice
// and calls the registration; classes registered here stay module-private
// unless consumers construct them directly.
export { registerAutomationsDependencies } from './automations.registrations';
export type { AutomationsCradle } from './automations.registrations';
