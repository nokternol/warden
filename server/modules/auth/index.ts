/**
 * Public interface of the auth module.
 *
 * Everything the HTTP layer and other modules may consume from the auth
 * domain is exported here, chosen export by export — this is a designed
 * contract, not a barrel. Anything not exported is module-private, and a
 * growing export list is a design smell to challenge.
 */

// HTTP surface — the auth procedures of the API contract.
export { createAuthProcedures } from './auth.procedures';

// The session store — constructed directly by server/index.ts at startup,
// before the container exists, so it's a value export rather than
// container-only like authService.
export { DrizzleStore } from './drizzleStore';

// Container contribution — the app builder composes Cradle from this slice
// and calls the registration; the class stays module-private unless
// consumers construct it directly.
export { registerAuthDependencies } from './auth.registrations';
export type { AuthCradle } from './auth.registrations';
