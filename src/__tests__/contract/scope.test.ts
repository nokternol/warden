import { existsSync } from 'node:fs';
import path from 'node:path';
import { contract } from '@contract/index';
import { scope } from '@contract/scope';
import { isContractProcedure } from '@orpc/contract';
import { clientSources } from '@tests/helpers/clientSources';
import { describe, expect, it } from 'vitest';

const PAGES_ROOT = path.resolve(__dirname, '../../pages');

/** Every route path the contract declares. */
function routePaths(node: object): (string | undefined)[] {
  return Object.values(node).flatMap((child) =>
    isContractProcedure(child) ? [child['~orpc'].route.path] : routePaths(child as object)
  );
}

/**
 * The declaration's entries are plain strings, so nothing else notices when the
 * surface one names is renamed or removed and the entry goes stale.
 */
describe('every entry in the scope declaration names something that exists', () => {
  it('a deferred procedure is a route path in the contract', () => {
    const declared = routePaths(contract);

    expect(scope.deferred.procedures.filter((entry) => !declared.includes(entry))).toEqual([]);
  });

  it('a deferred page has a page file', () => {
    const missing = scope.deferred.pages.filter(
      (page) => !existsSync(path.join(PAGES_ROOT, page, 'index.page.tsx'))
    );

    expect(missing).toEqual([]);
  });

  it('a deferred section has a guard in the client', () => {
    const source = clientSources().join('\n');
    const unguarded = scope.deferred.sections.filter(
      (id) => !source.includes(`isOfferedSection(scope, '${id}')`)
    );

    expect(unguarded).toEqual([]);
  });
});
