import { summarizeFilters } from '@app/lib/utils/filterSummary';
import type { MediaRuleDescriptor } from '@contract/media';
import { describe, expect, it } from 'vitest';

const base = { contentTypes: ['movie'] as const };
const RULES: MediaRuleDescriptor[] = [
  { ...base, key: 'year', label: 'Year', dataType: 'range' },
  { ...base, key: 'addedDaysAgo', label: 'Added (days ago)', dataType: 'range' },
  { ...base, key: 'watched', label: 'Watched', dataType: 'boolean' },
  {
    ...base,
    key: 'monitored',
    label: 'Monitored',
    dataType: 'boolean',
    valueLabels: { true: 'Monitored', false: 'Unmonitored' },
  },
  {
    ...base,
    key: 'status',
    label: 'Status',
    dataType: 'string',
    options: [{ value: 'ended', label: 'Ended' }],
  },
  {
    ...base,
    key: 'tagIds',
    label: 'Tags',
    dataType: 'instance-ids',
    lookup: 'tags',
    instanceScoped: true,
  },
  { ...base, key: 'genres', label: 'Genres', dataType: 'csv-strings', lookup: 'genres' },
];
const LOOKUPS = {
  tags: [
    { id: 1, label: 'list-import', providerId: 3, providerName: 'Radarr' },
    { id: 1, label: 'other-instance', providerId: 4, providerName: 'Radarr 2' },
  ],
  qualityProfiles: [],
  languageProfiles: [],
};

const one = (ruleKey: string, value: Parameters<typeof summarizeFilters>[0][0]['value']) =>
  summarizeFilters([{ ruleKey, value }], RULES, LOOKUPS)[0];

describe('summarizeFilters', () => {
  it('formats a range instead of [object Object]', () => {
    expect(one('year', { min: 1990, max: 2000 })).toBe('Year: 1990–2000');
    expect(one('addedDaysAgo', { min: 90 })).toBe('Added (days ago): 90 or more');
    expect(one('year', { max: 2000 })).toBe('Year: up to 2000');
  });

  it('names instance ids from the lookup, for the right instance', () => {
    expect(one('tagIds', { providerId: 3, ids: [1] })).toBe('Tags: list-import');
  });

  it('does not expose an id it cannot name', () => {
    expect(one('tagIds', { ids: [99, 98] })).toBe('Tags: 2 selected');
  });

  it('uses value labels and option labels', () => {
    expect(one('watched', false)).toBe('Watched: No');
    expect(one('monitored', true)).toBe('Monitored: Monitored');
    expect(one('status', 'ended')).toBe('Status: Ended');
  });

  it('spaces a multi-value list', () => {
    expect(one('genres', 'Drama,Comedy')).toBe('Genres: Drama, Comedy');
  });

  it('words a rule no longer described, rather than showing its key', () => {
    expect(one('lastWatched', 'x')).toBe('Last watched: x');
  });
});
