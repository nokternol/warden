import type { ContentType } from '@contract/schemas';
import type { MetadataProviderType } from '@server/database/schema';
import { SOURCE_OWNER } from '@server/modules/providers';

/** One content type's ownership, joined with whether the owner is configured. */
export interface MediaSourceDescriptor {
  contentType: ContentType;
  ownerType: MetadataProviderType;
  configured: boolean;
  /** Every active instance owning this content type — lets the client label
   *  per-instance options and know when instance qualification is needed. */
  instances: Array<{ id: number; name: string }>;
}

/**
 * Projects `SOURCE_OWNER` for the client: which provider type owns each
 * content type, whether an active instance of it exists, and every active instance
 * (never collapsed to one). The wire surface of the single ownership authority —
 * clients derive from this, never re-declare it.
 */
export function sourceOwnership(
  activeProviders: ReadonlyArray<{ id: number; name: string; type: MetadataProviderType }>
): MediaSourceDescriptor[] {
  return (Object.entries(SOURCE_OWNER) as [ContentType, MetadataProviderType][]).map(
    ([contentType, ownerType]) => {
      const instances = activeProviders
        .filter((p) => p.type === ownerType)
        .map((p) => ({ id: p.id, name: p.name }));
      return { contentType, ownerType, configured: instances.length > 0, instances };
    }
  );
}
