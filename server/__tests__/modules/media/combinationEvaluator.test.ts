import { evaluateCombination } from '@server/modules/media/combinationEvaluator';
import { describe, expect, it } from 'vitest';

describe('evaluateCombination', () => {
  it('unions two include sets and deduplicates', () => {
    const result = evaluateCombination([
      { role: 'include', items: [1, 2, 3] },
      { role: 'include', items: [3, 4, 5] },
    ]);
    expect(result).toHaveLength(5);
    expect(new Set(result)).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('returns difference when one include and one exclude are given', () => {
    const result = evaluateCombination([
      { role: 'include', items: [1, 2, 3, 4] },
      { role: 'exclude', items: [3, 4] },
    ]);
    expect(new Set(result)).toEqual(new Set([1, 2]));
  });

  it('exclude wins when an item appears in both include and exclude', () => {
    const result = evaluateCombination([
      { role: 'include', items: [1, 2] },
      { role: 'exclude', items: [2] },
    ]);
    expect(result).not.toContain(2);
    expect(result).toContain(1);
  });

  it('returns empty when there are no included queries', () => {
    const result = evaluateCombination([{ role: 'exclude', items: [1, 2, 3] }]);
    expect(result).toEqual([]);
  });

  it('returns all includes when there are no excluded queries', () => {
    const result = evaluateCombination([{ role: 'include', items: [10, 20, 30] }]);
    expect(new Set(result)).toEqual(new Set([10, 20, 30]));
  });
});
