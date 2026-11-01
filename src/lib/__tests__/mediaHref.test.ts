import { canOpenInMedia, mediaHref } from '@app/lib/mediaQueryAdapters';
import type { MediaRuleDescriptor } from '@contract/media';
import { describe, expect, it } from 'vitest';

const RULES: MediaRuleDescriptor[] = [
  { key: 'year', label: 'Year', dataType: 'range', contentTypes: ['movie', 'series'] },
  { key: 'watched', label: 'W', dataType: 'boolean', contentTypes: ['movie'] },
  {
    key: 'tagIds',
    label: 'Tags',
    dataType: 'instance-ids',
    lookup: 'tags',
    instanceScoped: true,
    contentTypes: ['movie'],
  },
  {
    key: 'tagIds',
    label: 'Tags',
    dataType: 'instance-ids',
    lookup: 'tags',
    instanceScoped: true,
    contentTypes: ['series'],
  },
];

describe('canOpenInMedia', () => {
  it('is true when every filter has an offered rule for the content type', () => {
    expect(
      canOpenInMedia(
        { contentType: 'movie', filters: [{ ruleKey: 'watched', value: false }] },
        RULES
      )
    ).toBe(true);
  });

  it('is false when a filter would be lost, since Media would show a wider set', () => {
    expect(
      canOpenInMedia(
        { contentType: 'series', filters: [{ ruleKey: 'watched', value: false }] },
        RULES
      )
    ).toBe(false);
  });
});

describe('mediaHref', () => {
  it('turns a query into the URL Media reads its filters from', () => {
    const href = mediaHref(
      {
        contentType: 'movie',
        filters: [
          { ruleKey: 'year', value: { min: 1990 } },
          { ruleKey: 'watched', value: false },
          { ruleKey: 'tagIds', value: { providerId: 3, ids: [1, 2] } },
        ],
      },
      RULES
    );
    const params = new URL(href, 'http://x').searchParams;
    expect(new URL(href, 'http://x').pathname).toBe('/media');
    expect(params.get('yearMin')).toBe('1990');
    expect(params.get('watched')).toBe('false');
    expect(params.get('movieTagIds')).toBe('1,2');
    expect(params.get('movieTagIdsProviderId')).toBe('3');
  });

  it('opens the series tab for a series query', () => {
    const href = mediaHref({ contentType: 'series', filters: [] }, RULES);
    expect(new URL(href, 'http://x').searchParams.get('tab')).toBe('series');
  });
});
