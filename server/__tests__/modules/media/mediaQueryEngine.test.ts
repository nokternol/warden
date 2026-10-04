import type { MediaSource } from '@server/modules/media';
import { matchItems } from '@server/modules/media/mediaQueryEngine';
import { MediaQueryEngine } from '@server/modules/media/mediaQueryEngine';
import type { NormalizedMovie } from '@server/modules/media/movie';
import { normalizeRadarrMovie } from '@server/modules/media/normalizeMedia';
import type { RadarrMovie } from '@server/modules/providers';
import { describe, expect, it } from 'vitest';
import { createRadarrMovie } from '../../../../tests/factories';

const radarrIds = (set: { _sourceIds: NormalizedMovie['_sourceIds'] }[]): (number | undefined)[] =>
  set.map((m) => m._sourceIds.radarr);

/** A `MediaSource` over raw Radarr movies — the read role the engine consumes. */
const radarrSource = (movies: RadarrMovie[], providerId = 1): MediaSource => ({
  getMediaItems: async () => movies.map((m) => normalizeRadarrMovie(m, providerId)),
  idOf: (item) => (item as NormalizedMovie)._sourceIds.radarr,
});

describe('MediaQueryEngine', () => {
  describe('evaluate — single included query', () => {
    it('returns the ids of the items satisfying the include predicate', async () => {
      const source = radarrSource([
        createRadarrMovie({ id: 1, title: 'Downloaded', hasFile: true }),
        createRadarrMovie({ id: 2, title: 'Missing', hasFile: false }),
      ]);

      const engine = new MediaQueryEngine();
      const result = await engine.evaluate({
        source,
        contentType: 'movie',
        clauses: [{ filters: [{ ruleKey: 'hasFile', value: true }], role: 'include' }],
      });

      expect(radarrIds(result as NormalizedMovie[])).toEqual([1]);
    });
  });

  describe('evaluate — include + exclude', () => {
    it('returns the include set minus the exclude set', async () => {
      const source = radarrSource([
        createRadarrMovie({ id: 1, title: 'Keep', hasFile: true, qualityProfileId: 10 }),
        createRadarrMovie({ id: 2, title: 'Skip', hasFile: false, qualityProfileId: 10 }),
        createRadarrMovie({ id: 3, title: 'Remove', hasFile: true, qualityProfileId: 20 }),
      ]);

      const engine = new MediaQueryEngine();
      const result = await engine.evaluate({
        source,
        contentType: 'movie',
        clauses: [
          { filters: [{ ruleKey: 'hasFile', value: true }], role: 'include' },
          {
            filters: [{ ruleKey: 'qualityProfileIds', value: { ids: [20] } }],
            role: 'exclude',
          },
        ],
      });

      expect(radarrIds(result as NormalizedMovie[])).toEqual([1]);
    });
  });

  describe('evaluate — empty filter values', () => {
    it('matches every item when the included query has no predicates', async () => {
      const source = radarrSource([
        createRadarrMovie({ id: 1, title: 'A' }),
        createRadarrMovie({ id: 2, title: 'B' }),
      ]);

      const engine = new MediaQueryEngine();
      const result = await engine.evaluate({
        source,
        contentType: 'movie',
        clauses: [{ filters: [], role: 'include' }],
      });

      expect(radarrIds(result as NormalizedMovie[])).toEqual([1, 2]);
    });
  });
});

describe('matchItems — per-entry provider gate', () => {
  const items = [
    normalizeRadarrMovie(
      createRadarrMovie({ id: 1, title: 'SD copy', qualityProfileId: 5 }),
      1 // providerId 1
    ),
    normalizeRadarrMovie(
      createRadarrMovie({ id: 1, title: '4k copy', qualityProfileId: 5 }),
      2 // providerId 2 — same raw id and profile id, different instance
    ),
  ];

  it('an unqualified value (no providerId) matches items regardless of instance', () => {
    const result = matchItems(
      items,
      [{ ruleKey: 'qualityProfileIds', value: { ids: [5] } }],
      'movie'
    );
    expect(result).toHaveLength(2);
  });

  it('a qualified value matches only the items from that provider', () => {
    const result = matchItems(
      items,
      [{ ruleKey: 'qualityProfileIds', value: { providerId: 1, ids: [5] } }],
      'movie'
    );
    expect(result).toHaveLength(1);
    expect(result[0]._sourceIds.providerId).toBe(1);
  });

  it('a qualified value rejects an item from another instance even when the predicate would pass', () => {
    const result = matchItems(
      items,
      [{ ruleKey: 'qualityProfileIds', value: { providerId: 999, ids: [5] } }],
      'movie'
    );
    expect(result).toHaveLength(0);
  });
});
