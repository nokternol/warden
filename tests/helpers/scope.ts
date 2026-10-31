import { type Scope, scope } from '@contract/scope';

/**
 * The scope declaration with no API procedure deferred, for tests that exercise
 * deferred code through the HTTP layer.
 */
export const proceduresOffered: Scope = {
  deferred: { ...scope.deferred, procedures: [] },
};
