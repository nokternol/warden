export type SetupState = 'no-providers' | 'no-source' | 'no-query' | 'complete';

export interface SetupFacts {
  providerCount: number;
  hasSource?: boolean;
  queryCount?: number;
}

export function setupState(facts: SetupFacts): SetupState {
  if (facts.providerCount === 0) return 'no-providers';
  if (facts.hasSource === false) return 'no-source';
  if (facts.queryCount === 0) return 'no-query';
  return 'complete';
}
