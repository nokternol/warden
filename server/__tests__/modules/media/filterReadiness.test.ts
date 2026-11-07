/**
 * Filter readiness judged from hand-built facts: no database.
 *
 * Run: vitest run --project server
 */
import type { ReadinessFinding, ReadinessKind } from '@contract/readiness';
import { MetadataProviderType } from '@server/database/schema';
import {
  type FilterList,
  type ProviderFact,
  type ReadinessFacts,
  automationAnswer,
  filterAnswer,
  findingsFor,
} from '@server/modules/media/filterReadiness';
import { describe, expect, it } from 'vitest';

const { RADARR, SONARR, PLEX, TAUTULLI } = MetadataProviderType;

/** Facts with these instances, enrichment succeeded, and no field values unless given. */
function facts(
  providers: ProviderFact[],
  overrides: Partial<Omit<ReadinessFacts, 'providers'>> = {}
): ReadinessFacts {
  return {
    providers,
    latestEnrichment: 'success',
    fieldsWithValues: { movie: new Set(), series: new Set() },
    ...overrides,
  };
}

const active = (id: number, type: MetadataProviderType): ProviderFact => ({
  id,
  type,
  isActive: true,
});

const movies = (filters: FilterList['filters'], queryId?: number): FilterList => ({
  queryId,
  contentType: 'movie',
  filters,
});

const kinds = (list: FilterList, f: ReadinessFacts) => findingsFor(f, list).map((x) => x.kind);

describe('findingsFor', () => {
  it('raises no-library for a movie list when no Radarr is active, with or without filters', () => {
    expect(kinds(movies([]), facts([active(1, SONARR)]))).toEqual(['no-library']);
  });

  it('raises nothing for a list with no filters when its library source is active', () => {
    expect(kinds(movies([]), facts([active(1, RADARR)]))).toEqual([]);
  });

  it('raises unknown-rule for a filter naming a rule that is not registered', () => {
    const [finding] = findingsFor(
      facts([active(1, RADARR)]),
      movies([{ ruleKey: 'retiredRule', value: 'x' }], 7)
    );
    expect(finding).toMatchObject({ kind: 'unknown-rule', queryId: 7, ruleKey: 'retiredRule' });
  });

  it('raises no-provider for an enrichment-only filter none of whose producers is active', () => {
    const [finding] = findingsFor(
      facts([active(1, RADARR)]),
      movies([{ ruleKey: 'watched', value: true }])
    );
    expect(finding).toMatchObject({ kind: 'no-provider', ruleKey: 'watched' });
  });

  it('raises nothing for an enrichment-only filter when any one of its producers is active', () => {
    const f = facts([active(1, RADARR), active(2, TAUTULLI)], {
      fieldsWithValues: { movie: new Set(['playCount']), series: new Set() },
    });
    expect(kinds(movies([{ ruleKey: 'watched', value: true }]), f)).toEqual([]);
  });

  it('raises only no-library for a movie filter on Monitored when Sonarr is the only source', () => {
    expect(
      kinds(movies([{ ruleKey: 'monitored', value: true }]), facts([active(1, SONARR)]))
    ).toEqual(['no-library']);
  });

  it('raises no-provider for a rule only a deferred provider type produces', () => {
    const f = facts([active(1, RADARR)]);
    expect(kinds(movies([{ ruleKey: 'tmdbStatus', value: 'Released' }]), f)).toEqual([
      'no-provider',
    ]);
  });

  describe('a filter value naming a provider instance', () => {
    const tagsOn = (providerId: number) => ({
      ruleKey: 'tagIds',
      value: { providerId, ids: [1] },
    });

    it('raises inactive-instance when the instance is inactive', () => {
      const f = facts([active(1, RADARR), { id: 2, type: RADARR, isActive: false }]);
      expect(findingsFor(f, movies([tagsOn(2)]))).toMatchObject([
        { kind: 'inactive-instance', ruleKey: 'tagIds', providerIds: [2] },
      ]);
    });

    it('raises inactive-instance when the instance no longer exists', () => {
      expect(kinds(movies([tagsOn(9)]), facts([active(1, RADARR)]))).toEqual(['inactive-instance']);
    });

    it('raises inactive-instance when the instance is active but is not a source of the content type', () => {
      const f = facts([active(1, RADARR), active(2, SONARR)]);
      expect(kinds(movies([tagsOn(2)]), f)).toEqual(['inactive-instance']);
    });

    it("raises other-instance when a source automation's filter names a different source instance", () => {
      const f = facts([active(1, RADARR), active(2, RADARR)]);
      expect(findingsFor(f, movies([tagsOn(2)]), { id: 1, type: RADARR })).toMatchObject([
        { kind: 'other-instance', ruleKey: 'tagIds', providerIds: [2, 1] },
      ]);
    });

    it('raises nothing for a non-source automation whose filter names an active source instance', () => {
      const f = facts([active(1, RADARR), active(3, PLEX)]);
      expect(findingsFor(f, movies([tagsOn(1)]), { id: 3, type: PLEX })).toEqual([]);
    });

    it('raises nothing when the instance is an active source of the content type', () => {
      expect(kinds(movies([tagsOn(1)]), facts([active(1, RADARR)]))).toEqual([]);
    });
  });

  describe('an enrichment-only filter with an active producer', () => {
    const watched = movies([{ ruleKey: 'watched', value: true }]);
    const withValues = { movie: new Set(['playCount'] as const), series: new Set<never>() };

    it('raises data-incomplete when the latest enrichment run did not succeed, or none has finished', () => {
      for (const latestEnrichment of ['error', undefined] as const) {
        const f = facts([active(1, RADARR), active(2, TAUTULLI)], {
          latestEnrichment,
          fieldsWithValues: withValues,
        });
        expect(kinds(watched, f)).toEqual(['data-incomplete']);
      }
    });

    it("raises no-data, naming the field's active producers, when no title holds a value for its field", () => {
      const f = facts([active(1, RADARR), active(4, PLEX), active(2, TAUTULLI)]);
      expect(findingsFor(f, watched)).toMatchObject([
        { kind: 'no-data', ruleKey: 'watched', providerIds: [2, 4] },
      ]);
    });

    it('raises nothing once enrichment succeeded and a title holds a value', () => {
      const f = facts([active(1, RADARR), active(2, TAUTULLI)], { fieldsWithValues: withValues });
      expect(kinds(watched, f)).toEqual([]);
    });
  });

  it('says each problem once: findings with the same id are merged, different instances are not', () => {
    const tags = (providerId: number, id: number) => ({
      ruleKey: 'tagIds',
      value: { providerId, ids: [id] },
    });
    const f = facts([active(1, RADARR)]);
    const findings = findingsFor(f, movies([tags(8, 1), tags(8, 2), tags(9, 1)]));
    expect(findings.map((x) => x.providerIds)).toEqual([[8], [9]]);
  });

  it("words each finding with its rule's label and provider types' display labels", () => {
    const f = facts([
      active(1, RADARR),
      active(2, SONARR),
      { id: 3, type: RADARR, isActive: false },
    ]);
    const messages = findingsFor(
      f,
      movies([
        { ruleKey: 'tagIds', value: { providerId: 3, ids: [1] } },
        { ruleKey: 'tagIds', value: { providerId: 2, ids: [1] } },
        { ruleKey: 'watched', value: true },
        { ruleKey: 'tmdbStatus', value: 'Released' },
      ])
    ).map((x) => x.message);
    expect(messages).toEqual([
      'Tags filter names Radarr instance 3, which is not an active provider',
      'Tags filter names Sonarr instance 2, which is not a Radarr provider',
      'Watched filter needs a Tautulli, Plex or Jellyfin provider, and none is active',
      'TMDB status filter needs a TMDB provider, which Warden does not offer',
    ]);
  });
});

