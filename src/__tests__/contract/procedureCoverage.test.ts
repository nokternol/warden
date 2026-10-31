import { contract } from '@contract/index';
import { isContractProcedure } from '@orpc/contract';
import { clientSources } from '@tests/helpers/clientSources';
import { describe, expect, it } from 'vitest';

/**
 * Procedures no client code calls, each with the reason. Anything else the
 * contract declares must be called from src/, so a feature can't be added to
 * the server alone.
 */
const UNCALLED_BY_CLIENT: Record<string, string> = {
  'system.health': 'server-only: the container health check probes it',
  'appSettings.get': 'deferred, no client consumer yet (plan L2)',
  'appSettings.update': 'deferred, no client consumer yet (plan L2)',
  'providers.metadata': 'deferred, no client consumer yet (plan L2)',
};

/** Every procedure's dotted path in the contract, e.g. `automations.list`. */
function procedurePaths(node: object, prefix: string[] = []): string[] {
  return Object.entries(node).flatMap(([key, child]) =>
    isContractProcedure(child)
      ? [[...prefix, key].join('.')]
      : procedurePaths(child as object, [...prefix, key])
  );
}

describe('contract procedure coverage', () => {
  it('every contract procedure is called from src/ unless it is listed as uncalled', () => {
    const source = clientSources().join('\n');
    const uncalled = procedurePaths(contract).filter(
      (p) => !new RegExp(`\\.${p.replaceAll('.', '\\.')}\\b`).test(source)
    );

    expect(uncalled.filter((p) => !(p in UNCALLED_BY_CLIENT))).toEqual([]);
  });
});
