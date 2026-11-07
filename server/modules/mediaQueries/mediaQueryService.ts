import type { ReadinessFinding } from '@contract/readiness';
import { type ContentType, isInstanceScopedValue, isRangeValue } from '@contract/schemas';
import { isOfferedProviderType, isOfferedRule, scope } from '@contract/scope';
import { eq } from 'drizzle-orm';
import {
  type MetadataProviderType,
  mediaQueries,
  mediaQueryFilterValues,
  metadataProviders,
} from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { ConflictError, NotFoundError, ValidationError } from '../../kernel/errors';
import {
  type Filter,
  type FilterAnswer,
  type FilterReadiness,
  type FilterValue,
  type ReadinessFacts,
  filterAnswer,
  findingsFor,
  getRule,
} from '../media';

export type { FilterValue, Filter };

export interface MediaQueryValue {
  name: string;
  contentType: ContentType;
  filters: Filter[];
}

export interface ProviderStatus {
  providerType: MetadataProviderType;
  configured: boolean;
  affectedFilterKeys: string[];
}

/** A filter entry's `providerId` qualification the engine cannot honor. */
export interface QualificationIssue {
  filterKey: string;
  providerId: number;
  reason: 'not_active' | 'wrong_automation_provider';
}

export interface QueryHealth {
  status: 'healthy' | 'degraded';
  providerStatus: ProviderStatus[];
  qualificationIssues: QualificationIssue[];
  /** Every reason the query's filters cannot be trusted, from filter readiness. */
  findings: ReadinessFinding[];
  queryList: FilterAnswer['queryList'];
}

/**
 * A persisted query: a `MediaQuerySpec` (contentType + clauses) given a database
 * identity and presentation metadata. The persisted form carries its single
 * include clause as the `filters` convenience accessor
 * (`clauses: [{ filters, role: 'include' }]`); the full multi-clause
 * projection is reserved for the client phase.
 */
