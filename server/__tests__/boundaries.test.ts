import path from 'node:path';
import { type IForbiddenRuleType, cruise } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

const config = require('../../.dependency-cruiser.cjs') as { forbidden: IForbiddenRuleType[] };

const fixtureRoot = path.join(__dirname, 'fixtures/boundary');

/** Cruises the fixture tree with the repo's own boundary rules. */
async function violationsIn(root: string): Promise<string[]> {
  const result = await cruise(['src', 'server', 'contract'], {
    baseDir: root,
    validate: true,
    ruleSet: { forbidden: config.forbidden },
    tsPreCompilationDeps: true,
  });
  if (typeof result.output === 'string') throw new Error('expected a JSON cruise result');
  return result.output.summary.violations.map((v) => `${v.rule.name}: ${v.from} → ${v.to}`);
}

describe('client/server boundary', () => {
  it('fails an import from src/ into server/, from server/ into src/, and from contract/ into either', async () => {
    const violations = await violationsIn(fixtureRoot);

    expect(violations).toEqual(
      expect.arrayContaining([
        'no-src-to-server: src/importsServer.ts → server/serverThing.ts',
        'no-server-to-src: server/importsClient.ts → src/clientThing.ts',
        'contract-depends-on-nothing-local: contract/importsClient.ts → src/clientThing.ts',
      ])
    );
  });

  it('fails a contract import of any package other than zod and @orpc/contract', async () => {
    const violations = await violationsIn(fixtureRoot);

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^contract-imports-only-zod-and-orpc: contract\/importsExpress\.ts → .*express/
        ),
      ])
    );
  });
});
