export type SetupState =
  | 'unknown'
  | 'no-providers'
  | 'no-source'
  | 'no-query'
  | 'no-automation'
  | 'complete';

/** What the page knows about setup so far; a fact that has not resolved is `undefined`. */
export interface SetupFacts {
  providerCount: number | undefined;
  hasSource: boolean | undefined;
  queryCount: number | undefined;
  automationCount: number | undefined;
}

export function setupState(facts: SetupFacts): SetupState {
  const { providerCount, hasSource, queryCount, automationCount } = facts;
  if (
    providerCount === undefined ||
    hasSource === undefined ||
    queryCount === undefined ||
    automationCount === undefined
  ) {
    return 'unknown';
  }
  if (providerCount === 0) return 'no-providers';
  if (!hasSource) return 'no-source';
  if (queryCount === 0) return 'no-query';
  if (automationCount === 0) return 'no-automation';
  return 'complete';
}
