import { setupState } from '@app/lib/setupGuidance';
import { describe, expect, it } from 'vitest';

describe('setupState', () => {
  it('asks for a source when providers exist but none is a configured source', () => {
    expect(setupState({ providerCount: 2, hasSource: false })).toBe('no-source');
  });

  it('asks for a query once a source is configured and none is saved', () => {
    expect(setupState({ providerCount: 1, hasSource: true, queryCount: 0 })).toBe('no-query');
  });
});
