import type { AutomationStatus } from '@contract/schemas';
import type { ContentType } from '@contract/schemas';
import { Cron } from 'croner';
import { type SQL, eq, inArray } from 'drizzle-orm';
import {
  type Automation as AutomationRow,
  MetadataProviderType,
  type NewAutomation,
  automationQueries,
  automations,
  mediaQueries,
  metadataProviders,
} from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../../kernel/errors';
import { readEnabledTaskIds } from '../providers';

export interface AutomationQueryDraft {
  queryId: number;
  role: 'include' | 'exclude';
  sortOrder?: number;
}

export interface AutomationDraft {
  name: string;
  queries: AutomationQueryDraft[];
  providerId: number;
  taskId: string;
  /** The value for a parameterized task (a provider-native id as a string). */
  taskParameter?: string;
  schedule: string;
}

export interface AutomationQueryDto {
  queryId: number;
  role: 'include' | 'exclude';
  sortOrder: number;
}

export interface AutomationDto {
  id: number;
  name: string;
  kind: 'user' | 'system';
  query: { id: number; name: string; contentType: ContentType } | null;
  queries: AutomationQueryDto[];
  provider: { id: number; name: string; type: string } | null;
  taskId: string;
  /** Present only when the task is parameterized and the automation stores a value. */
  taskParameter?: string;
  schedule: string;
  status: AutomationStatus;
  lastRun?: {
    at: string;
    itemCount: number;
    status: 'success' | 'error';
    error?: string;
  };
  nextRun?: string;
  createdAt: string;
  updatedAt: string;
}

function computeNextRun(schedule: string): string | undefined {
  try {
    const job = new Cron(schedule, { paused: true });
    const next = job.nextRun();
    job.stop();
    return next?.toISOString();
  } catch {
    return undefined;
  }
}

const CONTENT_TYPE_PROVIDERS: Record<ContentType, MetadataProviderType[]> = {
  movie: [
    MetadataProviderType.RADARR,
    MetadataProviderType.PLEX,
    MetadataProviderType.JELLYFIN,
    MetadataProviderType.TAUTULLI,
  ],
  series: [
    MetadataProviderType.SONARR,
    MetadataProviderType.PLEX,
    MetadataProviderType.JELLYFIN,
    MetadataProviderType.TAUTULLI,
  ],
};

function rowToDto(
  row: AutomationRow,
  query: { id: number; name: string; contentType: string } | null,
  provider: { id: number; name: string; type: string } | null,
  queries: AutomationQueryDto[] = []
): AutomationDto {
  const dto: AutomationDto = {
    id: row.id,
    name: row.name,
    kind: (row.kind ?? 'user') as 'user' | 'system',
    query: query
      ? { id: query.id, name: query.name, contentType: query.contentType as ContentType }
      : null,
    queries,
    provider: provider ? { id: provider.id, name: provider.name, type: provider.type } : null,
    taskId: row.taskId,
    taskParameter: row.taskParameter ?? undefined,
    schedule: row.schedule,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.lastRunAt) {
    dto.lastRun = {
      at: row.lastRunAt,
      itemCount: row.lastRunItemCount ?? 0,
      status: (row.lastRunStatus as 'success' | 'error') ?? 'success',
      error: row.lastRunError ?? undefined,
    };
  }

  if (row.status === 'active') {
    dto.nextRun = computeNextRun(row.schedule);
  }

  return dto;
}

