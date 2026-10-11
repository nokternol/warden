export type SetupState = 'no-providers' | 'complete';

export interface SetupFacts {
  providerCount: number;
}

export function setupState(facts: SetupFacts): SetupState {
  return facts.providerCount === 0 ? 'no-providers' : 'complete';
}
