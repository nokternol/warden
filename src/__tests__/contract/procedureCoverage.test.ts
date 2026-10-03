import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { contract } from '@contract/index';
import { isContractProcedure } from '@orpc/contract';
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

const SRC_ROOT = path.resolve(__dirname, '../..');

/** Every procedure's dotted path in the contract, e.g. `automations.list`. */
function procedurePaths(node: object, prefix: string[] = []): string[] {
  return Object.entries(node).flatMap(([key, child]) =>
    isContractProcedure(child)
      ? [[...prefix, key].join('.')]
      : procedurePaths(child as object, [...prefix, key])
  );
}

/** The source of every non-test, non-story client file. */
function clientSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : clientSources(full);
    if (!/\.tsx?$/.test(name) || /\.(stories|test)\.tsx?$/.test(name)) return [];
    return [readFileSync(full, 'utf8')];
  });
}

describe('contract procedure coverage', () => {
  it('every contract procedure is called from src/ unless it is listed as uncalled', () => {
    const source = clientSources(SRC_ROOT).join('\n');
    const uncalled = procedurePaths(contract).filter(
      (p) => !new RegExp(`\\.${p.replaceAll('.', '\\.')}\\b`).test(source)
    );

    expect(uncalled.filter((p) => !(p in UNCALLED_BY_CLIENT))).toEqual([]);
  });
});
