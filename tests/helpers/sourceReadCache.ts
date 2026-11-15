import type { ContentType } from '@contract/schemas';
import { DomainEventBus } from '@server/kernel/eventBus';
import { MediaSourceFactory } from '@server/modules/media/mediaSourceFactory';
import { SourceReadCache } from '@server/modules/media/sourceReadCache';
import {
  type IProviderFactory,
  ProviderFactory,
  type ProviderSettingsService,
  type RadarrMovie,
} from '@server/modules/providers';

/**
 * A `SourceReadCache` over the active instances `providerSettingsService` holds, connected
 * through `providerFactory`, wired as the container wires it. Each call builds its own cache.
 */
export function sourceReadCacheOver(
  providerSettingsService: ProviderSettingsService,
  providerFactory: IProviderFactory = new ProviderFactory()
): SourceReadCache {
  return new SourceReadCache({
    mediaSourceFactory: new MediaSourceFactory({ providerSettingsService, providerFactory }),
    eventBus: new DomainEventBus(),
  });
}

/** A `SourceReadCache` whose active Radarr instances hold exactly these rows. */
export function sourceReadCacheHolding(
  reads: Array<{ providerId: number; name?: string; rows: RadarrMovie[] }>
): SourceReadCache {
  const instances = reads.map(({ providerId, name = 'Radarr', rows }) => ({
    providerId,
    name,
    provider: { getMovies: async () => rows },
  }));
  return new SourceReadCache({
    mediaSourceFactory: {
      activeInstances: (async (contentType: ContentType) =>
        contentType === 'movie'
          ? instances
          : []) as unknown as MediaSourceFactory['activeInstances'],
    },
    eventBus: new DomainEventBus(),
  });
}
