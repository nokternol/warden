import type { FilterState } from '@app/hooks/useMediaFilters';
import { toBrowseParams, toSaveValues } from '@app/lib/mediaQueryAdapters';
import type { MediaRuleDescriptor } from '@contract/media';
import { describe, expect, it } from 'vitest';

describe('toBrowseParams', () => {
  it('maps the shared plexAddedDaysAgo range onto plexAddedDaysAgoGte/Lte', () => {
    const buckets = {
      shared: { plexAddedDaysAgo: { min: 5, max: 15 } },
      movie: {},
      series: {},
    };

    const params = toBrowseParams(buckets, 'movie');

    expect(params.plexAddedDaysAgoGte).toBe(5);
    expect(params.plexAddedDaysAgoLte).toBe(15);
  });
});

describe('toSaveValues', () => {
  const rule = (key: string, instanceScoped = false) =>
    ({
      key,
      label: key,
      contentTypes: ['movie'],
      dataType: instanceScoped ? 'csv-ids' : 'boolean',
      providers: [],
      required: false,
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
    const filters = toSaveValues(
      state({ movie: { tagIds: '1,2' }, movieQualifiers: { tagIds: 3 } }),
      'movie',
      rules
    );

    expect(filters).toEqual([{ ruleKey: 'tagIds', value: { providerId: 3, ids: [1, 2] } }]);
  });

  it('leaves an unqualified instance-scoped value as just its ids', () => {
    const filters = toSaveValues(state({ movie: { qualityProfileIds: '5' } }), 'movie', rules);

    expect(filters).toEqual([{ ruleKey: 'qualityProfileIds', value: { ids: [5] } }]);
  });

  it('keeps other rules as a plain rule key and value', () => {
    const filters = toSaveValues(state({ movie: { hasFile: true } }), 'movie', rules);

    expect(filters).toEqual([{ ruleKey: 'hasFile', value: true }]);
  });
});
