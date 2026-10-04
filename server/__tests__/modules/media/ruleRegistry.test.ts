import { MetadataProviderType } from '@server/database/schema';
import {
  MEDIA_RULES,
  type NormalizedMovie,
  type NormalizedSeries,
  deriveProviders,
  getRule,
} from '@server/modules/media/ruleRegistry';
import { describe, expect, it } from 'vitest';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseMovie: NormalizedMovie = {
  _sourceIds: { radarr: 1 },
  title: 'Inception',
  year: 2010,
  hasFile: true,
  monitored: true,
  qualityProfileId: 1,
  tags: [10, 20],
  genres: ['Sci-Fi', 'Thriller'],
  addedDate: new Date(Date.now() - 10 * 86_400_000).toISOString(),
  plexAddedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
  sizeOnDiskBytes: 5 * 1_073_741_824,
  certification: 'PG-13',
  imdbRating: 8.8,
  playCount: 3,
};

const baseSeries: NormalizedSeries = {
  _sourceIds: { sonarr: 1 },
  title: 'Breaking Bad',
  year: 2008,
  hasFile: true,
  monitored: false,
  qualityProfileId: 2,
  tags: [5, 15],
  genres: ['Drama', 'Crime'],
  addedDate: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  sizeOnDiskBytes: 20 * 1_073_741_824,
  certification: 'TV-MA',
  seriesStatus: 'ended',
  ended: true,
  episodePercentage: 95,
  lastAiredAt: new Date(Date.now() - 100 * 86_400_000).toISOString(),
  communityRating: 9.5,
  seriesType: 'standard',
  network: 'AMC',
  playCount: 0,
};

// ─── Registry structure ───────────────────────────────────────────────────────

