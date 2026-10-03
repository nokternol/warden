import type { ContentType } from '@contract/schemas';
import type { MetadataProviderType } from '@server/database/schema';
import { getChildLogger } from '@server/kernel/logger';
import {
  type IProviderFactory,
  type ProviderSettingsService,
  type RadarrProvider,
  SOURCE_OWNER,
  type SonarrProvider,
} from '@server/modules/providers';
import type { MediaSource } from './mediaSource';
import { mediaSourceFor } from './sourceAdapters';

const log = getChildLogger('MediaSourceFactory');

interface Deps {
  providerSettingsService: ProviderSettingsService;
  providerFactory: IProviderFactory;
}

/** One active instance owning a content type, bound as a `MediaSource`. */
export interface MediaSourceEntry {
  providerId: number;
  name: string;
  source: MediaSource;
}

export class MediaSourceFactory {
  constructor(private readonly deps: Deps) {}

  /** One entry per active instance owning `contentType`. Never collapsed to one. */
  async sourcesFor(contentType: ContentType): Promise<MediaSourceEntry[]> {
    const settingsList = await this.deps.providerSettingsService.findActiveByTypes([
      SOURCE_OWNER[contentType],
    ]);
    return settingsList.map((settings) => {
      const provider = this.deps.providerFactory.create(settings, log) as
        | RadarrProvider
        | SonarrProvider;
      return {
        providerId: settings.id,
        name: settings.name,
        source: mediaSourceFor(provider, settings.id),
      };
    });
  }
}

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
