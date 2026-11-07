/**
 * The facts filter readiness judges with, read from the database in one pass.
 *
 * Run: vitest run --project server
 */
import { MetadataProviderType, mediaIdentity, metadataProviders } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { FilterReadiness } from '@server/modules/media/filterReadiness';
import { ProviderSettingsService } from '@server/modules/providers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  PORT: 5057,
  COMMIT_TAG: 'test',
  LOG_LEVEL: 'error',
  LOG_DIR: './config/logs',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  TRUST_PROXY: false,
  BYPASS_AUTH: false,
  TMDB_API_KEY: '',
  SESSION_SECRET: 'test-secret',
};

describe('FilterReadiness.readFacts', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('reads every provider instance, the latest enrichment outcome, and which fields hold values', async () => {
    const db = getDb();
    const [radarr, plex] = await db
      .insert(metadataProviders)
      .values([
        { type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://r' },
        { type: MetadataProviderType.PLEX, name: 'Plex', url: 'http://p', isActive: false },
      ])
      .returning();
    const [movie] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    await new EnrichmentQueries({ db }).replaceFields(movie.id, { playCount: 2, labels: ['x'] });

    const facts = await new FilterReadiness({
      providerSettingsService: new ProviderSettingsService({ db }),
      enrichmentQueries: new EnrichmentQueries({ db }),
      enrichmentOutcomeSource: { latestEnrichmentStatus: async () => 'error' },
    }).readFacts();

    expect(facts).toEqual({
      providers: [
        { id: radarr.id, type: MetadataProviderType.RADARR, isActive: true },
        { id: plex.id, type: MetadataProviderType.PLEX, isActive: false },
      ],
      latestEnrichment: 'error',
      fieldsWithValues: { movie: new Set(['playCount', 'labels']), series: new Set() },
    });
  });
});
