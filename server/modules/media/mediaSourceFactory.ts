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

/** The connection each content type's owning provider type exposes. */
interface SourceConnection {
  movie: RadarrProvider;
  series: SonarrProvider;
}

/** One active instance owning a content type, with its connection built. */
export interface SourceInstance<C extends ContentType = ContentType> {
  providerId: number;
  name: string;
  provider: SourceConnection[C];
}

export class MediaSourceFactory {
  constructor(private readonly deps: Deps) {}

  /**
   * Every active instance owning `contentType` (by `SOURCE_OWNER`), each with its connection built.
   * The one place the catalog's source instances are chosen: browse, the saved-query preview and
   * pooled runs all read through it. Never collapsed to one.
   */
  async activeInstances<C extends ContentType>(contentType: C): Promise<SourceInstance<C>[]> {
    const settingsList = await this.deps.providerSettingsService.findActiveByTypes([
      SOURCE_OWNER[contentType],
    ]);
    return settingsList.map((settings) => ({
      providerId: settings.id,
      name: settings.name,
      provider: this.deps.providerFactory.create(settings, log) as SourceConnection[C],
    }));
  }

  /** One entry per active instance owning `contentType`. Never collapsed to one. */
  async sourcesFor(contentType: ContentType): Promise<MediaSourceEntry[]> {
    const instances = await this.activeInstances(contentType);
    return instances.map(({ providerId, name, provider }) => ({
      providerId,
      name,
      source: mediaSourceFor(provider, providerId),
    }));
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