describe('MEDIA_RULES', () => {
  it('has no two rules registering the same key for the same content type', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const rule of MEDIA_RULES) {
      for (const contentType of rule.contentTypes) {
        const id = `${rule.key}:${contentType}`;
        if (seen.has(id)) dupes.push(id);
        seen.add(id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('every entry has required fields', () => {
    for (const rule of MEDIA_RULES) {
      expect(rule.key).toBeTruthy();
      expect(rule.label).toBeTruthy();
      expect(rule.contentTypes.length).toBeGreaterThan(0);
      expect(['boolean', 'number', 'string', 'csv-ids', 'csv-strings', 'range']).toContain(
        rule.dataType
      );
      expect(rule.providers.length).toBeGreaterThan(0);
      expect(typeof rule.required).toBe('boolean');
      expect(typeof rule.predicate).toBe('function');
    }
  });
});

// ─── dataType classification ───────────────────────────────────────────────────
// The dataType is the contract the client reads to choose an input widget: `csv-ids`
// means numeric ids, `csv-strings` means free-text tokens. It must match what the
// predicate parses, otherwise the UI offers the wrong control.

describe('dataType classification', () => {
  it('genres compares strings — csv-strings, both content types', () => {
    expect(getRule('genres', 'movie')!.dataType).toBe('csv-strings');
    expect(getRule('genres', 'series')!.dataType).toBe('csv-strings');
  });

  it('certification compares strings — csv-strings', () => {
    expect(getRule('certification', 'movie')!.dataType).toBe('csv-strings');
  });

  it('network compares strings — csv-strings', () => {
    expect(getRule('network', 'series')!.dataType).toBe('csv-strings');
  });

  it('tagIds / qualityProfileIds compare numeric ids — csv-ids', () => {
    expect(getRule('tagIds', 'movie')!.dataType).toBe('csv-ids');
    expect(getRule('qualityProfileIds', 'movie')!.dataType).toBe('csv-ids');
  });

  it('year / addedDaysAgo / imdbRating are bounded — range', () => {
    expect(getRule('year', 'movie')!.dataType).toBe('range');
    expect(getRule('addedDaysAgo', 'movie')!.dataType).toBe('range');
    expect(getRule('imdbRating', 'movie')!.dataType).toBe('range');
  });

  it('movieFileCount is a range, not a number — no natural small enum for a file count', () => {
    expect(getRule('movieFileCount', 'movie')!.dataType).toBe('range');
  });

  it('releaseGroups / collectionName compare strings — csv-strings', () => {
    expect(getRule('releaseGroups', 'movie')!.dataType).toBe('csv-strings');
    expect(getRule('collectionName', 'movie')!.dataType).toBe('csv-strings');
  });

  it('inCinemasDaysAgo / physicalReleaseDaysAgo / digitalReleaseDaysAgo are bounded — range', () => {
    expect(getRule('inCinemasDaysAgo', 'movie')!.dataType).toBe('range');
    expect(getRule('physicalReleaseDaysAgo', 'movie')!.dataType).toBe('range');
    expect(getRule('digitalReleaseDaysAgo', 'movie')!.dataType).toBe('range');
  });

  it('isAvailable is a computed availability flag — boolean', () => {
    expect(getRule('isAvailable', 'movie')!.dataType).toBe('boolean');
  });

  it("radarrStatus is Radarr's own release-lifecycle enum — string", () => {
    expect(getRule('radarrStatus', 'movie')!.dataType).toBe('string');
  });
});

// ─── providers accuracy ───────────────────────────────────────────────
// providers must reflect the real owner of a field, confirmed against
// docs/architecture/media-providers.md — a stale entry implies an integration
// that doesn't exist in this deployment.

describe('providers accuracy', () => {
  it('tagIds (movie) lists only Radarr — Sonarr cannot produce a movie tag', () => {
    expect(getRule('tagIds', 'movie')!.providers).toEqual([MetadataProviderType.RADARR]);
  });

  it('tagIds (series) lists only Sonarr — Radarr cannot produce a series tag', () => {
    expect(getRule('tagIds', 'series')!.providers).toEqual([MetadataProviderType.SONARR]);
  });

  it('watched is derived from playCount — Tautulli, Plex, and Jellyfin all produce it', () => {
    expect(getRule('watched', 'movie')!.providers).toEqual([
      MetadataProviderType.TAUTULLI,
      MetadataProviderType.PLEX,
      MetadataProviderType.JELLYFIN,
    ]);
  });

  it('genres (movie) is Radarr-only — no TMDB genres call is wired', () => {
    expect(getRule('genres', 'movie')!.providers).toEqual([MetadataProviderType.RADARR]);
  });

  it('imdbRating is Radarr-only — no OMDB integration exists in this deployment', () => {
    expect(getRule('imdbRating', 'movie')!.providers).toEqual([MetadataProviderType.RADARR]);
  });

  it('communityRating is Sonarr-only — Sonarr ratings is a single aggregate, no TMDB key configured', () => {
    expect(getRule('communityRating', 'series')!.providers).toEqual([MetadataProviderType.SONARR]);
  });

  it('addedDaysAgo (movie) lists only Radarr/Sonarr — nothing populates addedDate from Plex', () => {
    expect(getRule('addedDaysAgo', 'movie')!.providers).toEqual([
      MetadataProviderType.RADARR,
      MetadataProviderType.SONARR,
    ]);
  });

  it('addedDaysAgo (series) lists only Radarr/Sonarr — nothing populates addedDate from Plex', () => {
    expect(getRule('addedDaysAgo', 'series')!.providers).toEqual([
      MetadataProviderType.RADARR,
      MetadataProviderType.SONARR,
    ]);
  });
});

// ─── deriveProviders ─────────────────────────────────────────────────
// For a rule backed by an EnrichmentFields-tracked field, providers is
// derived from fieldsByProviderType (the same declaration MediaFieldProvider/
// MediaFieldSource adapters are checked against) instead of hand-listed —
// a provider rename/removal there can't silently leave a rule's gating stale.

describe('deriveProviders', () => {
  it('derives tmdbStatus to [TMDB]', () => {
    expect(deriveProviders('tmdbStatus')).toEqual([MetadataProviderType.TMDB]);
  });

  it('derives playCount to Tautulli, Plex, and Jellyfin — a contested field', () => {
    expect(deriveProviders('playCount')).toEqual([
      MetadataProviderType.TAUTULLI,
      MetadataProviderType.PLEX,
      MetadataProviderType.JELLYFIN,
    ]);
  });

  it('derives tags to both Radarr and Sonarr — each owns tags on its own kind', () => {
    expect(deriveProviders('tags')).toEqual([
      MetadataProviderType.RADARR,
      MetadataProviderType.SONARR,
    ]);
  });
});

// ─── getRule lookup ──────────────────────────────────────────────────────

describe('getRule', () => {
  it('returns definition for (tagIds, movie)', () => {
    const rule = getRule('tagIds', 'movie');
    expect(rule).toBeDefined();
    expect(rule!.contentTypes).toContain('movie');
  });

  it('returns definition for (tagIds, series)', () => {
    const rule = getRule('tagIds', 'series');
    expect(rule).toBeDefined();
    expect(rule!.contentTypes).toContain('series');
  });

  it('returns undefined for unknown key', () => {
    expect(getRule('nonexistent', 'movie')).toBeUndefined();
  });

  it('returns undefined when key exists but not for given contentType', () => {
    // imdbRating is movie-only
    expect(getRule('imdbRating', 'series')).toBeUndefined();
  });
});

// ─── instanceScoped classification ─────────────────────────────────────────────
// Rules whose values are provider-*defined* id spaces (a quality profile id is
// minted by one instance) must be flagged so the client knows to qualify them
// per instance rather than treating them as universal.

describe('instanceScoped classification', () => {
  it('flags qualityProfileIds and tagIds as instance-scoped for both content types', () => {
    expect(getRule('qualityProfileIds', 'movie')!.instanceScoped).toBe(true);
    expect(getRule('qualityProfileIds', 'series')!.instanceScoped).toBe(true);
    expect(getRule('tagIds', 'movie')!.instanceScoped).toBe(true);
    expect(getRule('tagIds', 'series')!.instanceScoped).toBe(true);
  });

  it('leaves universal rules unscoped', () => {
    expect(getRule('genres', 'movie')!.instanceScoped).toBeFalsy();
    expect(getRule('certification', 'movie')!.instanceScoped).toBeFalsy();
    expect(getRule('network', 'series')!.instanceScoped).toBeFalsy();
  });
});

// ─── Movie predicates ────────────────────────────────────────────────────────

describe('movie predicates', () => {
  it('title — matches substring case-insensitively', () => {
    const rule = getRule('title', 'movie')!;
    expect(rule.predicate(baseMovie, 'inception')).toBe(true);
    expect(rule.predicate(baseMovie, 'INCEP')).toBe(true);
    expect(rule.predicate(baseMovie, 'Avatar')).toBe(false);
  });

  it('year — passes within min/max bounds', () => {
    const rule = getRule('year', 'movie')!;
    expect(rule.predicate(baseMovie, { min: 2010 })).toBe(true);
    expect(rule.predicate(baseMovie, { min: 2011 })).toBe(false);
    expect(rule.predicate(baseMovie, { max: 2010 })).toBe(true);
    expect(rule.predicate(baseMovie, { max: 2009 })).toBe(false);
    expect(rule.predicate(baseMovie, { min: 2000, max: 2020 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, year: undefined }, { min: 2010 })).toBe(false);
  });

  it('hasFile — matches boolean exactly', () => {
    const rule = getRule('hasFile', 'movie')!;
    expect(rule.predicate(baseMovie, true)).toBe(true);
    expect(rule.predicate(baseMovie, false)).toBe(false);
  });

  it('tagIds — passes when item has any of the tag ids', () => {
    const rule = getRule('tagIds', 'movie')!;
    expect(rule.predicate(baseMovie, { ids: [10, 30] })).toBe(true);
    expect(rule.predicate(baseMovie, { ids: [99, 100] })).toBe(false);
  });

  it('qualityProfileIds — passes when item profile is in the ids', () => {
    const rule = getRule('qualityProfileIds', 'movie')!;
    expect(rule.predicate(baseMovie, { ids: [1, 2] })).toBe(true);
    expect(rule.predicate(baseMovie, { ids: [5, 6] })).toBe(false);
  });

  it('genres — passes when item has any of the csv genres', () => {
    const rule = getRule('genres', 'movie')!;
    expect(rule.predicate(baseMovie, 'Sci-Fi,Horror')).toBe(true);
    expect(rule.predicate(baseMovie, 'Romance')).toBe(false);
  });

  it('addedDaysAgo — passes within min/max bounds', () => {
    const rule = getRule('addedDaysAgo', 'movie')!;
    expect(rule.predicate(baseMovie, { min: 5 })).toBe(true); // added 10 days ago, gte 5
    expect(rule.predicate(baseMovie, { min: 15 })).toBe(false); // added 10 days ago, gte 15
    expect(rule.predicate(baseMovie, { max: 15 })).toBe(true); // added 10 days ago, lte 15
    expect(rule.predicate(baseMovie, { max: 5 })).toBe(false); // added 10 days ago, lte 5
    expect(rule.predicate({ ...baseMovie, addedDate: undefined }, { min: 5 })).toBe(false);
  });

  it('plexAddedDaysAgo — passes within min/max bounds', () => {
    const rule = getRule('plexAddedDaysAgo', 'movie')!;
    expect(rule.predicate(baseMovie, { min: 5 })).toBe(true); // added 10 days ago, gte 5
  });

  it('plexAddedDaysAgo — fails when item has no plexAddedAt', () => {
    const rule = getRule('plexAddedDaysAgo', 'movie')!;
    expect(rule.predicate({ ...baseMovie, plexAddedAt: undefined }, { min: 5 })).toBe(false);
  });

  it('sizeOnDiskGb — passes within min/max bounds (GB)', () => {
    const rule = getRule('sizeOnDiskGb', 'movie')!;
    expect(rule.predicate(baseMovie, { min: 4 })).toBe(true);
    expect(rule.predicate(baseMovie, { min: 6 })).toBe(false);
    expect(rule.predicate(baseMovie, { max: 6 })).toBe(true);
    expect(rule.predicate(baseMovie, { max: 4 })).toBe(false);
    expect(rule.predicate({ ...baseMovie, sizeOnDiskBytes: undefined }, { min: 4 })).toBe(false);
  });

  it('certification — matches case-insensitively against csv list', () => {
    const rule = getRule('certification', 'movie')!;
    expect(rule.predicate(baseMovie, 'PG-13,R')).toBe(true);
    expect(rule.predicate(baseMovie, 'pg-13')).toBe(true);
    expect(rule.predicate(baseMovie, 'G')).toBe(false);
  });

  it('imdbRating — passes within min/max bounds', () => {
    const rule = getRule('imdbRating', 'movie')!;
    expect(rule.predicate(baseMovie, { min: 8.0 })).toBe(true);
    expect(rule.predicate(baseMovie, { min: 9.0 })).toBe(false);
    expect(rule.predicate(baseMovie, { max: 9.0 })).toBe(true);
    expect(rule.predicate(baseMovie, { max: 7.0 })).toBe(false);
    expect(rule.predicate({ ...baseMovie, imdbRating: undefined }, { min: 8.0 })).toBe(false);
  });

  it('runtimeMinutes — passes within min/max bounds', () => {
    const rule = getRule('runtimeMinutes', 'movie')!;
    expect(rule.predicate({ ...baseMovie, runtimeMinutes: 148 }, { min: 120 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, runtimeMinutes: 148 }, { min: 150 })).toBe(false);
    expect(rule.predicate({ ...baseMovie, runtimeMinutes: 148 }, { max: 150 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, runtimeMinutes: 148 }, { max: 120 })).toBe(false);
    expect(rule.predicate(baseMovie, { min: 120 })).toBe(false);
  });

  it('watched — passes when playCount > 0', () => {
    const rule = getRule('watched', 'movie')!;
    expect(rule.predicate(baseMovie, true)).toBe(true); // playCount=3
    expect(rule.predicate({ ...baseMovie, playCount: 0 }, true)).toBe(false);
    expect(rule.predicate(baseMovie, false)).toBe(false);
    expect(rule.predicate({ ...baseMovie, playCount: 0 }, false)).toBe(true);
  });
});

// ─── Radarr movie-only predicates (new fields) ────────────────────────────────

describe('Radarr movie-only predicates', () => {
  it('movieFileCount — passes within min/max bounds', () => {
    const rule = getRule('movieFileCount', 'movie')!;
    expect(rule.predicate({ ...baseMovie, movieFileCount: 1 }, { min: 1 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, movieFileCount: 0 }, { min: 1 })).toBe(false);
    expect(rule.predicate({ ...baseMovie, movieFileCount: 1 }, { max: 0 })).toBe(false);
    expect(rule.predicate(baseMovie, { min: 0 })).toBe(false); // undefined movieFileCount
  });

  it('releaseGroups — passes when item has any of the csv release groups', () => {
    const rule = getRule('releaseGroups', 'movie')!;
    expect(rule.predicate({ ...baseMovie, releaseGroups: ['SPARKS', 'RARBG'] }, 'RARBG')).toBe(
      true
    );
    expect(rule.predicate({ ...baseMovie, releaseGroups: ['SPARKS'] }, 'RARBG')).toBe(false);
    expect(rule.predicate(baseMovie, 'RARBG')).toBe(false);
  });

  it('inCinemasDaysAgo — passes within min/max bounds', () => {
    const rule = getRule('inCinemasDaysAgo', 'movie')!;
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    expect(rule.predicate({ ...baseMovie, inCinemasDate: tenDaysAgo }, { min: 5 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, inCinemasDate: tenDaysAgo }, { min: 15 })).toBe(false);
    expect(rule.predicate({ ...baseMovie, inCinemasDate: undefined }, { min: 5 })).toBe(false);
  });

  it('physicalReleaseDaysAgo — passes within min/max bounds', () => {
    const rule = getRule('physicalReleaseDaysAgo', 'movie')!;
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    expect(rule.predicate({ ...baseMovie, physicalReleaseDate: tenDaysAgo }, { min: 5 })).toBe(
      true
    );
    expect(rule.predicate({ ...baseMovie, physicalReleaseDate: tenDaysAgo }, { min: 15 })).toBe(
      false
    );
    expect(rule.predicate({ ...baseMovie, physicalReleaseDate: undefined }, { min: 5 })).toBe(
      false
    );
  });

  it('digitalReleaseDaysAgo — passes within min/max bounds', () => {
    const rule = getRule('digitalReleaseDaysAgo', 'movie')!;
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    expect(rule.predicate({ ...baseMovie, digitalReleaseDate: tenDaysAgo }, { min: 5 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, digitalReleaseDate: tenDaysAgo }, { min: 15 })).toBe(
      false
    );
    expect(rule.predicate({ ...baseMovie, digitalReleaseDate: undefined }, { min: 5 })).toBe(false);
  });

  it('collectionName — passes when item collection is in the ids', () => {
    const rule = getRule('collectionName', 'movie')!;
    expect(
      rule.predicate(
        { ...baseMovie, collectionName: 'The Matrix Collection' },
        'The Matrix Collection'
      )
    ).toBe(true);
    expect(
      rule.predicate({ ...baseMovie, collectionName: 'The Matrix Collection' }, 'Rocky Collection')
    ).toBe(false);
    expect(rule.predicate(baseMovie, 'The Matrix Collection')).toBe(false);
  });

  it('isAvailable — true only when isAvailable matches value', () => {
    const rule = getRule('isAvailable', 'movie')!;
    expect(rule.predicate({ ...baseMovie, isAvailable: true }, true)).toBe(true);
    expect(rule.predicate({ ...baseMovie, isAvailable: false }, true)).toBe(false);
    expect(rule.predicate({ ...baseMovie, isAvailable: true }, false)).toBe(false);
  });

  it("radarrStatus — matches Radarr's own release-lifecycle enum value", () => {
    const rule = getRule('radarrStatus', 'movie')!;
    expect(rule.predicate({ ...baseMovie, radarrStatus: 'released' }, 'released')).toBe(true);
    expect(rule.predicate({ ...baseMovie, radarrStatus: 'announced' }, 'released')).toBe(false);
    expect(rule.predicate({ ...baseMovie, radarrStatus: undefined }, 'released')).toBe(false);
  });

  it('every new Radarr rule is movie-only, sourced from Radarr', () => {
    for (const key of [
      'movieFileCount',
      'releaseGroups',
      'inCinemasDaysAgo',
      'physicalReleaseDaysAgo',
      'digitalReleaseDaysAgo',
      'collectionName',
      'isAvailable',
      'radarrStatus',
    ]) {
      const rule = getRule(key, 'movie')!;
      expect(rule).toBeDefined();
      expect(rule.contentTypes).toEqual(['movie']);
      expect(rule.providers).toEqual([MetadataProviderType.RADARR]);
    }
  });
});

// ─── Series predicates ────────────────────────────────────────────────────────

describe('studio predicates', () => {
  it('movie — passes when item studio is in the ids', () => {
    const rule = getRule('studio', 'movie')!;
    expect(
      rule.predicate({ ...baseMovie, studio: 'Legendary Pictures' }, 'Legendary Pictures')
    ).toBe(true);
    expect(rule.predicate({ ...baseMovie, studio: 'Legendary Pictures' }, 'Warner Bros')).toBe(
      false
    );
    expect(rule.predicate(baseMovie, 'Legendary Pictures')).toBe(false);
  });

  it('series — passes when item studio is in the ids', () => {
    const rule = getRule('studio', 'series')!;
    expect(rule.predicate({ ...baseSeries, studio: 'AMC Studios' }, 'AMC Studios')).toBe(true);
    expect(rule.predicate({ ...baseSeries, studio: 'AMC Studios' }, 'HBO')).toBe(false);
  });
});

describe('series predicates', () => {
  it('title — series', () => {
    const rule = getRule('title', 'series')!;
    expect(rule.predicate(baseSeries, 'breaking')).toBe(true);
    expect(rule.predicate(baseSeries, 'Dexter')).toBe(false);
  });

  it('year — series', () => {
    const rule = getRule('year', 'series')!;
    expect(rule.predicate(baseSeries, { min: 2008, max: 2008 })).toBe(true);
    expect(rule.predicate(baseSeries, { min: 2009 })).toBe(false);
    expect(rule.predicate(baseSeries, { max: 2007 })).toBe(false);
  });

  it('hasFile — series', () => {
    const rule = getRule('hasFile', 'series')!;
    expect(rule.predicate(baseSeries, true)).toBe(true);
    expect(rule.predicate(baseSeries, false)).toBe(false);
  });

  it('tagIds — series', () => {
    const rule = getRule('tagIds', 'series')!;
    expect(rule.predicate(baseSeries, { ids: [5, 99] })).toBe(true);
    expect(rule.predicate(baseSeries, { ids: [99] })).toBe(false);
  });

  it('qualityProfileIds — series', () => {
    const rule = getRule('qualityProfileIds', 'series')!;
    expect(rule.predicate(baseSeries, { ids: [2, 3] })).toBe(true);
    expect(rule.predicate(baseSeries, { ids: [99] })).toBe(false);
  });

  it('genres — series', () => {
    const rule = getRule('genres', 'series')!;
    expect(rule.predicate(baseSeries, 'Drama,Comedy')).toBe(true);
    expect(rule.predicate(baseSeries, 'Horror')).toBe(false);
  });

  it('monitored — series', () => {
    const rule = getRule('monitored', 'series')!;
    expect(rule.predicate(baseSeries, false)).toBe(true);
    expect(rule.predicate(baseSeries, true)).toBe(false);
  });

  it('monitored — movie: rule exists and reads item.monitored', () => {
    const rule = getRule('monitored', 'movie')!;
    expect(rule).toBeDefined();
    expect(rule.predicate(baseMovie, true)).toBe(true); // baseMovie.monitored = true
    expect(rule.predicate(baseMovie, false)).toBe(false);
    expect(rule.providers).toEqual(
      expect.arrayContaining([MetadataProviderType.RADARR, MetadataProviderType.SONARR])
    );
  });

  it('seriesStatus — series', () => {
    const rule = getRule('seriesStatus', 'series')!;
    expect(rule.predicate(baseSeries, 'ended')).toBe(true);
    expect(rule.predicate(baseSeries, 'continuing')).toBe(false);
  });

  it('seriesType — series', () => {
    const rule = getRule('seriesType', 'series')!;
    expect(rule.predicate(baseSeries, 'standard')).toBe(true);
    expect(rule.predicate(baseSeries, 'anime')).toBe(false);
  });

  it('network — series, csv list', () => {
    const rule = getRule('network', 'series')!;
    expect(rule.predicate(baseSeries, 'AMC,HBO')).toBe(true);
    expect(rule.predicate(baseSeries, 'HBO')).toBe(false);
  });

  it('addedDaysAgo — series', () => {
    const rule = getRule('addedDaysAgo', 'series')!;
    expect(rule.predicate(baseSeries, { min: 10 })).toBe(true); // added 20 days ago
    expect(rule.predicate(baseSeries, { min: 30 })).toBe(false);
    expect(rule.predicate(baseSeries, { max: 30 })).toBe(true);
    expect(rule.predicate(baseSeries, { max: 10 })).toBe(false);
  });

  it('sizeOnDiskGb — series', () => {
    const rule = getRule('sizeOnDiskGb', 'series')!;
    expect(rule.predicate(baseSeries, { min: 15 })).toBe(true);
    expect(rule.predicate(baseSeries, { min: 25 })).toBe(false);
    expect(rule.predicate(baseSeries, { max: 25 })).toBe(true);
    expect(rule.predicate(baseSeries, { max: 15 })).toBe(false);
  });

  it('certification — series', () => {
    const rule = getRule('certification', 'series')!;
    expect(rule.predicate(baseSeries, 'TV-MA')).toBe(true);
    expect(rule.predicate(baseSeries, 'TV-PG')).toBe(false);
  });

  it('communityRating — series', () => {
    const rule = getRule('communityRating', 'series')!;
    expect(rule.predicate(baseSeries, { min: 9.0 })).toBe(true);
    expect(rule.predicate(baseSeries, { min: 10.0 })).toBe(false);
    expect(rule.predicate(baseSeries, { max: 10.0 })).toBe(true);
    expect(rule.predicate(baseSeries, { max: 8.0 })).toBe(false);
    expect(rule.predicate({ ...baseSeries, communityRating: undefined }, { min: 9.0 })).toBe(false);
  });

  it('ended — series', () => {
    const rule = getRule('ended', 'series')!;
    expect(rule.predicate(baseSeries, true)).toBe(true);
    expect(rule.predicate(baseSeries, false)).toBe(false);
  });

  it('lastAiredDaysAgo — series', () => {
    const rule = getRule('lastAiredDaysAgo', 'series')!;
    expect(rule.predicate(baseSeries, { min: 50 })).toBe(true); // aired 100 days ago
    expect(rule.predicate(baseSeries, { min: 150 })).toBe(false);
    expect(rule.predicate(baseSeries, { max: 150 })).toBe(true);
    expect(rule.predicate(baseSeries, { max: 50 })).toBe(false);
    expect(rule.predicate({ ...baseSeries, lastAiredAt: undefined }, { min: 50 })).toBe(false);
  });

  it('episodePercentage — series', () => {
    const rule = getRule('episodePercentage', 'series')!;
    expect(rule.predicate(baseSeries, { min: 90 })).toBe(true);
    expect(rule.predicate(baseSeries, { min: 100 })).toBe(false);
    expect(rule.predicate(baseSeries, { max: 100 })).toBe(true);
    expect(rule.predicate(baseSeries, { max: 80 })).toBe(false);
    expect(rule.predicate({ ...baseSeries, episodePercentage: undefined }, { min: 90 })).toBe(
      false
    );
  });

  it('watched — series', () => {
    const rule = getRule('watched', 'series')!;
    expect(rule.predicate(baseSeries, false)).toBe(true); // playCount=0
    expect(rule.predicate({ ...baseSeries, playCount: 2 }, true)).toBe(true);
  });

  it('tmdbStatus — movie: true when tmdbStatus matches value', () => {
    const rule = getRule('tmdbStatus', 'movie')!;
    expect(rule.predicate({ ...baseMovie, tmdbStatus: 'Ended' }, 'Ended')).toBe(true);
    expect(rule.predicate({ ...baseMovie, tmdbStatus: 'In Production' }, 'Ended')).toBe(false);
    expect(rule.predicate({ ...baseMovie, tmdbStatus: undefined }, 'Ended')).toBe(false);
  });

  it('overseerrRequestStatus — movie: true when overseerrRequestStatus equals value', () => {
    const rule = getRule('overseerrRequestStatus', 'movie')!;
    expect(rule.predicate({ ...baseMovie, overseerrRequestStatus: 2 }, 2)).toBe(true);
    expect(rule.predicate({ ...baseMovie, overseerrRequestStatus: 1 }, 2)).toBe(false);
    expect(rule.predicate({ ...baseMovie, overseerrRequestStatus: undefined }, 2)).toBe(false);
  });

  it('overseerrHasIssue — movie: true when overseerrHasIssue matches value', () => {
    const rule = getRule('overseerrHasIssue', 'movie')!;
    expect(rule.predicate({ ...baseMovie, overseerrHasIssue: true }, true)).toBe(true);
    expect(rule.predicate({ ...baseMovie, overseerrHasIssue: false }, true)).toBe(false);
    expect(rule.predicate({ ...baseMovie, overseerrHasIssue: undefined }, true)).toBe(false);
  });

  it('overseerrHasIssue — movie: unknown (null/undefined) reads as "no issue" (truthy/falsy)', () => {
    const rule = getRule('overseerrHasIssue', 'movie')!;
    // Data stores truth (null = Overseerr said nothing); the filter treats unknown as falsy,
    // so "has issue = false" includes items with no reported issue.
    expect(rule.predicate({ ...baseMovie, overseerrHasIssue: undefined }, false)).toBe(true);
  });

  it('lastWatchedDaysAgo — movie: passes within min/max bounds', () => {
    const rule = getRule('lastWatchedDaysAgo', 'movie')!;
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    expect(rule.predicate({ ...baseMovie, lastWatchedAt: twoDaysAgo }, { max: 7 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, lastWatchedAt: tenDaysAgo }, { max: 7 })).toBe(false);
    expect(rule.predicate({ ...baseMovie, lastWatchedAt: tenDaysAgo }, { min: 7 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, lastWatchedAt: twoDaysAgo }, { min: 7 })).toBe(false);
    expect(rule.predicate({ ...baseMovie, lastWatchedAt: undefined }, { max: 7 })).toBe(false);
  });
});

// ─── File-tech and release-date predicates (Plex-sourced, shared) ────────────

describe('file-tech and release-date predicates', () => {
  it('fileSizeBytes — movie: passes within min/max bounds', () => {
    const rule = getRule('fileSizeBytes', 'movie')!;
    expect(rule.predicate({ ...baseMovie, fileSizeBytes: 1000 }, { min: 500 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, fileSizeBytes: 1000 }, { min: 1500 })).toBe(false);
    expect(rule.predicate({ ...baseMovie, fileSizeBytes: 1000 }, { max: 1500 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, fileSizeBytes: 1000 }, { max: 500 })).toBe(false);
    expect(rule.predicate(baseMovie, { min: 500 })).toBe(false);
  });

  it('fileSizeBytes — series: passes within min/max bounds', () => {
    const rule = getRule('fileSizeBytes', 'series')!;
    expect(rule.predicate({ ...baseSeries, fileSizeBytes: 1000 }, { min: 500 })).toBe(true);
    expect(rule.predicate(baseSeries, { min: 500 })).toBe(false);
  });

  it('releaseDaysAgo — movie: passes within min/max bounds', () => {
    const rule = getRule('releaseDaysAgo', 'movie')!;
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    expect(rule.predicate({ ...baseMovie, releaseDate: tenDaysAgo }, { min: 5 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, releaseDate: tenDaysAgo }, { min: 15 })).toBe(false);
    expect(rule.predicate({ ...baseMovie, releaseDate: undefined }, { min: 5 })).toBe(false);
  });

  it('fileContainer — movie: passes when item container is in the ids', () => {
    const rule = getRule('fileContainer', 'movie')!;
    expect(rule.predicate({ ...baseMovie, fileContainer: 'mkv' }, 'mkv,mp4')).toBe(true);
    expect(rule.predicate({ ...baseMovie, fileContainer: 'avi' }, 'mkv,mp4')).toBe(false);
    expect(rule.predicate(baseMovie, 'mkv')).toBe(false);
  });

  it('videoCodec — movie: passes when item codec is in the ids', () => {
    const rule = getRule('videoCodec', 'movie')!;
    expect(rule.predicate({ ...baseMovie, videoCodec: 'h264' }, 'h264,hevc')).toBe(true);
    expect(rule.predicate({ ...baseMovie, videoCodec: 'mpeg2video' }, 'h264,hevc')).toBe(false);
  });

  it('audioCodec — movie: passes when item codec is in the ids', () => {
    const rule = getRule('audioCodec', 'movie')!;
    expect(rule.predicate({ ...baseMovie, audioCodec: 'aac' }, 'aac,dts')).toBe(true);
    expect(rule.predicate({ ...baseMovie, audioCodec: 'mp3' }, 'aac,dts')).toBe(false);
  });

  it('fileResolution — movie: passes when item resolution is in the ids', () => {
    const rule = getRule('fileResolution', 'movie')!;
    expect(rule.predicate({ ...baseMovie, fileResolution: '1080' }, '1080,4k')).toBe(true);
    expect(rule.predicate({ ...baseMovie, fileResolution: '720' }, '1080,4k')).toBe(false);
  });

  it('labels — movie: passes when item has any of the csv labels', () => {
    const rule = getRule('labels', 'movie')!;
    expect(rule.predicate({ ...baseMovie, labels: ['4K', 'Favorites'] }, '4K,HDR')).toBe(true);
    expect(rule.predicate({ ...baseMovie, labels: ['Favorites'] }, '4K,HDR')).toBe(false);
    expect(rule.predicate(baseMovie, '4K')).toBe(false);
  });

  it('labels — series: passes when item has any of the csv labels', () => {
    const rule = getRule('labels', 'series')!;
    expect(rule.predicate({ ...baseSeries, labels: ['Anime'] }, 'Anime,Kids')).toBe(true);
    expect(rule.predicate(baseSeries, 'Anime')).toBe(false);
  });
});

// ─── Jellyfin-only predicates ─────────────────────────────────────────────────

describe('Jellyfin-only predicates', () => {
  it('jellyfinAddedDaysAgo — movie: passes within min/max bounds', () => {
    const rule = getRule('jellyfinAddedDaysAgo', 'movie')!;
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    expect(rule.predicate({ ...baseMovie, jellyfinAddedAt: tenDaysAgo }, { min: 5 })).toBe(true);
    expect(rule.predicate({ ...baseMovie, jellyfinAddedAt: tenDaysAgo }, { min: 15 })).toBe(false);
    expect(rule.predicate({ ...baseMovie, jellyfinAddedAt: undefined }, { min: 5 })).toBe(false);
  });

  it('jellyfinIsFavorite — movie: matches boolean exactly', () => {
    const rule = getRule('jellyfinIsFavorite', 'movie')!;
    expect(rule.predicate({ ...baseMovie, isFavorite: true }, true)).toBe(true);
    expect(rule.predicate({ ...baseMovie, isFavorite: true }, false)).toBe(false);
    expect(rule.predicate({ ...baseMovie, isFavorite: undefined }, false)).toBe(true);
  });

  it('jellyfinIsFavorite — series: matches boolean exactly', () => {
    const rule = getRule('jellyfinIsFavorite', 'series')!;
    expect(rule.predicate({ ...baseSeries, isFavorite: true }, true)).toBe(true);
    expect(rule.predicate({ ...baseSeries, isFavorite: false }, true)).toBe(false);
  });
});

// ─── Sonarr-only predicates ────────────────────────────────────────────────────

describe('Sonarr-only predicates', () => {
  it('seasonCount is a range, not a number — no natural small enum for a season count', () => {
    expect(getRule('seasonCount', 'series')!.dataType).toBe('range');
  });

  it('seasonCount — series: passes within min/max bounds', () => {
    const rule = getRule('seasonCount', 'series')!;
    expect(rule.predicate({ ...baseSeries, seasonCount: 5 }, { min: 3 })).toBe(true);
    expect(rule.predicate({ ...baseSeries, seasonCount: 5 }, { min: 6 })).toBe(false);
    expect(rule.predicate({ ...baseSeries, seasonCount: 5 }, { max: 6 })).toBe(true);
    expect(rule.predicate({ ...baseSeries, seasonCount: 5 }, { max: 3 })).toBe(false);
    expect(rule.predicate(baseSeries, { min: 1 })).toBe(false);
  });

  it('episodeCount is a range — spans totalEpisodeCount as the practical bound', () => {
    expect(getRule('episodeCount', 'series')!.dataType).toBe('range');
  });

  it('episodeCount — series: reads totalEpisodeCount when present', () => {
    const rule = getRule('episodeCount', 'series')!;
    expect(
      rule.predicate({ ...baseSeries, totalEpisodeCount: 62, episodeCount: 60 }, { min: 61 })
    ).toBe(true);
    expect(
      rule.predicate({ ...baseSeries, totalEpisodeCount: 62, episodeCount: 60 }, { min: 70 })
    ).toBe(false);
  });

  it('episodeCount — series: falls back to episodeCount when totalEpisodeCount is absent', () => {
    const rule = getRule('episodeCount', 'series')!;
    expect(rule.predicate({ ...baseSeries, episodeCount: 12 }, { min: 10 })).toBe(true);
    expect(rule.predicate(baseSeries, { min: 1 })).toBe(false);
  });

  it('nextAiringInDays is a forward-looking range — not the "days ago" convention', () => {
    expect(getRule('nextAiringInDays', 'series')!.dataType).toBe('range');
  });

  it('nextAiringInDays — series: passes within min/max bounds counting forward from now', () => {
    const rule = getRule('nextAiringInDays', 'series')!;
    const inTenDays = new Date(Date.now() + 10 * 86_400_000 + 60_000).toISOString();
    expect(rule.predicate({ ...baseSeries, nextAiring: inTenDays }, { min: 5, max: 15 })).toBe(
      true
    );
    expect(rule.predicate({ ...baseSeries, nextAiring: inTenDays }, { min: 11 })).toBe(false);
    expect(rule.predicate({ ...baseSeries, nextAiring: inTenDays }, { max: 9 })).toBe(false);
    expect(rule.predicate(baseSeries, { min: 0 })).toBe(false); // no nextAiring
  });

  it('languageProfileIds is csv-ids, instance-scoped — same shape as qualityProfileIds', () => {
    const rule = getRule('languageProfileIds', 'series')!;
    expect(rule.dataType).toBe('csv-ids');
    expect(rule.instanceScoped).toBe(true);
    expect(rule.providers).toEqual([MetadataProviderType.SONARR]);
  });

  it('languageProfileIds — series: passes when item languageProfileId is in the ids', () => {
    const rule = getRule('languageProfileIds', 'series')!;
    expect(rule.predicate({ ...baseSeries, languageProfileId: 3 }, { ids: [3, 4] })).toBe(true);
    expect(rule.predicate({ ...baseSeries, languageProfileId: 3 }, { ids: [99] })).toBe(false);
    expect(rule.predicate(baseSeries, { ids: [3] })).toBe(false); // no languageProfileId
  });
});
