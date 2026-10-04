/**
 * Public interface of the appSettings module.
 *
 * Everything the HTTP layer and other modules may consume from the
 * appSettings domain is exported here, chosen export by export — this is a
 * designed contract, not a barrel. Anything not exported is module-private,
 * and a growing export list is a design smell to challenge.
 *
 * System-wide settings (region, primaryMediaServer) that don't belong to any
 * single provider — distinct from per-provider connection config, which the
 * providers module owns.
 */

// HTTP surface — the appSettings procedures of the API contract.
export { createAppSettingsProcedures } from './appSettings.procedures';

// Container contribution — the app builder composes Cradle from this slice
// and calls the registration; the class stays module-private unless
// consumers construct it directly.
export { registerAppSettingsDependencies } from './appSettings.registrations';
export type { AppSettingsCradle } from './appSettings.registrations';

// The service and the shape it produces.
export type { AppSettingsService, AppSettingsValue } from './appSettingsService';
