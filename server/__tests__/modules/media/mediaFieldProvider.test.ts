import { seerrFieldProvider, tmdbFieldSource } from '@server/modules/media/mediaFieldProvider';
import type { SeerrIssue, SeerrRequest } from '@server/modules/providers';
import { describe, expect, it } from 'vitest';

function seerrRequest(tmdbId: number, status: number): SeerrRequest {
  return {
    id: 1,
    status,
    type: 'movie',
    requestedBy: { id: 1, displayName: 'u', email: 'u@u.com' },
    media: { tmdbId, title: 'T' },
    createdAt: '',
  };
}

function seerrIssue(tmdbId: number): SeerrIssue {
  return { id: 1, status: 1, media: { tmdbId } };
}

describe('seerrFieldProvider.visit', () => {
  it('maps request status and issue presence by tmdbId', () => {
    const result = seerrFieldProvider.visit([
      [seerrRequest(100, 2), seerrRequest(999, 3)],
      [seerrIssue(100)],
    ]);

    expect(result.get(100)).toEqual({ requestStatus: 2, hasIssue: true });
    expect(result.get(999)).toEqual({ requestStatus: 3 });
  });
});

describe('tmdbFieldSource', () => {
  it('transforms the raw TMDB status string into the canonical tmdbStatus field', () => {
    const result = tmdbFieldSource.toEnrichmentFields('Released');

    expect(result).toEqual({ tmdbStatus: 'Released' });
  });
});
