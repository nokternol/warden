import { tmdbFieldSource } from '@server/modules/media/mediaFieldProvider';
import { describe, expect, it } from 'vitest';

describe('tmdbFieldSource', () => {
  it('transforms the raw TMDB status string into the canonical tmdbStatus field', () => {
    const result = tmdbFieldSource.toEnrichmentFields('Released');

    expect(result).toEqual({ tmdbStatus: 'Released' });
  });
});
