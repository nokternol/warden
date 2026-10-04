import type { ContentType } from '@contract/schemas';
import { eq } from 'drizzle-orm';
import {
  type MetadataProviderType,
  mediaQueries,
  mediaQueryFilterValues,
  metadataProviders,
} from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { NotFoundError, ValidationError } from '../../kernel/errors';
import { type Filter, type FilterValue, getRule, isInstanceScopedValue } from '../media';

export type { FilterValue, Filter };

export interface MediaQueryValue {
  name: string;
  contentType: ContentType;
  filters: Filter[];
}

export interface ProviderStatus {
  providerType: MetadataProviderType;
  required: boolean;
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
  status: 'healthy' | 'degraded' | 'unavailable';
  providerStatus: ProviderStatus[];
  qualificationIssues: QualificationIssue[];
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
  if (dataType === 'range' || dataType === 'csv-ids') return JSON.parse(raw) as FilterValue;
  return raw;
}

function serializeValue(value: FilterValue): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function isObjectShaped(value: FilterValue): boolean {
  return typeof value === 'object' && value !== null;
}

function computeHealth(
  filters: Filter[],
  contentType: ContentType,
  activeProviderTypes: Set<MetadataProviderType>,
  activeProviderIds: Set<number>,
  automationProviderId?: number
): QueryHealth {
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
    return { status: 'healthy', providerStatus: [], qualificationIssues: [] };
  }

  // Collect per-providerType requirements across all filter keys
  const providerMap = new Map<MetadataProviderType, { required: boolean; keys: string[] }>();

  for (const { ruleKey } of filters) {
    const rule = getRule(ruleKey, contentType);
    if (!rule) continue;
    for (const pt of rule.providers) {
      const existing = providerMap.get(pt);
      if (existing) {
        existing.keys.push(ruleKey);
        if (rule.required) existing.required = true;
      } else {
        providerMap.set(pt, { required: rule.required, keys: [ruleKey] });
      }
    }
  }

  const providerStatus: ProviderStatus[] = [];
  let hasUnavailable = false;
  let hasDegraded = false;

  for (const [providerType, { required, keys }] of providerMap) {
    const configured = activeProviderTypes.has(providerType);
    providerStatus.push({ providerType, required, configured, affectedFilterKeys: keys });
    if (!configured) {
      if (required) hasUnavailable = true;
      else hasDegraded = true;
    }
  }

  if (qualificationIssues.length > 0) hasDegraded = true;

  const status = hasUnavailable ? 'unavailable' : hasDegraded ? 'degraded' : 'healthy';
  return { status, providerStatus, qualificationIssues };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class MediaQueryService {
  private readonly db: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.db = db;
  }

  /** Active provider types and ids together — one query, feeds `computeHealth`'s two axes. */
  private async activeProviders(): Promise<{
    types: Set<MetadataProviderType>;
    ids: Set<number>;
  }> {
    const activeRows = await this.db
      .select({ id: metadataProviders.id, type: metadataProviders.type })
      .from(metadataProviders)
      .where(eq(metadataProviders.isActive, true));
    return {
      types: new Set(activeRows.map((r) => r.type as MetadataProviderType)),
      ids: new Set(activeRows.map((r) => r.id)),
    };
  }

  async list(): Promise<MediaQueryRecord[]> {
    const rows = await this.db.select().from(mediaQueries).orderBy(mediaQueries.createdAt);
    const fvRows = await this.db.select().from(mediaQueryFilterValues);

    const { types: activeProviderTypes, ids: activeProviderIds } = await this.activeProviders();

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
      const health = computeHealth(
        filters,
        row.contentType as ContentType,
        activeProviderTypes,
        activeProviderIds
      );
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
      const instanceScoped = isInstanceScopedValue(value);
      const rangeShaped = isObjectShaped(value) && !instanceScoped;
      if (rule.dataType === 'csv-ids' && !instanceScoped) {
        throw new ValidationError(
          `Filter key '${ruleKey}' expects an { ids, providerId? } instance-scoped value`
        );
      }
      if (rule.dataType !== 'csv-ids' && instanceScoped) {
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

    const { types: activeProviderTypes, ids: activeProviderIds } = await this.activeProviders();

    const health = computeHealth(
      draft.filters,
      draft.contentType,
      activeProviderTypes,
      activeProviderIds
    );

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

    const { types: activeProviderTypes, ids: activeProviderIds } = await this.activeProviders();

    const filters: Filter[] = fvRows.map((fv) => {
      const rule = getRule(fv.filterKey, row.contentType as ContentType);
      const dataType = rule?.dataType ?? 'string';
      return { ruleKey: fv.filterKey, value: coerceValue(fv.value, dataType) };
    });

    const health = computeHealth(
      filters,
      row.contentType as ContentType,
      activeProviderTypes,
      activeProviderIds
    );

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
    queryId: number,
    automationProviderId: number
  ): Promise<QueryHealth> {
    const record = await this.getById(queryId);
    const { types: activeProviderTypes, ids: activeProviderIds } = await this.activeProviders();
    return computeHealth(
      record.filters,
      record.contentType,
      activeProviderTypes,
      activeProviderIds,
      automationProviderId
    );
  }

  async delete(id: number): Promise<void> {
    const [row] = await this.db.delete(mediaQueries).where(eq(mediaQueries.id, id)).returning();
    if (!row) throw new NotFoundError(`Query ${id} not found`);
  }
}