/** A finding of `kind`, as a consumer of the answers sees one. */
function findingOf(kind: ReadinessKind, id: string = kind): ReadinessFinding {
  return { id, kind, providerIds: [], message: kind, clears: '' };
}

describe('filterAnswer', () => {
  it('is clear on the query list and the Media page when there is no finding', () => {
    expect(filterAnswer([])).toEqual({ queryList: 'clear', mediaPage: 'clear' });
  });

  it('marks the query list broken and the Media page warning for a finding no one can sign off', () => {
    expect(filterAnswer([findingOf('no-data'), findingOf('inactive-instance')])).toEqual({
      queryList: 'broken',
      mediaPage: 'warns',
    });
  });

  it('asks the query list to check data when every finding can be signed off', () => {
    expect(filterAnswer([findingOf('no-data')])).toEqual({
      queryList: 'checkData',
      mediaPage: 'warns',
    });
  });
});

describe('automationAnswer', () => {
  const none = new Set<string>();

  it('runs on schedule and on Run Now when there is no finding', () => {
    expect(automationAnswer([], none)).toEqual({
      schedule: 'runs',
      runNow: 'runs',
      blocks: { needsFix: [], awaitingSignOff: [], signedOff: [] },
    });
  });

  it('stops both triggers on a finding no one can sign off, listing it as needing a fix', () => {
    const broken = findingOf('data-incomplete');
    expect(automationAnswer([broken], none)).toEqual({
      schedule: 'blocked',
      runNow: 'stops',
      blocks: { needsFix: [broken], awaitingSignOff: [], signedOff: [] },
    });
  });

  it('blocks the schedule and asks on Run Now while a finding awaits sign-off', () => {
    const suspect = findingOf('no-data');
    expect(automationAnswer([suspect], none)).toEqual({
      schedule: 'blocked',
      runNow: 'asks',
      blocks: { needsFix: [], awaitingSignOff: [suspect], signedOff: [] },
    });
  });

  it('runs on both triggers once every finding awaiting sign-off has been signed off', () => {
    const suspect = findingOf('no-data');
    expect(automationAnswer([suspect], new Set([suspect.id]))).toEqual({
      schedule: 'runs',
      runNow: 'runs',
      blocks: { needsFix: [], awaitingSignOff: [], signedOff: [suspect] },
    });
  });

  it('runs on Run Now past the findings the user chose to proceed past, but not on schedule', () => {
    const suspect = findingOf('no-data');
    const answer = automationAnswer([suspect], none, new Set([suspect.id]));
    expect(answer).toMatchObject({ schedule: 'blocked', runNow: 'runs' });
  });

  it('asks again when a finding appeared after the user chose to proceed', () => {
    const consented = findingOf('no-data', 'a');
    const appeared = findingOf('no-data', 'b');
    const answer = automationAnswer([consented, appeared], none, new Set(['a']));
    expect(answer.runNow).toBe('asks');
  });
});
