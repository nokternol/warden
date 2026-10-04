import { type FilterValue, isInstanceScopedValue, isRangeValue } from '@contract/schemas';
import { describe, expect, it } from 'vitest';

const range: FilterValue = { min: 1 };
const emptyRange: FilterValue = {};
const instanceScoped: FilterValue = { providerId: 1, ids: [2] };
const unqualified: FilterValue = { ids: [] };
const scalars: FilterValue[] = ['a', 1, true];

describe('filter value guards', () => {
  it('isInstanceScopedValue is true only for a value carrying ids', () => {
    expect([instanceScoped, unqualified].every(isInstanceScopedValue)).toBe(true);
    expect([range, emptyRange, ...scalars].some(isInstanceScopedValue)).toBe(false);
  });

  it('isRangeValue is true only for an object without ids', () => {
    expect([range, emptyRange].every(isRangeValue)).toBe(true);
    expect([instanceScoped, unqualified, ...scalars].some(isRangeValue)).toBe(false);
  });
});
