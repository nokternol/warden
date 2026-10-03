import { desc, eq, inArray, sql } from 'drizzle-orm';
import {
  automationRunItems,
  automationRuns,
  automations,
  mediaIdentity,
  mediaItems,
} from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { type MediaItem, sourceCopyIds } from '../media';

export interface AutomationRunDto {
  id: number;
  automationId: number;
  automationName: string;
  ranAt: Date;
  status: 'success' | 'error';
  itemCount: number | null;
  error: string | null;
  createdAt: Date;
}

/** One source copy a run targeted, titled through its group. */
export interface RunItemDto {
  mediaItemId: number;
  title: string | null;
  year: number | null;
  deleted: boolean;
}

export interface RunItemPage {
  data: RunItemDto[];
  total: number;
}

export interface CreateRunData {
  automationId: number;
  status: 'success' | 'error';
  itemCount?: number;
  error?: string;
  kind?: 'user' | 'system';
  targets?: MediaItem[];
}

export interface ListRunsOptions {
  automationId?: number;
  limit?: number;
  offset?: number;
}

function toDate(value: unknown): Date {
  return value as Date;
}

function rowToDto(row: {
  id: number;
  automationId: number;
  automationName: string;
  ranAt: unknown;
  status: string;
  itemCount: number | null;
  error: string | null;
  createdAt: unknown;
}): AutomationRunDto {
  return {
    id: row.id,
    automationId: row.automationId,
    automationName: row.automationName,
    ranAt: toDate(row.ranAt),
    status: row.status as 'success' | 'error',
    itemCount: row.itemCount ?? null,
    error: row.error ?? null,
    createdAt: toDate(row.createdAt),
  };
}

export class AutomationRunService {
  private readonly db: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.db = db;
  }

  /**
   * Writes the run row and its targeted source copies in one batch — a single
   * SQLite transaction, so a run is never recorded without its items.
   */
  async createRun(data: CreateRunData): Promise<AutomationRunDto> {
    const mediaItemIds = await sourceCopyIds(this.db, data.targets ?? []);
    const insertRun = this.db
      .insert(automationRuns)
      .values({
        automationId: data.automationId,
        ranAt: new Date(),
        status: data.status,
        itemCount: data.itemCount ?? null,
        error: data.error ?? null,
        kind: data.kind ?? 'user',
      })
      .returning();
    const [[row]] =
      mediaItemIds.length > 0
        ? await this.db.batch([insertRun, this.linkToLatestRun(mediaItemIds)])
        : [await insertRun];

    const [automationRow] = await this.db
      .select({ name: automations.name })
      .from(automations)
      .where(eq(automations.id, data.automationId));

    return rowToDto({
      id: row.id,
      automationId: row.automationId,
      automationName: automationRow?.name ?? '',
      ranAt: row.ranAt,
      status: row.status,
      itemCount: row.itemCount ?? null,
      error: row.error ?? null,
      createdAt: row.createdAt,
    });
  }

  async listRuns(opts: ListRunsOptions = {}): Promise<AutomationRunDto[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    let query = this.db
      .select({
        id: automationRuns.id,
        automationId: automationRuns.automationId,
        automationName: automations.name,
        ranAt: automationRuns.ranAt,
        status: automationRuns.status,
        itemCount: automationRuns.itemCount,
        error: automationRuns.error,
        createdAt: automationRuns.createdAt,
      })
      .from(automationRuns)
      .innerJoin(automations, eq(automationRuns.automationId, automations.id))
      .orderBy(desc(automationRuns.ranAt), desc(automationRuns.id))
      .limit(limit)
      .offset(offset)
      .$dynamic();

    if (opts.automationId !== undefined) {
      query = query.where(eq(automationRuns.automationId, opts.automationId));
    }

    const rows = await query;
    return rows.map(rowToDto);
  }

  /**
   * Links source copies to the run row inserted earlier in the same batch.
   * Inside that write transaction the newest run id is that row's id.
   */
  private linkToLatestRun(mediaItemIds: number[]) {
    return this.db.insert(automationRunItems).select(
      this.db
        .select({
          runId: sql<number>`(SELECT max(${automationRuns.id}) FROM ${automationRuns})`.as('runId'),
          mediaItemId: mediaItems.id,
        })
        .from(mediaItems)
        .where(inArray(mediaItems.id, mediaItemIds))
    );
  }

  async listRunItems(runId: number): Promise<RunItemPage> {
    const data = await this.db
      .select({
        mediaItemId: mediaItems.id,
        title: mediaIdentity.title,
        year: mediaIdentity.year,
        deleted: mediaItems.deleted,
      })
      .from(automationRunItems)
      .innerJoin(mediaItems, eq(automationRunItems.mediaItemId, mediaItems.id))
      .innerJoin(mediaIdentity, eq(mediaItems.mediaIdentityId, mediaIdentity.id))
      .where(eq(automationRunItems.runId, runId));
    return { data, total: data.length };
  }
}
