import {
  type FindingDescription,
  type ReadinessFinding,
  describeFinding,
} from '@contract/readiness';
import {
  type AutomationRunStatus,
  type ContentType,
  isInstanceScopedValue,
} from '@contract/schemas';
import { isOfferedProviderType, scope } from '@contract/scope';
import type { MetadataProviderType } from '../../database/schema';
import { SOURCE_OWNER, isMediaSourceType, providerTypeLabel } from '../providers';
import type { EnrichmentQueries } from './enrichment/enrichment.queries';
import type { EnrichmentFields } from './mediaFieldProvider';
import { type Filter, type FilterValue, type MediaRule, getRule } from './ruleRegistry';

/** A configured provider instance, as readiness judges filters against it. */
export interface ProviderFact {
  id: number;
  type: MetadataProviderType;
  isActive: boolean;
}

/**
 * Everything filter readiness judges with. The same for every filter list in a request, so it is
 * read once and each list is judged against it in memory.
 */
export interface ReadinessFacts {
  /** Every configured provider instance, active or not. */
  providers: readonly ProviderFact[];
  /** The latest enrichment run's outcome; undefined when no run has finished. */
  latestEnrichment: AutomationRunStatus | undefined;
  /** The enrichment fields at least one title of each content type holds a value for. */
  fieldsWithValues: Readonly<Record<ContentType, ReadonlySet<keyof EnrichmentFields>>>;
}

/**
 * Where `media` learns the latest enrichment run's outcome. The run history belongs to
 * `automations`, which implements this; `media` declares only the slice it reads.
 */
export interface EnrichmentOutcomeSource {
  latestEnrichmentStatus(): Promise<AutomationRunStatus | undefined>;
}

/** The narrow slice of `ProviderSettingsService` readiness reads. */
export interface ProviderInstancesSource {
  list(): Promise<readonly ProviderFact[]>;
}

/** Reads the facts filter readiness judges with, once per request. */
export class FilterReadiness {
  private readonly deps: {
    providerSettingsService: ProviderInstancesSource;
    enrichmentQueries: Pick<EnrichmentQueries, 'fieldsWithValues'>;
    enrichmentOutcomeSource: EnrichmentOutcomeSource;
  };

  constructor(deps: FilterReadiness['deps']) {
    this.deps = deps;
  }

  async readFacts(): Promise<ReadinessFacts> {
    const [providers, latestEnrichment, fieldsWithValues] = await Promise.all([
      this.deps.providerSettingsService.list(),
      this.deps.enrichmentOutcomeSource.latestEnrichmentStatus(),
      this.deps.enrichmentQueries.fieldsWithValues(),
    ]);
    return {
      providers: providers.map(({ id, type, isActive }) => ({ id, type, isActive })),
      latestEnrichment,
      fieldsWithValues,
    };
  }
}

/** Filters to judge: a saved query's, or the Media page's, which has no query id. */
export interface FilterList {
  queryId?: number;
  contentType: ContentType;
  filters: readonly Filter[];
}

/** The provider an automation acts through. */
export interface AutomationProvider {
  id: number;
  type: MetadataProviderType;
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
  automationProvider?: AutomationProvider;
  hasActive(type: MetadataProviderType): boolean;
}

/** Every reason `list` cannot be trusted to select the titles it describes, against `facts`. */
export function findingsFor(
  facts: ReadinessFacts,
  list: FilterList,
  automationProvider?: AutomationProvider
): ReadinessFinding[] {
  const sourceType = SOURCE_OWNER[list.contentType];
  const hasActive = (type: MetadataProviderType) =>
    facts.providers.some((p) => p.isActive && p.type === type);
  const judging: Judging = {
    facts,
    list,
    sourceType,
    libraryMissing: !hasActive(sourceType),
    automationProvider,
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
 * Whether an enrichment-only rule's data can be trusted. A title with no stored value is unknown
 * and matches neither value of a filter on it, so until enrichment is known to have succeeded such
 * a filter can select the wrong titles. Fields a source supplies arrive with the catalog.
 */
function enrichmentFindings(judging: Judging, rule: MediaRule): ReadinessFinding[] {
  if (!rule.sourceField || rule.providers.some(isMediaSourceType)) return [];
  if (judging.facts.latestEnrichment !== 'success') {
    return [
      finding(
        judging.list,
        { kind: 'data-incomplete', ruleLabel: rule.label },
        { ruleKey: rule.key }
      ),
    ];
  }
  const { facts, list } = judging;
  if (facts.fieldsWithValues[list.contentType].has(rule.sourceField)) return [];
  // The producers are part of the finding's identity: a sign-off given while one set of
  // instances supplied the field does not carry over to another.
  const producerIds = facts.providers
    .filter((p) => p.isActive && rule.providers.includes(p.type))
    .map((p) => p.id)
    .sort((a, b) => a - b);
  return [
    finding(
      list,
      { kind: 'no-data', ruleLabel: rule.label, contentType: list.contentType },
      { ruleKey: rule.key, providerIds: producerIds }
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

/**
 * Whether the instance a filter value names is an active source of the list's content type and,
 * for a source automation, its own instance.
 */
function instanceFindings(
  judging: Judging,
  rule: MediaRule,
  value: FilterValue
): ReadinessFinding[] {
  if (!isInstanceScopedValue(value) || value.providerId === undefined) return [];
  const { providerId } = value;
  const named = judging.facts.providers.find((p) => p.id === providerId);
  const instance = { id: providerId, typeLabel: named && providerTypeLabel(named.type) };
  const about = { ruleKey: rule.key, providerIds: [providerId] };
  if (!named?.isActive || named.type !== judging.sourceType) {
    const expectedLabel = named?.isActive ? providerTypeLabel(judging.sourceType) : undefined;
    return [
      finding(
        judging.list,
        { kind: 'inactive-instance', ruleLabel: rule.label, instance, expectedLabel },
        about
      ),
    ];
  }
  // A source automation acts on its own catalog only, so a value naming another instance
  // matches nothing there; any other actuator acts on the pooled catalogs of every source.
  const automation = judging.automationProvider;
  if (!automation || !isMediaSourceType(automation.type) || automation.id === providerId) {
    return [];
  }
  return [
    finding(
      judging.list,
      {
        kind: 'other-instance',
        ruleLabel: rule.label,
        instance,
        automationProvider: { id: automation.id, typeLabel: providerTypeLabel(automation.type) },
      },
      { ...about, providerIds: [providerId, automation.id] }
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

export function filterAnswer(findings: readonly ReadinessFinding[]): FilterAnswer {
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
  findings: readonly ReadinessFinding[],
  signedOffIds: ReadonlySet<string>,
  consentedIds: ReadonlySet<string> = new Set()
): AutomationAnswer {
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
