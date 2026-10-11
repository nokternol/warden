export type SetupState = 'no-providers' | 'no-source' | 'no-query' | 'no-automation' | 'complete';

export interface SetupFacts {
  providerCount: number;
  hasSource?: boolean;
  queryCount?: number;
  automationCount?: number;
}

export function setupState(facts: SetupFacts): SetupState {
  if (facts.providerCount === 0) return 'no-providers';
  if (facts.hasSource === false) return 'no-source';
  if (facts.queryCount === 0) return 'no-query';
  if (facts.automationCount === 0) return 'no-automation';
  return 'complete';
}
