import { toBrowseParams } from '@app/lib/mediaQueryAdapters';
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
