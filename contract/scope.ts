import type { ProviderType } from './schemas';

/** A task of one provider type; task ids are unique only within a type. */
export interface DeferredTask {
  providerType: ProviderType;
  taskId: string;
}

/**
 * The scope declaration: what Warden does not expose. Deferred features stay
 * in the codebase, compiled and tested; every path to them is blocked by
 * consulting this one declaration, so un-deferring a feature is removing its
 * entry here.
 */
export interface Scope {
  deferred: {
    /** Provider types that cannot be configured and are left out of the type catalogue. */
    providerTypes: readonly ProviderType[];
    /**
     * Rule keys that are not served. A test keeps this list equal to the rules with no
     * control or no producer of an offered type, so it is the complete inventory of
     * deferred rules: un-deferring a provider type shows which of these it brings back,
     * and removing an entry serves that rule once it has a live producer.
     */
    rules: readonly string[];
    /** Provider tasks that are not offered for enablement or automation. */
    tasks: readonly DeferredTask[];
    /**
     * Contract route paths whose procedures answer 404. An entry covers every HTTP method at
     * that path, so one entry defers a whole resource.
     */
    procedures: readonly string[];
  };
}

export const scope: Scope = {
  deferred: {
    providerTypes: [
      // Not in the stack the offered types are verified against.
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
    tasks: [],
    procedures: [
      // Ratings have two mechanisms; unifying them is post-MVP work.
      '/api/providers/ratings',
      // No MVP consumer.
      '/api/providers/metadata',
      // A second way to find a title beside the title filter.
      '/api/search/metadata',
      // No UI and no consumer yet: the input to the post-MVP precedence work.
      '/api/app-settings',
    ],
  },
};

/** Whether `type` can be configured: `declared` does not defer it. */
export function isOfferedProviderType(declared: Scope, type: ProviderType): boolean {
  return !declared.deferred.providerTypes.includes(type);
}

/** Whether the rule with `ruleKey` may be served: `declared` does not defer it. */
export function isOfferedRule(declared: Scope, ruleKey: string): boolean {
  return !declared.deferred.rules.includes(ruleKey);
}

/** Whether a provider type's task is offered for enablement and automation. */
export function isOfferedTask(
  declared: Scope,
  providerType: ProviderType,
  taskId: string
): boolean {
  return !declared.deferred.tasks.some(
    (task) => task.providerType === providerType && task.taskId === taskId
  );
}

/** Whether the procedure at contract route `path` answers: `declared` does not defer it. */
export function isOfferedProcedure(declared: Scope, path: string | undefined): boolean {
  return !declared.deferred.procedures.some((deferred) => deferred === path);
}
