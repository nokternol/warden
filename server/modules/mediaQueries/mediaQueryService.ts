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
import { type FilterValue, type FilterValueEntry, getRule } from '../media';

export type { ContentType, FilterValue, FilterValueEntry };

export interface MediaQueryValue {
  name: string;
  contentType: ContentType;
  filterValues: FilterValueEntry[];
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
 * A persisted query: a `MediaQuerySpec` (contentType + sources) given a database
 * identity and presentation metadata. The persisted form carries its single
 * include source as the `filterValues` convenience accessor
 * (`sources: [{ filterValues, role: 'include' }]`); the full multi-source
 * projection is reserved for the client phase.
 */
export interface MediaQueryRecord {
  id: number;
  name: string;
  contentType: ContentType;
  filterValues: FilterValueEntry[];
  health: QueryHealth;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coerceValue(raw: string, dataType: string): FilterValue {
  if (dataType === 'boolean') return raw === 'true' || raw === '1';
  if (dataType === 'number') return Number(raw);
  if (dataType === 'range') return JSON.parse(raw) as FilterValue;
  return raw;
}

function serializeValue(value: FilterValue): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function isRangeShaped(value: FilterValue): boolean {
  return typeof value === 'object' && value !== null;
}

function computeHealth(
  filterEntries: FilterValueEntry[],
  contentType: ContentType,
  activeProviderTypes: Set<MetadataProviderType>,
  activeProviderIds: Set<number>,
  automationProviderId?: number
): QueryHealth {
  const qualificationIssues: QualificationIssue[] = [];
  for (const { key, providerId } of filterEntries) {
    if (providerId === undefined) continue;
    if (!activeProviderIds.has(providerId)) {
      qualificationIssues.push({ filterKey: key, providerId, reason: 'not_active' });
    } else if (automationProviderId !== undefined && providerId !== automationProviderId) {
      qualificationIssues.push({
        filterKey: key,
        providerId,
        reason: 'wrong_automation_provider',
      });
    }
  }

  if (filterEntries.length === 0) {
    return { status: 'healthy', providerStatus: [], qualificationIssues: [] };
  }

  // Collect per-providerType requirements across all filter keys
  const providerMap = new Map<MetadataProviderType, { required: boolean; keys: string[] }>();

  for (const { key } of filterEntries) {
    const rule = getRule(key, contentType);
    if (!rule) continue;
    for (const pt of rule.sourceProviders) {
      const existing = providerMap.get(pt);
      if (existing) {
        existing.keys.push(key);
        if (rule.required) existing.required = true;
      } else {
        providerMap.set(pt, { required: rule.required, keys: [key] });
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
    const fvByQueryId = new Map<number, FilterValueEntry[]>();
    for (const fv of fvRows) {
      const contentType = contentTypeByQueryId.get(fv.mediaQueryId);
      const rule = contentType ? getRule(fv.filterKey, contentType) : undefined;
      const dataType = rule?.dataType ?? 'string';
      const entry: FilterValueEntry = { key: fv.filterKey, value: coerceValue(fv.value, dataType) };
      if (fv.providerId !== null) entry.providerId = fv.providerId;
      const arr = fvByQueryId.get(fv.mediaQueryId) ?? [];
      arr.push(entry);
      fvByQueryId.set(fv.mediaQueryId, arr);
    }

    return rows.map((row) => {
      const filterValues = fvByQueryId.get(row.id) ?? [];
      const health = computeHealth(
        filterValues,
        row.contentType as ContentType,
        activeProviderTypes,
        activeProviderIds
      );
      return {
        id: row.id,
        name: row.name,
        contentType: row.contentType as ContentType,
        filterValues,
        health,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async create(draft: MediaQueryValue): Promise<MediaQueryRecord> {
    // Validate all filter keys exist in the registry for this contentType, and that
    // each value's shape matches the rule's dataType (a bare scalar destructures to
    // `{ min: undefined, max: undefined }` for a range rule, so `inRange` would
    // silently match every item instead of rejecting or filtering correctly).
    for (const { key, value } of draft.filterValues) {
      const rule = getRule(key, draft.contentType);
      if (!rule) {
        throw new ValidationError(
          `Filter key '${key}' is not valid for contentType '${draft.contentType}'`
        );
      }
      const rangeShaped = isRangeShaped(value);
      if (rule.dataType === 'range' && !rangeShaped) {
        throw new ValidationError(`Filter key '${key}' expects a { min?, max? } range value`);
      }
      if (rule.dataType !== 'range' && rangeShaped) {
        throw new ValidationError(`Filter key '${key}' does not accept a range value`);
      }
    }

    const [row] = await this.db
      .insert(mediaQueries)
      .values({ name: draft.name.trim(), contentType: draft.contentType })
      .returning();

    if (draft.filterValues.length > 0) {
      await this.db.insert(mediaQueryFilterValues).values(
        draft.filterValues.map(({ key, value, providerId }) => ({
          mediaQueryId: row.id,
          filterKey: key,
          value: serializeValue(value),
          providerId: providerId ?? null,
        }))
      );
    }

    const { types: activeProviderTypes, ids: activeProviderIds } = await this.activeProviders();

    const health = computeHealth(
      draft.filterValues,
      draft.contentType,
      activeProviderTypes,
      activeProviderIds
    );

    return {
      id: row.id,
      name: row.name,
      contentType: row.contentType as ContentType,
      filterValues: draft.filterValues,
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

    const filterValues: FilterValueEntry[] = fvRows.map((fv) => {
      const rule = getRule(fv.filterKey, row.contentType as ContentType);
      const dataType = rule?.dataType ?? 'string';
      const entry: FilterValueEntry = { key: fv.filterKey, value: coerceValue(fv.value, dataType) };
      if (fv.providerId !== null) entry.providerId = fv.providerId;
      return entry;
    });

    const health = computeHealth(
      filterValues,
      row.contentType as ContentType,
      activeProviderTypes,
      activeProviderIds
    );

    return {
      id: row.id,
      name: row.name,
      contentType: row.contentType as ContentType,
      filterValues,
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
      record.filterValues,
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
