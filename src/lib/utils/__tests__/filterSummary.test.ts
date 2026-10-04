import { summarizeFilters } from '@app/lib/utils/filterSummary';
import { describe, expect, it } from 'vitest';

describe('summarizeFilters', () => {
  it('labels plexAddedDaysAgoGte/Lte instead of falling back to the raw key', () => {
    const parts = summarizeFilters([
      { ruleKey: 'plexAddedDaysAgoGte', value: 5 },
      { ruleKey: 'plexAddedDaysAgoLte', value: 15 },
    ]);

    expect(parts).toEqual(['Plex added ≥ days: 5', 'Plex added ≤ days: 15']);
  });

  it('lists the ids of an instance-scoped value', () => {
    const parts = summarizeFilters([{ ruleKey: 'tagIds', value: { providerId: 3, ids: [1, 2] } }]);

    expect(parts).toEqual(['Tags: 1,2']);
  });
});
