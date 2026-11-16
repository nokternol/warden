import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { MetadataProviderType } from '@server/database/schema';
import { describe, expect, it } from 'vitest';

const MODULES = path.join(__dirname, '../../modules');

/**
 * Where a provider type may still be named. Each provider type is declared once, on its
 * connection class, and the providers module reads those declarations; everything else asks
 * for a capability. The facts files are #246's to move onto the declarations, and Search is
 * deleted by #238: their entries leave this list as those land.
 */
const MAY_NAME_PROVIDER_TYPES = [
  'providers/connections/',
  'providers/providerClasses.ts',
  'providers/providerFactory.ts',
  'providers/providerCatalogue.ts',
  'media/activeFieldSet.ts',
  'media/enrichmentJobFactory.ts',
  'media/enrichment/',
  'media/ruleRegistry.ts',
  'media/mediaFieldProvider.ts',
  'appSettings/appSettingsService.ts',
  'media/factsRefreshKinds.ts',
  'media/media.search.procedures.ts',
];

const TYPES = Object.values(MetadataProviderType).join('|');
const NAMES_A_TYPE = new RegExp(`MetadataProviderType\\.(${TYPES})\\b|['"\`](${TYPES})['"\`]`);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('provider type names', () => {
  it('are named only where provider types are declared, never by a caller', () => {
    const naming = sourceFiles(MODULES)
      .map((file) => path.relative(MODULES, file).split(path.sep).join('/'))
      .filter((file) => !MAY_NAME_PROVIDER_TYPES.some((allowed) => file.startsWith(allowed)))
      .filter((file) => NAMES_A_TYPE.test(readFileSync(path.join(MODULES, file), 'utf8')));

    expect(naming).toEqual([]);
  });
});
