import { MetadataProviderType } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { getChildLogger } from '../../kernel/logger';
import type { EnrichmentJobFactoryLike } from '../../modules/system';
import type { ProviderFactory, ProviderSettingsService } from '../providers';
import {
  jellyfinEnricher,
  plexEnricher,
  seerrEnricher,
  tautulliEnricher,
  tmdbEnricher,
} from './enrichment/enricherAdapters';
import type { EnrichmentQueries } from './enrichment/enrichment.queries';
import { EnrichmentJob } from './enrichmentJob';

const log = getChildLogger('EnrichmentJobFactory');

export interface EnrichmentJobFactoryDeps {
  db: DrizzleDb;
  enrichmentQueries: EnrichmentQueries;
  providerSettingsService: ProviderSettingsService;
  providerFactory: ProviderFactory;
}

export class EnrichmentJobFactory implements EnrichmentJobFactoryLike {
  private readonly db: DrizzleDb;
  private readonly enrichmentQueries: EnrichmentQueries;
  private readonly providerSettingsService: ProviderSettingsService;
  private readonly providerFactory: ProviderFactory;

  constructor(deps: EnrichmentJobFactoryDeps) {
    this.db = deps.db;
    this.enrichmentQueries = deps.enrichmentQueries;
    this.providerSettingsService = deps.providerSettingsService;
    this.providerFactory = deps.providerFactory;
  }

  async create(): Promise<EnrichmentJob> {
    const providers = await this.providerSettingsService.findActiveByTypes([
      MetadataProviderType.TAUTULLI,
      MetadataProviderType.SEERR,
      MetadataProviderType.PLEX,
      MetadataProviderType.JELLYFIN,
      MetadataProviderType.TMDB,
    ]);
    const { tautulli, seerr, plex, jellyfin, tmdb } = this.providerFactory.createMany(
      providers,
      log
    );
    const enrichers = [
      tautulli && tautulliEnricher(tautulli),
      seerr && seerrEnricher(seerr),
      plex && plexEnricher(plex),
      jellyfin && jellyfinEnricher(jellyfin),
      tmdb && tmdbEnricher(tmdb),
    ].filter((e) => e !== undefined);
    return new EnrichmentJob({ db: this.db, enrichmentQueries: this.enrichmentQueries, enrichers });
  }
}
