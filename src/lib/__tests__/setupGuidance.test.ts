import { setupState } from '@app/lib/setupGuidance';
import { describe, expect, it } from 'vitest';

describe('setupState', () => {
  it('asks for a source when providers exist but none is a configured source', () => {
    expect(setupState({ providerCount: 2, hasSource: false })).toBe('no-source');
  });
});
