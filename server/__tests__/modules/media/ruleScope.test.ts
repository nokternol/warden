import { isOfferedProviderType, scope } from '@contract/scope';
import { MEDIA_RULES, type MediaRule, toDescriptor } from '@server/modules/media';
import { describe, expect, it } from 'vitest';

const RULES: readonly MediaRule[] = MEDIA_RULES;

/** A rule the server can never serve: it has no control, or no producer of an offered type. */
function cannotBeOffered(rule: MediaRule): boolean {
  return toDescriptor(rule) === undefined || !rule.providers.some(isOfferedProviderType);
}

describe('the scope declaration of deferred rules', () => {
  it('lists exactly the rules that have no control or no producer among offered types', () => {
    const unofferable = [...new Set(RULES.filter(cannotBeOffered).map((r) => r.key))].sort();

    expect([...scope.deferred.rules].sort()).toEqual(unofferable);
  });
});
