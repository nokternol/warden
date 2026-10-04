import type { ProviderType } from './schemas';

/**
 * What Warden does not expose. Deferred features stay in the codebase,
 * compiled and tested; every path to them is blocked by consulting this one
 * declaration, so un-deferring a feature is removing its entry here.
 */
export interface Scope {
  deferred: {
    /** Provider types that cannot be configured and are left out of the type catalogue. */
    providerTypes: readonly ProviderType[];
    /**
     * Rule keys that are never served, because each has no control or no producer of
     * an offered type. /api/rules leaves them out by construction, and a test keeps
     * this list equal to that set, so un-deferring a provider type shows which of
     * these rules it brings back.
     */
    rules: readonly string[];
  };
}

export const scope: Scope = {
  deferred: {
    providerTypes: [
      // Unbuildable through ProviderFactory; the request manager is offered as OVERSEERR.
      'SEERR',
      // Not in the verification stack (decision 9).
      'TMDB',
      // Feeds only the deferred ratings path.
      'OMDB',
      // Not buildable through ProviderFactory: its API key is lost.
      'TVMAZE',
    ],
    rules: [
      // A multi-value rule with no lookup to choose values from, so it has no control.
      'certification',
      // Produced only by TMDB.
      'tmdbStatus',
    ],
  },
};

/** Whether `type` can be configured: it is not a deferred provider type. */
export function isOfferedProviderType(type: ProviderType): boolean {
  return !scope.deferred.providerTypes.includes(type);
}
