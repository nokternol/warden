import { setupState } from '@app/lib/setupGuidance';
import { describe, expect, it } from 'vitest';

describe('setupState', () => {
  it('asks for a provider when none is configured', () => {
    expect(
      setupState({ providerCount: 0, hasSource: false, queryCount: 0, automationCount: 0 })
    ).toBe('no-providers');
  });

  it('asks for a source when providers exist but none is a configured source', () => {
    expect(
      setupState({ providerCount: 2, hasSource: false, queryCount: 0, automationCount: 0 })
    ).toBe('no-source');
  });

  it('asks for a query once a source is configured and none is saved', () => {
    expect(
      setupState({ providerCount: 1, hasSource: true, queryCount: 0, automationCount: 0 })
    ).toBe('no-query');
  });

  it('asks for an automation once a source and a query exist', () => {
    expect(
      setupState({ providerCount: 1, hasSource: true, queryCount: 1, automationCount: 0 })
    ).toBe('no-automation');
  });

  it('has nothing left to ask once a source, a query and an automation exist', () => {
    expect(
      setupState({ providerCount: 1, hasSource: true, queryCount: 1, automationCount: 1 })
    ).toBe('complete');
  });

  it('stays unknown while any fact is still unresolved', () => {
    expect(
      setupState({
        providerCount: 1,
        hasSource: true,
        queryCount: 1,
        automationCount: undefined,
      })
    ).toBe('unknown');
  });
});
