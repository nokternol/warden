import {
  MetadataProviderType,
  enrichmentField,
  mediaIdentity,
  metadataProviders,
} from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { eq } from 'drizzle-orm';
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

describe('EnrichmentQueries', () => {
  let tautulliId: number;
  let plexId: number;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    [{ id: tautulliId }, { id: plexId }] = await getDb()
      .insert(metadataProviders)
      .values([
        { type: MetadataProviderType.TAUTULLI, name: 'Tautulli', url: 'http://t' },
        { type: MetadataProviderType.PLEX, name: 'Plex', url: 'http://p' },
      ])
      .returning({ id: metadataProviders.id });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  async function title() {
    const [row] = await getDb().insert(mediaIdentity).values({ contentType: 'movie' }).returning();
    return row.id;
  }

  it('round-trips each fact with its type and the provider that reported it', async () => {
    const id = await title();
    const queries = new EnrichmentQueries({ db: getDb() });

    await queries.replaceProviderFacts(
      tautulliId,
      new Map([[id, { playCount: 3, productionStatus: 'In "Production"' }]])
    );

    expect(await queries.allFacts()).toEqual([
      { mediaIdentityId: id, providerId: tautulliId, field: 'playCount', value: 3 },
      {
        mediaIdentityId: id,
        providerId: tautulliId,
        field: 'productionStatus',
        value: 'In "Production"',
      },
    ]);
  });

  it("replaces only that provider's facts, dropping titles and fields it no longer reports", async () => {
    const a = await title();
    const b = await title();
    const queries = new EnrichmentQueries({ db: getDb() });
    await queries.replaceProviderFacts(
      tautulliId,
      new Map([
        [a, { playCount: 1 }],
        [b, { playCount: 2 }],
      ])
    );
    await queries.replaceProviderFacts(plexId, new Map([[a, { playCount: 7 }]]));

    await queries.replaceProviderFacts(tautulliId, new Map([[b, { playCount: 4 }]]));

    expect(await queries.allFacts()).toEqual(
      expect.arrayContaining([
        { mediaIdentityId: a, providerId: plexId, field: 'playCount', value: 7 },
        { mediaIdentityId: b, providerId: tautulliId, field: 'playCount', value: 4 },
      ])
    );
    expect(await queries.allFacts()).toHaveLength(2);
  });

  it('throws when a field key has no seeded enrichment_field row (migration/ReportedFacts drift)', async () => {
    const id = await title();
    const queries = new EnrichmentQueries({ db: getDb() });
    // Simulates seed drift: a key ReportedFacts declares but the migration never seeded.
    await getDb().delete(enrichmentField).where(eq(enrichmentField.key, 'productionStatus'));

    await expect(
      queries.replaceProviderFacts(tautulliId, new Map([[id, { productionStatus: 'Released' }]]))
    ).rejects.toThrow(/productionStatus/);
  });
});
