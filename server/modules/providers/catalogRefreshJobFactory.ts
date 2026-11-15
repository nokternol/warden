import { MetadataProviderType } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import { getChildLogger } from '@server/kernel/logger';
import type { CatalogRefreshJobFactoryLike } from '@server/modules/system';
import { CatalogRefreshJob } from './catalogRefreshJob';
import { JellyfinProvider } from './connections/jellyfinProvider';
import { PlexProvider } from './connections/plexProvider';
import { RadarrProvider } from './connections/radarrProvider';
import { SonarrProvider } from './connections/sonarrProvider';
import type { ProviderFactory } from './providerFactory';
import type { ProviderSettingsService } from './providerSettingsService';

const log = getChildLogger('CatalogRefreshJobFactory');

export interface CatalogRefreshJobFactoryDeps {
  db: DrizzleDb;
  providerSettingsService: ProviderSettingsService;
  providerFactory: ProviderFactory;
}

export class CatalogRefreshJobFactory implements CatalogRefreshJobFactoryLike {
  private readonly db: DrizzleDb;
  private readonly providerSettingsService: ProviderSettingsService;
  private readonly providerFactory: ProviderFactory;

  constructor(deps: CatalogRefreshJobFactoryDeps) {
    this.db = deps.db;
    this.providerSettingsService = deps.providerSettingsService;
    this.providerFactory = deps.providerFactory;
  }

  async create(): Promise<CatalogRefreshJob> {
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
    const listSources = [...movieSources, ...seriesSources];
    const plex = instances.find((i) => i.provider instanceof PlexProvider);
    const jellyfin = instances.find((i) => i.provider instanceof JellyfinProvider);
    return new CatalogRefreshJob({
      db: this.db,
      movieSources,
      seriesSources,
      listSources,
      plexSource: plex && {
        providerId: plex.settings.id,
        name: plex.settings.name,
        provider: plex.provider as PlexProvider,
      },
      jellyfinSource: jellyfin && {
        providerId: jellyfin.settings.id,
        name: jellyfin.settings.name,
        provider: jellyfin.provider as JellyfinProvider,
      },
      tvMazeLookup: this.providerFactory.createTvMaze(log),
    });
  }
}
