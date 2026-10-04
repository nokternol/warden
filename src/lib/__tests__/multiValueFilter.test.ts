import { parseIds, parseStrings, toCsv } from '@app/lib/multiValueFilter';
import { describe, expect, it } from 'vitest';

describe('multi-value filter codec', () => {
  it('reads a comma-separated id list back as ids', () => {
    expect(parseIds('1,2,30')).toEqual([1, 2, 30]);
  });

  it('reads nothing from an absent or empty value', () => {
    expect(parseIds(undefined)).toEqual([]);
    expect(parseIds('')).toEqual([]);
    expect(parseStrings(undefined)).toEqual([]);
    expect(parseStrings('')).toEqual([]);
  });

  it('drops ids that are not positive integers', () => {
    expect(parseIds('1, x ,0,-4,2.5,7')).toEqual([1, 7]);
  });

  it('reads trimmed, non-empty strings', () => {
    expect(parseStrings('Drama, Sci-Fi ,,Action')).toEqual(['Drama', 'Sci-Fi', 'Action']);
  });

  it('writes a selection as a comma-separated value, and an empty selection as undefined', () => {
    expect(toCsv([1, 2])).toBe('1,2');
    expect(toCsv(['Drama', 'Sci-Fi'])).toBe('Drama,Sci-Fi');
    expect(toCsv([])).toBeUndefined();
  });
});
