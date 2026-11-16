import {
  type FindingDescription,
  type ReadinessFinding,
  describeFinding,
  isInformational,
} from '@contract/readiness';
import { type ContentType, isInstanceScopedValue } from '@contract/schemas';
import { isOfferedProviderType, scope } from '@contract/scope';
import type { MetadataProviderType } from '../../database/schema';
import { SOURCE_OWNER, isMediaSourceType, providerTypeLabel } from '../providers';
import type { LibraryCache } from './libraryCache';
import { type Filter, type FilterValue, type MediaRule, getRule } from './ruleRegistry';

/** A configured provider instance, as readiness judges filters against it. */
export interface ProviderFact {
  id: number;
  type: MetadataProviderType;
  isActive: boolean;
}

/** One enricher's `facts` refresh record, as readiness judges its facts with it. */
export interface FactsRecord {
  providerId: number;
  refreshedAt: number | null;
  failedAt: number | null;
}

/**
 * Everything filter readiness judges with. The same for every filter list in a request, so it is
 * read once and each list is judged against it in memory.
 */
export interface ReadinessFacts {
  /** Every configured provider instance, active or not. */
  providers: readonly ProviderFact[];
  /** Every stored `facts` refresh record. */
  factsRecords: readonly FactsRecord[];
}

/** The narrow slice of `ProviderSettingsService` readiness reads. */
export interface ProviderInstancesSource {
  list(): Promise<readonly ProviderFact[]>;
}

/** Reads the facts filter readiness judges with, once per request. */
export class FilterReadiness {
  private readonly deps: {
    providerSettingsService: ProviderInstancesSource;
    /** The library copy, whose refresh records say whose facts are complete. */
    libraryCache: Pick<LibraryCache, 'read'>;
  };

  constructor(deps: FilterReadiness['deps']) {
    this.deps = deps;
  }

  async readFacts(): Promise<ReadinessFacts> {
    const [providers, { records }] = await Promise.all([
      this.deps.providerSettingsService.list(),
      this.deps.libraryCache.read(),
    ]);
    return {
      providers: providers.map(({ id, type, isActive }) => ({ id, type, isActive })),
      factsRecords: records
        .filter((r) => r.kind === 'facts')
        .map(({ providerId, refreshedAt, failedAt }) => ({ providerId, refreshedAt, failedAt })),
    };
  }
}

/** Filters to judge: a saved query's, or the Media page's, which has no query id. */
export interface FilterList {
  queryId?: number;
  contentType: ContentType;
  filters: readonly Filter[];
}

/**
 * A finding about `list`. Its id is built from the facts that make it (kind, query, rule and the
 * provider instances involved), so a re-check that finds the same problem gives the same id.
 */
function finding(
  list: FilterList,
  description: FindingDescription,
  about: { ruleKey?: string; providerIds?: number[] } = {}
): ReadinessFinding {
  const providerIds = about.providerIds ?? [];
  return {
    id: [description.kind, list.queryId ?? '', about.ruleKey ?? '', providerIds.join('+')].join(
      ':'
    ),
    kind: description.kind,
    queryId: list.queryId,
    ruleKey: about.ruleKey,
    providerIds,
    ...describeFinding(description),
  };
}

/** What every filter of one list is judged against. */
interface Judging {
  facts: ReadinessFacts;
  list: FilterList;
  /** The provider type that owns the list's content type's catalog. */
  sourceType: MetadataProviderType;
  libraryMissing: boolean;
  hasActive(type: MetadataProviderType): boolean;
}

/** Every reason `list` cannot be trusted to select the titles it describes, against `facts`. */
export function findingsFor(facts: ReadinessFacts, list: FilterList): ReadinessFinding[] {
  const sourceType = SOURCE_OWNER[list.contentType];
  const hasActive = (type: MetadataProviderType) =>
    facts.providers.some((p) => p.isActive && p.type === type);
  const judging: Judging = {
    facts,
    list,
    sourceType,
    libraryMissing: !hasActive(sourceType),
    hasActive,
  };
  const library = judging.libraryMissing
    ? [
        finding(list, {
          kind: 'no-library',
          contentType: list.contentType,
          sourceLabel: providerTypeLabel(sourceType),
        }),
      ]
    : [];
  const all = [...library, ...list.filters.flatMap((filter) => filterFindings(judging, filter))];
  return [...new Map(all.map((f) => [f.id, f])).values()];
}

function filterFindings(judging: Judging, { ruleKey, value }: Filter): ReadinessFinding[] {
  const rule = getRule(ruleKey, judging.list.contentType);
  if (!rule) return [finding(judging.list, { kind: 'unknown-rule', ruleKey }, { ruleKey })];
  const supply = supplyFindings(judging, rule);
  return [
    ...supply,
    ...(supply.length === 0 ? enrichmentFindings(judging, rule) : []),
    ...instanceFindings(judging, rule, value),
  ];
}

/**
 * Whether an enrichment-only rule's data is complete: Warden believes a supplier's successful
 * `facts` refresh, so a fact no title holds is the truth and raises nothing (north-star belief 6).
 * A supplier whose latest refresh failed, or that never refreshed, makes the rule's data
 * incomplete: an informational finding, which names the suppliers and never stops a run.
 */