export class AutomationService {
  private readonly db: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.db = db;
  }

  async getById(id: number): Promise<AutomationDto> {
    const rows = await this.db
      .select({
        automation: automations,
        providerId: metadataProviders.id,
        providerName: metadataProviders.name,
        providerType: metadataProviders.type,
      })
      .from(automations)
      .leftJoin(metadataProviders, eq(automations.providerId, metadataProviders.id))
      .where(eq(automations.id, id));

    if (rows.length === 0) throw new NotFoundError(`Automation ${id} not found`);
    const r = rows[0];
    const provider =
      r.providerId != null && r.providerName != null && r.providerType != null
        ? { id: r.providerId, name: r.providerName, type: r.providerType }
        : null;

    const queryRows = await this.db
      .select({
        queryId: automationQueries.queryId,
        role: automationQueries.role,
        sortOrder: automationQueries.sortOrder,
        queryName: mediaQueries.name,
        queryContentType: mediaQueries.contentType,
      })
      .from(automationQueries)
      .leftJoin(mediaQueries, eq(mediaQueries.id, automationQueries.queryId))
      .where(eq(automationQueries.automationId, id))
      .orderBy(automationQueries.sortOrder);

    const queries: AutomationQueryDto[] = queryRows.map((s) => ({
      queryId: s.queryId,
      role: s.role as 'include' | 'exclude',
      sortOrder: s.sortOrder,
    }));

    const firstInclude = queryRows.find((s) => s.role === 'include') ?? null;
    const query =
      firstInclude?.queryName && firstInclude?.queryContentType
        ? {
            id: firstInclude.queryId,
            name: firstInclude.queryName,
            contentType: firstInclude.queryContentType,
          }
        : null;

    return rowToDto(r.automation, query, provider, queries);
  }

  async list(options?: { kind?: 'user' | 'system' }): Promise<AutomationDto[]> {
    const where: SQL | undefined = options?.kind ? eq(automations.kind, options.kind) : undefined;
    const rows = await this.db
      .select({
        automation: automations,
        providerId: metadataProviders.id,
        providerName: metadataProviders.name,
        providerType: metadataProviders.type,
      })
      .from(automations)
      .leftJoin(metadataProviders, eq(automations.providerId, metadataProviders.id))
      .where(where)
      .orderBy(automations.createdAt);

    if (rows.length === 0) return [];

    const automationIds = rows.map((r) => r.automation.id);
    const queryRows = await this.db
      .select({
        automationId: automationQueries.automationId,
        queryId: automationQueries.queryId,
        role: automationQueries.role,
        sortOrder: automationQueries.sortOrder,
        queryName: mediaQueries.name,
        queryContentType: mediaQueries.contentType,
      })
      .from(automationQueries)
      .leftJoin(mediaQueries, eq(mediaQueries.id, automationQueries.queryId))
      .where(inArray(automationQueries.automationId, automationIds))
      .orderBy(automationQueries.sortOrder);

    const queriesByAutomationId = new Map<number, typeof queryRows>();
    for (const s of queryRows) {
      const existing = queriesByAutomationId.get(s.automationId) ?? [];
      existing.push(s);
      queriesByAutomationId.set(s.automationId, existing);
    }

    return rows.map((r) => {
      const automationQueryRows = queriesByAutomationId.get(r.automation.id) ?? [];
      const queries: AutomationQueryDto[] = automationQueryRows.map((s) => ({
        queryId: s.queryId,
        role: s.role as 'include' | 'exclude',
        sortOrder: s.sortOrder,
      }));
      const firstInclude = automationQueryRows.find((s) => s.role === 'include') ?? null;
      const query =
        firstInclude?.queryName && firstInclude?.queryContentType
          ? {
              id: firstInclude.queryId,
              name: firstInclude.queryName,
              contentType: firstInclude.queryContentType,
            }
          : null;
      const provider =
        r.providerId != null && r.providerName != null && r.providerType != null
          ? { id: r.providerId, name: r.providerName, type: r.providerType }
          : null;
      return rowToDto(r.automation, query, provider, queries);
    });
  }

  async create(draft: AutomationDraft): Promise<AutomationDto> {
    try {
      new Cron(draft.schedule, { paused: true }).stop();
    } catch {
      throw new Error(`Invalid cron expression: ${draft.schedule}`);
    }

    if (draft.queries.length > 1) {
      const allQueryIds = draft.queries.map((s) => s.queryId);
      const contentTypeRows = await this.db
        .select({ contentType: mediaQueries.contentType })
        .from(mediaQueries)
        .where(inArray(mediaQueries.id, allQueryIds));
      const distinct = new Set(contentTypeRows.map((r) => r.contentType));
      if (distinct.size > 1) {
        throw new ValidationError('All queries of an automation must share the same contentType');
      }
    }

    const [providerRow] = await this.db
      .select({ type: metadataProviders.type, settings: metadataProviders.settings })
      .from(metadataProviders)
      .where(eq(metadataProviders.id, draft.providerId));
    const providerType = providerRow?.type as MetadataProviderType | undefined;

    if (providerRow) {
      const settings = providerRow.settings
        ? (JSON.parse(providerRow.settings) as Record<string, unknown>)
        : null;
      if (!readEnabledTaskIds(settings).includes(draft.taskId)) {
        throw new ValidationError(
          `Task "${draft.taskId}" is not enabled on provider instance ${draft.providerId}`
        );
      }
    }

    const includeQueries = draft.queries.filter((s) => s.role === 'include');
    if (includeQueries.length > 0 && providerType) {
      const [queryRow] = await this.db
        .select({ contentType: mediaQueries.contentType })
        .from(mediaQueries)
        .where(eq(mediaQueries.id, includeQueries[0].queryId));

      if (queryRow) {
        const contentType = queryRow.contentType as ContentType;
        const allowed = CONTENT_TYPE_PROVIDERS[contentType] ?? [];
        if (!allowed.includes(providerType)) {
          throw new ValidationError(
            `Provider type "${providerType}" is not compatible with contentType "${contentType}"`
          );
        }
      }
    }

    const insert: NewAutomation = {
      name: draft.name.trim(),
      providerId: draft.providerId,
      taskId: draft.taskId,
      taskParameter: draft.taskParameter ?? null,
      schedule: draft.schedule,
      status: 'active',
    };

    const [row] = await this.db.insert(automations).values(insert).returning();

    if (draft.queries.length > 0) {
      await this.db.insert(automationQueries).values(
        draft.queries.map((s, i) => ({
          automationId: row.id,
          queryId: s.queryId,
          role: s.role,
          sortOrder: s.sortOrder ?? i,
        }))
      );
    }

    return this.getById(row.id);
  }

  private async assertMutable(id: number): Promise<void> {
    const [existing] = await this.db
      .select({ id: automations.id, kind: automations.kind })
      .from(automations)
      .where(eq(automations.id, id));
    if (!existing) throw new NotFoundError(`Automation ${id} not found`);
    if (existing.kind === 'system')
      throw new ForbiddenError('System automations cannot be modified');
  }

  async updateStatus(id: number, status: AutomationStatus): Promise<AutomationDto> {
    await this.assertMutable(id);
    await this.db
      .update(automations)
      .set({ status, updatedAt: new Date() })
      .where(eq(automations.id, id));
    return this.getById(id);
  }

  async delete(id: number): Promise<void> {
    await this.assertMutable(id);
    await this.db.delete(automations).where(eq(automations.id, id));
  }

  async listActive(): Promise<{ id: number; name: string; schedule: string }[]> {
    return this.db
      .select({ id: automations.id, name: automations.name, schedule: automations.schedule })
      .from(automations)
      .where(eq(automations.status, 'active'));
  }

  async recordRun(
    id: number,
    result: { itemCount: number; status: 'success' | 'error'; error?: string }
  ): Promise<void> {
    await this.db
      .update(automations)
      .set({
        lastRunAt: new Date().toISOString(),
        lastRunItemCount: result.itemCount,
        lastRunStatus: result.status,
        lastRunError: result.error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(automations.id, id));
  }
}