export interface MediaQueryRecord {
  id: number;
  name: string;
  contentType: ContentType;
  filters: Filter[];
  health: QueryHealth;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coerceValue(raw: string, dataType: string): FilterValue {
  if (dataType === 'boolean') return raw === 'true' || raw === '1';
  if (dataType === 'number') return Number(raw);
  if (dataType === 'range' || dataType === 'instance-ids') return JSON.parse(raw) as FilterValue;
  return raw;
}

function serializeValue(value: FilterValue): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function computeHealth(
  facts: ReadinessFacts,
  list: { queryId?: number; filters: Filter[]; contentType: ContentType },
  automationProviderId?: number
): QueryHealth {
  const { filters, contentType } = list;
  const active = facts.providers.filter((p) => p.isActive);
  const activeProviderTypes = new Set(active.map((p) => p.type));
  const activeProviderIds = new Set(active.map((p) => p.id));
  const findings = findingsFor(facts, list);
  const { queryList } = filterAnswer(findings);
  const qualificationIssues: QualificationIssue[] = [];
  for (const { ruleKey, value } of filters) {
    if (!isInstanceScopedValue(value) || value.providerId === undefined) continue;
    const { providerId } = value;
    if (!activeProviderIds.has(providerId)) {
      qualificationIssues.push({ filterKey: ruleKey, providerId, reason: 'not_active' });
    } else if (automationProviderId !== undefined && providerId !== automationProviderId) {
      qualificationIssues.push({
        filterKey: ruleKey,
        providerId,
        reason: 'wrong_automation_provider',
      });
    }
  }

  if (filters.length === 0) {
    return {
      status: 'healthy',
      providerStatus: [],
      qualificationIssues: [],
      findings,
      queryList,
    };
  }

  // Collect per-providerType requirements across all filter keys
  const providerMap = new Map<MetadataProviderType, string[]>();

  for (const { ruleKey } of filters) {
    const rule = getRule(ruleKey, contentType);
    if (!rule) continue;
    // A provider type that cannot be configured cannot be missing.
    for (const pt of rule.providers.filter((type) => isOfferedProviderType(scope, type))) {
      providerMap.set(pt, [...(providerMap.get(pt) ?? []), ruleKey]);
    }
  }

  const providerStatus: ProviderStatus[] = [];
  for (const [providerType, keys] of providerMap) {
    const configured = activeProviderTypes.has(providerType);
    providerStatus.push({ providerType, configured, affectedFilterKeys: keys });
  }

  // A filter is supplied when any one of the providers that can supply it is connected, so a
  // year filter on movies is satisfied by Radarr without Sonarr or Plex. Only a filter with no
  // connected provider at all degrades the query.
  const supplied = new Set(
    providerStatus.filter((s) => s.configured).flatMap((s) => s.affectedFilterKeys)
  );
  const unsupplied = filters.some(
    ({ ruleKey }) =>
      !supplied.has(ruleKey) && providerStatus.some((s) => s.affectedFilterKeys.includes(ruleKey))
  );
  const status = unsupplied || qualificationIssues.length > 0 ? 'degraded' : 'healthy';
  return { status, providerStatus, qualificationIssues, findings, queryList };
}

/** SQLite's refusal of a write that would break a foreign key, however the driver wraps it. */
function isForeignKeyViolation(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = (e as { cause?: unknown }).cause) {
    if (/FOREIGN KEY constraint failed/.test(e.message)) return true;
  }
  return false;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class MediaQueryService {
  private readonly db: DrizzleDb;
  private readonly filterReadiness: FilterReadiness;

  constructor({ db, filterReadiness }: { db: DrizzleDb; filterReadiness: FilterReadiness }) {
    this.db = db;
    this.filterReadiness = filterReadiness;
  }

  async list(): Promise<MediaQueryRecord[]> {
    const rows = await this.db.select().from(mediaQueries).orderBy(mediaQueries.createdAt);
    const fvRows = await this.db.select().from(mediaQueryFilterValues);

    const facts = await this.filterReadiness.readFacts();

    const contentTypeByQueryId = new Map<number, ContentType>(
      rows.map((row) => [row.id, row.contentType as ContentType])
    );

    // Group filter value rows by mediaQueryId
    const filtersByQueryId = new Map<number, Filter[]>();
    for (const fv of fvRows) {
      const contentType = contentTypeByQueryId.get(fv.mediaQueryId);
      const rule = contentType ? getRule(fv.filterKey, contentType) : undefined;
      const dataType = rule?.dataType ?? 'string';
      const entry: Filter = { ruleKey: fv.filterKey, value: coerceValue(fv.value, dataType) };
      const arr = filtersByQueryId.get(fv.mediaQueryId) ?? [];
      arr.push(entry);
      filtersByQueryId.set(fv.mediaQueryId, arr);
    }

    return rows.map((row) => {
      const filters = filtersByQueryId.get(row.id) ?? [];
      const health = computeHealth(facts, {
        queryId: row.id,
        filters,
        contentType: row.contentType as ContentType,
      });
      return {
        id: row.id,
        name: row.name,
        contentType: row.contentType as ContentType,
        filters,
        health,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async create(draft: MediaQueryValue): Promise<MediaQueryRecord> {
    // Validate all filter keys exist in the registry for this contentType, and that
    // each value's shape matches the rule's dataType (a bare scalar destructures to
    // `{ min: undefined, max: undefined }` for a range rule, so `inRange` would
    // silently match every item instead of rejecting or filtering correctly; a bare
    // csv string for an instance-scoped rule carries no instance and no parsed ids).
    for (const { ruleKey, value } of draft.filters) {
      const rule = getRule(ruleKey, draft.contentType);
      if (!rule) {
        throw new ValidationError(
          `Filter key '${ruleKey}' is not valid for contentType '${draft.contentType}'`
        );
      }
      if (!isOfferedRule(scope, ruleKey)) {
        throw new ValidationError(`Filter key '${ruleKey}' is not offered`);
      }
      const instanceScoped = isInstanceScopedValue(value);
      const rangeShaped = isRangeValue(value);
      if (rule.dataType === 'instance-ids' && !instanceScoped) {
        throw new ValidationError(
          `Filter key '${ruleKey}' expects an { ids, providerId? } instance-scoped value`
        );
      }
      if (rule.dataType !== 'instance-ids' && instanceScoped) {
        throw new ValidationError(
          `Filter key '${ruleKey}' does not accept an instance-scoped value`
        );
      }
      if (rule.dataType === 'range' && !rangeShaped) {
        throw new ValidationError(`Filter key '${ruleKey}' expects a { min?, max? } range value`);
      }
      if (rule.dataType !== 'range' && rangeShaped) {
        throw new ValidationError(`Filter key '${ruleKey}' does not accept a range value`);
      }
    }

    const [row] = await this.db
      .insert(mediaQueries)
      .values({ name: draft.name.trim(), contentType: draft.contentType })
      .returning();

    if (draft.filters.length > 0) {
      await this.db.insert(mediaQueryFilterValues).values(
        draft.filters.map(({ ruleKey, value }) => ({
          mediaQueryId: row.id,
          filterKey: ruleKey,
          value: serializeValue(value),
        }))
      );
    }

    const health = computeHealth(await this.filterReadiness.readFacts(), {
      queryId: row.id,
      filters: draft.filters,
      contentType: draft.contentType,
    });

    return {
      id: row.id,
      name: row.name,
      contentType: row.contentType as ContentType,
      filters: draft.filters,
      health,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getById(id: number): Promise<MediaQueryRecord> {
    const [row] = await this.db.select().from(mediaQueries).where(eq(mediaQueries.id, id));
    if (!row) throw new NotFoundError(`Query ${id} not found`);

    const fvRows = await this.db
      .select()
      .from(mediaQueryFilterValues)
      .where(eq(mediaQueryFilterValues.mediaQueryId, id));

    const filters: Filter[] = fvRows.map((fv) => {
      const rule = getRule(fv.filterKey, row.contentType as ContentType);
      const dataType = rule?.dataType ?? 'string';
      return { ruleKey: fv.filterKey, value: coerceValue(fv.value, dataType) };
    });

    const health = computeHealth(await this.filterReadiness.readFacts(), {
      queryId: row.id,
      filters,
      contentType: row.contentType as ContentType,
    });

    return {
      id: row.id,
      name: row.name,
      contentType: row.contentType as ContentType,
      filters,
      health,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Health as seen from a specific automation binding: on top of the usual provider-configured
   * checks, an entry qualified to a `providerId` other than the automation's own is flagged —
   * by the `matchItems` gate it matches nothing, so this is misconfiguration made visible
   * rather than a silent no-op.
   */
  async getHealthForAutomation(
    record: Pick<MediaQueryRecord, 'filters' | 'contentType'>,
    automationProviderId: number
  ): Promise<QueryHealth> {
    return computeHealth(await this.filterReadiness.readFacts(), record, automationProviderId);
  }

  /** Refused while an automation uses the query: the database restricts the delete. */
  async delete(id: number): Promise<void> {
    const [row] = await this.db
      .delete(mediaQueries)
      .where(eq(mediaQueries.id, id))
      .returning()
      .catch((err: unknown) => {
        throw isForeignKeyViolation(err)
          ? new ConflictError(
              "This query is used by an automation, so it can't be deleted. Delete the automation first."
            )
          : err;
      });
    if (!row) throw new NotFoundError(`Query ${id} not found`);
  }
}