function enrichmentFindings(judging: Judging, rule: MediaRule): ReadinessFinding[] {
  if (!rule.sourceField || rule.providers.some(isMediaSourceType)) return [];
  const { facts, list } = judging;
  const incomplete = facts.providers
    .filter((p) => p.isActive && rule.providers.includes(p.type))
    .filter((p) => {
      const record = facts.factsRecords.find((r) => r.providerId === p.id);
      return record?.refreshedAt == null || record.failedAt != null;
    })
    .map((p) => p.id)
    .sort((a, b) => a - b);
  if (incomplete.length === 0) return [];
  return [
    finding(
      list,
      { kind: 'data-incomplete', ruleLabel: rule.label },
      { ruleKey: rule.key, providerIds: incomplete }
    ),
  ];
}

/** Whether an active, offered provider serving the list's content type can supply `rule`. */
function supplyFindings(judging: Judging, rule: MediaRule): ReadinessFinding[] {
  const { sourceType, libraryMissing, hasActive } = judging;
  // Enrichers serve every content type; a source serves only the content type it owns.
  const producers = rule.providers.filter(
    (type) =>
      isOfferedProviderType(scope, type) && (!isMediaSourceType(type) || type === sourceType)
  );
  // The missing library is the cause for a rule its source would supply; it is said once.
  if (producers.some(hasActive) || (libraryMissing && rule.providers.includes(sourceType))) {
    return [];
  }
  const offered = producers.length > 0;
  return [
    finding(
      judging.list,
      {
        kind: 'no-provider',
        ruleLabel: rule.label,
        producerLabels: (offered ? producers : rule.providers).map(providerTypeLabel),
        offered,
      },
      { ruleKey: rule.key }
    ),
  ];
}

/** Whether the instance a filter value names is an active source of the list's content type. */
function instanceFindings(
  judging: Judging,
  rule: MediaRule,
  value: FilterValue
): ReadinessFinding[] {
  if (!isInstanceScopedValue(value) || value.providerId === undefined) return [];
  const { providerId } = value;
  const named = judging.facts.providers.find((p) => p.id === providerId);
  const instance = { id: providerId, typeLabel: named && providerTypeLabel(named.type) };
  if (named?.isActive && named.type === judging.sourceType) return [];
  const expectedLabel = named?.isActive ? providerTypeLabel(judging.sourceType) : undefined;
  return [
    finding(
      judging.list,
      { kind: 'inactive-instance', ruleLabel: rule.label, instance, expectedLabel },
      { ruleKey: rule.key, providerIds: [providerId] }
    ),
  ];
}

/** What the screens that show a filter list on its own do with its findings. */
export interface FilterAnswer {
  queryList: 'clear' | 'checkData' | 'broken';
  mediaPage: 'clear' | 'warns';
}

/**
 * Whether a user can accept a finding as known risk. Only "no title holds a value" can be: the
 * system cannot tell an empty field from a failed load, and only the user knows the field is
 * empty on purpose. Every other finding names something that cannot work until it is fixed.
 */
function canBeSignedOff(finding: ReadinessFinding): boolean {
  return finding.kind === 'no-data';
}

export function filterAnswer(all: readonly ReadinessFinding[]): FilterAnswer {
  const findings = all.filter((f) => !isInformational(f));
  if (findings.length === 0) return { queryList: 'clear', mediaPage: 'clear' };
  return {
    queryList: findings.every(canBeSignedOff) ? 'checkData' : 'broken',
    mediaPage: 'warns',
  };
}

/** An automation's findings, as its row shows them. */
export interface AutomationBlocks {
  /** Cannot work until fixed; no one can accept them. */
  needsFix: ReadinessFinding[];
  /** Stop the schedule until a user accepts them as known risk. */
  awaitingSignOff: ReadinessFinding[];
  /** Accepted as known risk, listed so the accepted risk stays visible. */
  signedOff: ReadinessFinding[];
}

/** What each part of the system that runs an automation does with its findings. */
export interface AutomationAnswer {
  schedule: 'runs' | 'blocked';
  /** `asks` while a finding awaits sign-off that the user has not chosen to proceed past. */
  runNow: 'runs' | 'asks' | 'stops';
  blocks: AutomationBlocks;
}

export function automationAnswer(
  all: readonly ReadinessFinding[],
  signedOffIds: ReadonlySet<string>,
  consentedIds: ReadonlySet<string> = new Set()
): AutomationAnswer {
  const findings = all.filter((f) => !isInformational(f));
  const suspect = findings.filter(canBeSignedOff);
  const blocks: AutomationBlocks = {
    needsFix: findings.filter((f) => !canBeSignedOff(f)),
    awaitingSignOff: suspect.filter((f) => !signedOffIds.has(f.id)),
    signedOff: suspect.filter((f) => signedOffIds.has(f.id)),
  };
  if (blocks.needsFix.length > 0) return { schedule: 'blocked', runNow: 'stops', blocks };
  if (blocks.awaitingSignOff.length > 0) {
    // Consent covers the findings the user saw; one that appeared since asks again.
    const consented = blocks.awaitingSignOff.every((f) => consentedIds.has(f.id));
    return { schedule: 'blocked', runNow: consented ? 'runs' : 'asks', blocks };
  }
  return { schedule: 'runs', runNow: 'runs', blocks };
}
