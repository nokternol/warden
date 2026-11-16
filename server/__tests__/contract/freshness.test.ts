import { type RefreshRecord, freshnessOf } from '@contract/schemas';
import { describe, expect, it } from 'vitest';

const record = (over: Partial<RefreshRecord>): RefreshRecord => ({
  providerId: 1,
  provider: 'Radarr',
  kind: 'catalog',
  refreshedAt: 100,
  failedAt: null,
  error: null,
  ...over,
});

describe('freshnessOf', () => {
  it('is never fresher than the stalest successful refresh', () => {
    expect(
      freshnessOf([record({ refreshedAt: 300 }), record({ providerId: 2, refreshedAt: 200 })]).asOf
    ).toBe(200);
  });

  it('names a provider and kind once when several views of the copy carry the same record', () => {
    const tautulli = record({ providerId: 3, provider: 'Tautulli', kind: 'facts', failedAt: 150 });
    expect(freshnessOf([tautulli, record({}), tautulli]).stale).toEqual([
      { provider: 'Tautulli', kind: 'facts', failed: true },
    ]);
  });
});
