import { MetadataProviderType } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { getChildLogger } from '../../kernel/logger';
import type { EnrichmentJobFactoryLike } from '../../modules/system';
import type { ProviderFactory, ProviderSettingsService } from '../providers';
import type { EnrichmentQueries } from './enrichment/enrichment.queries';
import { EnrichmentJob } from './enrichmentJob';

const log = getChildLogger('EnrichmentJobFactory');

export interface EnrichmentJobFactoryDeps {
  db: DrizzleDb;
  enrichmentQueries: EnrichmentQueries;
  providerSettingsService: ProviderSettingsService;
  providerFactory: ProviderFactory;
}

/** Builds an Enrichment run over every active provider whose type declares the facts it reports. */
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
    const rows = await this.providerSettingsService.findActiveByTypes(
      Object.values(MetadataProviderType)
    );
    return new EnrichmentJob({
      db: this.db,
      enrichmentQueries: this.enrichmentQueries,
      reporters: this.providerFactory.factReportersOf(rows, log),
    });
  }
}
