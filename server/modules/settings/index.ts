/**
 * Public interface of the settings module.
 *
 * Everything the HTTP layer and other modules may consume from the settings
 * domain is exported here, chosen export by export — this is a designed
 * contract, not a barrel. Anything not exported is module-private, and a
 * growing export list is a design smell to challenge.
 *
 * Settings is transport-only: it has no domain logic or persisted state of
 * its own, consuming `providerSettingsService` from providers.
 */

// HTTP surface — this module's procedures of the API contract.
export { createProviderSettingsProcedures } from './settings.procedures';
