/**
 * The facts filter readiness judges with, read from the database in one pass.
 *
 * Run: vitest run --project server
 */
import { MetadataProviderType, metadataProviders } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { DomainEventBus } from '@server/kernel/eventBus';
import { FilterReadiness } from '@server/modules/media/filterReadiness';
import { LibraryCache } from '@server/modules/media/libraryCache';
import {
  ProviderSettingsService,
  recordRefreshFailed,
  recordRefreshed,
} from '@server/modules/providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testConfig = {
  NODE_ENV: 'test',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  LOG_LEVEL: 'error',
} as AppConfig;

describe('FilterReadiness.readFacts', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('reads every provider instance, and every facts refresh record from the library cache', async () => {
    const db = getDb();
    const [radarr, plex, tautulli] = await db
      .insert(metadataProviders)
      .values([
        { type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://r' },
        { type: MetadataProviderType.PLEX, name: 'Plex', url: 'http://p', isActive: false },
        { type: MetadataProviderType.TAUTULLI, name: 'Tautulli', url: 'http://t' },
      ])
      .returning();
    await recordRefreshed(db, radarr.id, 'catalog');
    await recordRefreshed(db, plex.id, 'facts');
    await recordRefreshFailed(db, tautulli.id, 'facts', 'down');
    const libraryCache = new LibraryCache({ db, eventBus: new DomainEventBus() });
    const read = vi.spyOn(libraryCache, 'read');

    const facts = await new FilterReadiness({
      providerSettingsService: new ProviderSettingsService({ db }),
      libraryCache,
    }).readFacts();

    expect(read).toHaveBeenCalledOnce();

    expect(facts.providers).toEqual([
      { id: radarr.id, type: MetadataProviderType.RADARR, isActive: true },
      { id: plex.id, type: MetadataProviderType.PLEX, isActive: false },
      { id: tautulli.id, type: MetadataProviderType.TAUTULLI, isActive: true },
    ]);
    expect(facts.factsRecords).toEqual(
      expect.arrayContaining([
        { providerId: plex.id, refreshedAt: expect.any(Number), failedAt: null },
        { providerId: tautulli.id, refreshedAt: null, failedAt: expect.any(Number) },
      ])
    );
    expect(facts.factsRecords).toHaveLength(2);
  });
});
