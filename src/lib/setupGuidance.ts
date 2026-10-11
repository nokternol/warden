export type SetupState = 'no-providers' | 'no-source' | 'complete';

export interface SetupFacts {
  providerCount: number;
  hasSource?: boolean;
}

export function setupState(facts: SetupFacts): SetupState {
  if (facts.providerCount === 0) return 'no-providers';
  if (facts.hasSource === false) return 'no-source';
  return 'complete';
}
