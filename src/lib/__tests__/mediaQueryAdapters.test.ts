import type { FilterState } from '@app/hooks/useMediaFilters';
import { toFilters } from '@app/lib/mediaQueryAdapters';
import type { MediaRuleDescriptor } from '@contract/media';
import { describe, expect, it } from 'vitest';

describe('toFilters', () => {
  const rule = (key: string, instanceScoped = false) =>
    ({
      key,
      label: key,
      contentTypes: ['movie'],
      dataType: instanceScoped ? 'instance-ids' : 'boolean',
      ...(instanceScoped ? { instanceScoped } : {}),
    }) as MediaRuleDescriptor;
  const rules = [rule('tagIds', true), rule('qualityProfileIds', true), rule('hasFile')];

  const state = (overrides: Partial<FilterState>): FilterState => ({
    shared: {},
    movie: {},
    series: {},
    movieQualifiers: {},
    seriesQualifiers: {},
    movieSort: 'title_asc',
    seriesSort: 'title_asc',
    ...overrides,
  });

  it('puts the qualifying instance inside an instance-scoped value', () => {
    const filters = toFilters(
      state({ movie: { tagIds: '1,2' }, movieQualifiers: { tagIds: 3 } }),
      'movie',
      rules
    );

    expect(filters).toEqual([{ ruleKey: 'tagIds', value: { providerId: 3, ids: [1, 2] } }]);
  });

  it('leaves an unqualified instance-scoped value as just its ids', () => {
    const filters = toFilters(state({ movie: { qualityProfileIds: '5' } }), 'movie', rules);

    expect(filters).toEqual([{ ruleKey: 'qualityProfileIds', value: { ids: [5] } }]);
  });

  it('keeps other rules as a plain rule key and value', () => {
    const filters = toFilters(state({ movie: { hasFile: true } }), 'movie', rules);

    expect(filters).toEqual([{ ruleKey: 'hasFile', value: true }]);
  });

  it('leaves out rules with no value', () => {
    const filters = toFilters(
      { shared: { title: undefined }, movie: { hasFile: true }, series: {} },
      'movie',
      rules
    );

    expect(filters).toEqual([{ ruleKey: 'hasFile', value: true }]);
  });

  it('passes range values through untouched', () => {
    const filters = toFilters(
      state({ shared: { year: { min: 2000, max: 2020 } } }),
      'movie',
      rules
    );

    expect(filters).toEqual([{ ruleKey: 'year', value: { min: 2000, max: 2020 } }]);
  });
});
