import { MetadataProviderType } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import { getChildLogger } from '@server/kernel/logger';
import type { IdentityJobFactoryLike } from '@server/modules/system';
import { JellyfinProvider } from './connections/jellyfinProvider';
import { PlexProvider } from './connections/plexProvider';
import { RadarrProvider } from './connections/radarrProvider';
import { SonarrProvider } from './connections/sonarrProvider';
import { IdentityResolutionJob } from './identityResolutionJob';
import type { ProviderFactory } from './providerFactory';
import type { ProviderSettingsService } from './providerSettingsService';

const log = getChildLogger('IdentityJobFactory');

export interface IdentityJobFactoryDeps {
  db: DrizzleDb;
  providerSettingsService: ProviderSettingsService;
  providerFactory: ProviderFactory;
}

export class IdentityJobFactory implements IdentityJobFactoryLike {
  private readonly db: DrizzleDb;
  private readonly providerSettingsService: ProviderSettingsService;
  private readonly providerFactory: ProviderFactory;

  constructor(deps: IdentityJobFactoryDeps) {
    this.db = deps.db;
    this.providerSettingsService = deps.providerSettingsService;
    this.providerFactory = deps.providerFactory;
  }

  async create(): Promise<IdentityResolutionJob> {
    const providers = await this.providerSettingsService.findActiveByTypes([
      MetadataProviderType.RADARR,
      MetadataProviderType.SONARR,
      MetadataProviderType.PLEX,
      MetadataProviderType.JELLYFIN,
    ]);
    const instances = this.providerFactory.createInstances(providers, log);
    const movieSources = instances
      .filter((i) => i.provider instanceof RadarrProvider)
      .map((i) => ({
        providerId: i.settings.id,
        name: i.settings.name,
        provider: i.provider as RadarrProvider,
      }));
    const seriesSources = instances
      .filter((i) => i.provider instanceof SonarrProvider)
      .map((i) => ({
        providerId: i.settings.id,
        name: i.settings.name,
        provider: i.provider as SonarrProvider,
      }));
    const plex = instances.find((i) => i.provider instanceof PlexProvider);
    const jellyfin = instances.find((i) => i.provider instanceof JellyfinProvider);
    return new IdentityResolutionJob({
      db: this.db,
      movieSources,
      seriesSources,
      plexProvider: plex?.provider as PlexProvider | undefined,
      jellyfinProvider: jellyfin?.provider as JellyfinProvider | undefined,
      tvMazeLookup: this.providerFactory.createTvMaze(log),
    });
  }
}
