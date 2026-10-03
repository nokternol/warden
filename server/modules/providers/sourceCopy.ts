import type { ContentType } from '@contract/schemas';
import { mediaItems } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import { type GroupIds, resolveGroup } from './groupResolver';

/** One configured instance's copy of a title, as its catalog reports it. */
export interface SourceCopy {
  kind: ContentType;
  providerId: number;
  externalId: number;
  /** The identifiers that place the copy in its `media_identity` group. */
  ids: GroupIds;
}

/**
 * Records a source copy the identity job has not seen yet: its group is
 * found or created through `resolveGroup`, exactly as the job would, and its
 * `media_item` row is written. Returns that row's id.
 */
export async function recordSourceCopy(db: DrizzleDb, copy: SourceCopy): Promise<number> {
  const mediaIdentityId = await resolveGroup(db, copy.kind, copy.ids);
  const [created] = await db
    .insert(mediaItems)
    .values({ providerId: copy.providerId, externalId: copy.externalId, mediaIdentityId })
    .returning({ id: mediaItems.id });
  return created.id;
}
