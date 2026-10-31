import { resolveNavItems } from '@app/lib/navigation';
import { scope } from '@contract/scope';
import { describe, expect, it } from 'vitest';

function offered(declared = scope) {
  const { items, bottomItems } = resolveNavItems('/media', declared);
  return [...items, ...bottomItems];
}

describe('the navigation', () => {
  it('offers exactly the in-scope pages', () => {
    expect(offered().map(({ label }) => label)).toEqual([
      'Media',
      'Automations',
      'Runs',
      'Providers',
      'System',
    ]);
  });

  it('keeps the Providers entry at /settings', () => {
    expect(offered().find(({ label }) => label === 'Providers')?.href).toBe('/settings');
  });

  it('offers a page again once it has no entry in the declaration', () => {
    const declared = {
      deferred: {
        ...scope.deferred,
        pages: scope.deferred.pages.filter((page) => page !== '/search'),
      },
    };

    expect(offered(declared).map(({ label }) => label)).toContain('Search');
  });
});
