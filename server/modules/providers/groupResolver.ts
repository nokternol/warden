import type { ContentType } from '@contract/schemas';
import { mediaIdentity } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import { and, eq } from 'drizzle-orm';

export interface GroupIds {
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
  tvMazeId?: number;
  title?: string;
  year?: number;
}

const PRIMARY_COLUMN: Record<
  ContentType,
  typeof mediaIdentity.tmdbId | typeof mediaIdentity.tvdbId
> = {
  movie: mediaIdentity.tmdbId,
  series: mediaIdentity.tvdbId,
};

/**
 * Find-or-create the logical group (`media_identity` row) an item's ids belong to.
 * Never merges two existing groups — a find always resolves to exactly one group,
 * and identifiers are only ever filled onto it (never overwritten), per the design's
 * "grouping: find-or-create, never merge" decision.
 */
export async function resolveGroup(
  db: DrizzleDb,
  kind: ContentType,
  ids: GroupIds
): Promise<number> {
  const primaryId = kind === 'movie' ? ids.tmdbId : ids.tvdbId;
  const primaryColumn = PRIMARY_COLUMN[kind];

  if (primaryId !== undefined) {
    const [existing] = await db
      .select()
      .from(mediaIdentity)
      .where(and(eq(mediaIdentity.kind, kind), eq(primaryColumn, primaryId)));
    if (existing) {
      await fillMissingIdentifiers(db, existing, ids);
      return existing.id;
    }
    return insertGroup(db, kind, ids);
  }

  if (ids.imdbId !== undefined) {
    const [existing] = await db
      .select()
      .from(mediaIdentity)
      .where(and(eq(mediaIdentity.kind, kind), eq(mediaIdentity.imdbId, ids.imdbId)));
    if (existing) {
      await fillMissingIdentifiers(db, existing, ids);
      return existing.id;
    }
  }

  if (ids.title !== undefined && ids.year !== undefined) {
    const [existing] = await db
      .select()
      .from(mediaIdentity)
      .where(
        and(
          eq(mediaIdentity.kind, kind),
          eq(mediaIdentity.title, ids.title),
          eq(mediaIdentity.year, ids.year)
        )
      );
    if (existing) {
      await fillMissingIdentifiers(db, existing, ids);
      return existing.id;
    }
  }

  return insertGroup(db, kind, ids);
}

async function insertGroup(db: DrizzleDb, kind: ContentType, ids: GroupIds): Promise<number> {
  const [row] = await db
    .insert(mediaIdentity)
    .values({
      kind,
      tmdbId: ids.tmdbId ?? null,
      tvdbId: ids.tvdbId ?? null,
      imdbId: ids.imdbId ?? null,
      tvMazeId: ids.tvMazeId ?? null,
      title: ids.title ?? null,
      year: ids.year ?? null,
    })
    .returning({ id: mediaIdentity.id });
  return row.id;
}

/** Merges `ids` onto `existing` only where the group's own column is NULL — never overwrites. */
async function fillMissingIdentifiers(
  db: DrizzleDb,
  existing: typeof mediaIdentity.$inferSelect,
  ids: GroupIds
): Promise<void> {
  const fills: Partial<typeof mediaIdentity.$inferInsert> = {};
  if (existing.tmdbId === null && ids.tmdbId !== undefined) fills.tmdbId = ids.tmdbId;
  if (existing.tvdbId === null && ids.tvdbId !== undefined) fills.tvdbId = ids.tvdbId;
  if (existing.imdbId === null && ids.imdbId !== undefined) fills.imdbId = ids.imdbId;
  if (existing.tvMazeId === null && ids.tvMazeId !== undefined) fills.tvMazeId = ids.tvMazeId;
  if (existing.title === null && ids.title !== undefined) fills.title = ids.title;
  if (existing.year === null && ids.year !== undefined) fills.year = ids.year;
  if (Object.keys(fills).length === 0) return;

  await db.update(mediaIdentity).set(fills).where(eq(mediaIdentity.id, existing.id));
}
