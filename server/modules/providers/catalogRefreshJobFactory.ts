import type { DrizzleDb } from '@server/kernel/db';
import { getChildLogger } from '@server/kernel/logger';
import type { CatalogRefreshJobFactoryLike } from '@server/modules/system';
import { CatalogRefreshJob } from './catalogRefreshJob';
import { MEDIA_SERVER_BY_COLUMN, SOURCE_OWNER } from './providerCatalogue';
import type { ProviderFactory } from './providerFactory';
import type { ProviderSettingsService } from './providerSettingsService';

const log = getChildLogger('CatalogRefreshJobFactory');

/** The provider types the catalog refresh reads: each declaring `source` or `mediaServer`. */
const REFRESHED_TYPES = [...Object.values(SOURCE_OWNER), ...Object.values(MEDIA_SERVER_BY_COLUMN)];

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
    const rows = await this.providerSettingsService.findActiveByTypes(REFRESHED_TYPES);
    const movieSources = this.providerFactory.movieSourcesOf(rows, log);
    const seriesSources = this.providerFactory.seriesSourcesOf(rows, log);
    return new CatalogRefreshJob({
      db: this.db,
      movieSources,
      seriesSources,
      listSources: [...movieSources, ...seriesSources],
      plexSource: this.providerFactory.plexServerOf(rows, log),
      jellyfinSource: this.providerFactory.jellyfinServerOf(rows, log),
      tvMazeLookup: this.providerFactory.tvMazeLookup(log),
    });
  }
}
