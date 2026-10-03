import { describe, expect, it } from 'vitest';
import * as databaseSchema from '../../database/schema';

describe('mediaQueries schema', () => {
  it('has contentType column (not mediaType, not filters)', async () => {
    const schema = databaseSchema;
    const cols = Object.keys(schema.mediaQueries);
    expect(cols).toContain('contentType');
    expect(cols).not.toContain('mediaType');
    expect(cols).not.toContain('filters');
  });
});

describe('mediaQueryFilterValues schema', () => {
  it('is exported and has mediaQueryId, filterKey, value columns', async () => {
    const schema = databaseSchema;
    expect((schema as Record<string, unknown>).mediaQueryFilterValues).toBeDefined();
    const cols = Object.keys((schema as Record<string, unknown>).mediaQueryFilterValues as object);
    expect(cols).toContain('mediaQueryId');
    expect(cols).toContain('filterKey');
    expect(cols).toContain('value');
  });
});
