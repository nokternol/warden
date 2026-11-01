import type { AutomationRunStatus, ContentType, RunItemDto } from '@contract/schemas';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  automationRunItems,
  automationRuns,
  automations,
  mediaIdentity,
  mediaItems,
} from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { type MediaItem, ensureSourceCopies } from '../media';

export interface AutomationRunDto {
  id: number;
  automationId: number;
  automationName: string;
  ranAt: Date;
  status: AutomationRunStatus;
  itemCount: number | null;
  error: string | null;
  createdAt: Date;
}

export interface RunItemPage {
  data: RunItemDto[];
  total: number;
}

/** The catalog items a user run acted on, all of its query's content type. */
export interface RunTargets {
  contentType: ContentType;
  items: MediaItem[];
}

export interface CreateRunData {
  automationId: number;
  status: AutomationRunStatus;
  itemCount?: number;
  error?: string;
  kind?: 'user' | 'system';
  targets?: RunTargets;
}

/** A window onto a listing; unset fields fall back to the first page. */
export interface PageRequest {
  limit?: number;
  offset?: number;
}

export const INTERRUPTED_RUN_ERROR =
  'Warden stopped during this run, so some of its items may have changed.';

const DEFAULT_PAGE_SIZE = 50;

export interface ListRunsOptions extends PageRequest {
  automationId?: number;
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
    status: row.status as AutomationRunStatus,
    itemCount: row.itemCount ?? null,
    error: row.error ?? null,
    createdAt: toDate(row.createdAt),
  };
}

/** A run row with its automation's name — the columns every run listing reads. */
const RUN_COLUMNS = {
  id: automationRuns.id,
  automationId: automationRuns.automationId,
  automationName: automations.name,
  ranAt: automationRuns.ranAt,
  status: automationRuns.status,
  itemCount: automationRuns.itemCount,
  error: automationRuns.error,
  createdAt: automationRuns.createdAt,
};

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
    const mediaItemIds = data.targets
      ? await ensureSourceCopies(this.db, data.targets.contentType, data.targets.items)
      : [];
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

  /** Records that a run has started, with its targets, before anything is acted on. */
  async beginRun(data: { automationId: number; kind: 'user' | 'system'; targets: RunTargets }) {
    return this.createRun({
      ...data,
      status: 'running',
      itemCount: data.targets.items.length,
    });
  }

  async finishRun(
    runId: number,
    outcome: { status: AutomationRunStatus; itemCount: number; error?: string }
  ): Promise<AutomationRunDto> {
    await this.db
      .update(automationRuns)
      .set({ status: outcome.status, itemCount: outcome.itemCount, error: outcome.error ?? null })
      .where(eq(automationRuns.id, runId));
    const [row] = await this.db
      .select(RUN_COLUMNS)
      .from(automationRuns)
      .innerJoin(automations, eq(automationRuns.automationId, automations.id))
      .where(eq(automationRuns.id, runId));
    return rowToDto(row);
  }

  /** A run still marked running at startup was cut off: its task may have acted on some items. */
  async closeInterruptedRuns(): Promise<void> {
    await this.db
      .update(automationRuns)
      .set({ status: 'error', error: INTERRUPTED_RUN_ERROR })
      .where(eq(automationRuns.status, 'running'));
  }

  async countRuns(opts: Pick<ListRunsOptions, 'automationId'> = {}): Promise<number> {
    return this.db.$count(
      automationRuns,
      opts.automationId === undefined
        ? undefined
        : eq(automationRuns.automationId, opts.automationId)
    );
  }

  async listRuns(opts: ListRunsOptions = {}): Promise<AutomationRunDto[]> {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;

    let query = this.db
      .select(RUN_COLUMNS)
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
   * `last_insert_rowid()` cannot name it: this INSERT … SELECT re-reads it per
   * row, and each link row it inserts moves it to that row's own rowid.
   */
  private linkToLatestRun(mediaItemIds: number[]) {
    return this.db.insert(automationRunItems).select(
      this.db
        .select({
          id: sql<number>`NULL`.as('id'),
          runId: sql<number>`(SELECT max(${automationRuns.id}) FROM ${automationRuns})`.as('runId'),
          mediaItemId: mediaItems.id,
          title: mediaIdentity.title,
          year: mediaIdentity.year,
        })
        .from(mediaItems)
        .innerJoin(mediaIdentity, eq(mediaItems.mediaIdentityId, mediaIdentity.id))
        .where(inArray(mediaItems.id, mediaItemIds))
    );
  }

  async listRunItems(runId: number, page: PageRequest = {}): Promise<RunItemPage> {
    const rows = await this.db
      .select({
        id: automationRunItems.id,
        mediaItemId: automationRunItems.mediaItemId,
        title: automationRunItems.title,
        year: automationRunItems.year,
        deleted: mediaItems.deleted,
      })
      .from(automationRunItems)
      .leftJoin(mediaItems, eq(automationRunItems.mediaItemId, mediaItems.id))
      .where(eq(automationRunItems.runId, runId))
      .orderBy(asc(automationRunItems.title), asc(automationRunItems.id))
      .limit(page.limit ?? DEFAULT_PAGE_SIZE)
      .offset(page.offset ?? 0);
    // A link with no media row left targeted a title Warden no longer holds.
    const data = rows.map((row) => ({ ...row, deleted: row.deleted ?? true }));
    const total = await this.db.$count(automationRunItems, eq(automationRunItems.runId, runId));
    return { data, total };
  }

  async listItemRuns(mediaItemId: number): Promise<AutomationRunDto[]> {
    const rows = await this.db
      .select(RUN_COLUMNS)
      .from(automationRunItems)
      .innerJoin(automationRuns, eq(automationRunItems.runId, automationRuns.id))
      .innerJoin(automations, eq(automationRuns.automationId, automations.id))
      .where(eq(automationRunItems.mediaItemId, mediaItemId))
      .orderBy(desc(automationRuns.ranAt), desc(automationRuns.id));
    return rows.map(rowToDto);
  }
}
