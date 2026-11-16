import type { MediaSource } from '@server/modules/media';
import type { LibraryCopy } from '@server/modules/media/libraryCache';
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

describe('matchItems — a filter naming no rule', () => {
  it('fails rather than widening what the query selects', () => {
    const item = normalizeRadarrMovie(createRadarrMovie(), 1);
    expect(() => matchItems([item], [{ ruleKey: 'retiredRule', value: 'x' }], 'movie')).toThrow(
      /no longer exists: retiredRule/
    );
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

let nextCopyId = 1;

/** One copy of title `title` held by Radarr instance `providerId`, as the library cache loads it. */
function copyOf(title: number, providerId: number, movie: Partial<RadarrMovie> = {}): LibraryCopy {
  const record = createRadarrMovie({ id: nextCopyId, title: `Title ${title}`, ...movie });
  const item = normalizeRadarrMovie(record, providerId);
  item._sourceIds.identity = title;
  return {
    mediaItemId: nextCopyId++,
    mediaIdentityId: title,
    providerId,
    record,
    links: { plexRatingKey: null, jellyfinItemId: null },
    item,
  };
}

const HAS_FILE = { ruleKey: 'hasFile', value: true };

describe('MediaQueryEngine.select — which titles conditions select', () => {
  const engine = new MediaQueryEngine();

  it('answers a title selected through one copy once, with all its copies and the copy that met', () => {
    const missingOnA = copyOf(1, 1, { hasFile: false });
    const otherTitle = copyOf(2, 1, { hasFile: false });
    const downloadedOnB = copyOf(1, 2, { hasFile: true });

    const selected = engine.select([missingOnA, otherTitle, downloadedOnB], {
      contentType: 'movie',
      include: [[HAS_FILE]],
      exclude: [],
    });

    expect(selected).toEqual([
      { mediaIdentityId: 1, copies: [missingOnA, downloadedOnB], met: [downloadedOnB] },
    ]);
  });

  it("meets an instance-scoped value only through that instance's copy", () => {
    const taggedOnA = copyOf(1, 1, { tags: [7] });
    const untaggedOnB = copyOf(2, 2, { tags: [] });
    const taggedOnB = copyOf(2, 2, { tags: [7] });

    const selected = engine.select([taggedOnA, untaggedOnB, taggedOnB], {
      contentType: 'movie',
      include: [[{ ruleKey: 'tagIds', value: { providerId: 2, ids: [7] } }]],
      exclude: [],
    });

    expect(selected.map((t) => t.mediaIdentityId)).toEqual([2]);
    expect(selected[0].met).toEqual([taggedOnB]);
  });

  it('selects a title whose copies meet different filters of one query', () => {
    const missingOnA = copyOf(1, 1, { hasFile: false, tags: [] });
    const taggedOnB = copyOf(1, 2, { hasFile: true, tags: [7] });

    const selected = engine.select([missingOnA, taggedOnB], {
      contentType: 'movie',
      include: [
        [
          { ruleKey: 'tagIds', value: { providerId: 2, ids: [7] } },
          { ruleKey: 'hasFile', value: false },
        ],
      ],
      exclude: [],
    });

    expect(selected).toEqual([{ mediaIdentityId: 1, copies: [missingOnA, taggedOnB], met: [] }]);
  });
});
