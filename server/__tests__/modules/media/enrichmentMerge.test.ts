import {
  MetadataProviderType,
  mediaIdentity,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { mergeEnrichment } from '@server/modules/media/enrichmentMerge';
import type { NormalizedMovie } from '@server/modules/media/movie';
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

function movie(providerId: number, externalId: number, title: string): NormalizedMovie {
  return { _sourceIds: { radarr: externalId, providerId }, title };
}

describe('mergeEnrichment', () => {
  let radarrId: number;
  let radarr4kId: number;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const db = getDb();
    [{ id: radarrId }] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://radarr' })
      .returning({ id: metadataProviders.id });
    [{ id: radarr4kId }] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr 4k', url: 'http://radarr4k' })
      .returning({ id: metadataProviders.id });
  });
  afterEach(async () => {
    await _resetDatabase();
  });

  it('maps enrichment onto the matching item by (providerId, externalId)', async () => {
    const db = getDb();
    const queries = new EnrichmentQueries({ db });
    const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    await db
      .insert(mediaItems)
      .values({ providerId: radarrId, externalId: 1, mediaIdentityId: identity.id });
    await queries.replaceFields(identity.id, {
      playCount: 3,
      overseerrRequestStatus: 2,
      overseerrHasIssue: true,
      tmdbStatus: 'Released',
      plexAddedAt: '2023-11-14T22:13:20.000Z',
    });

    const items = [movie(radarrId, 1, 'Enriched'), movie(radarrId, 2, 'Bare')];
    await mergeEnrichment(db, queries, items);

    expect(items[0]).toMatchObject({
      playCount: 3,
      overseerrRequestStatus: 2,
      overseerrHasIssue: true,
      tmdbStatus: 'Released',
      plexAddedAt: '2023-11-14T22:13:20.000Z',
    });
    // No item/enrichment for externalId 2 → left untouched.
    expect(items[1].playCount).toBeUndefined();
    expect(items[1].overseerrRequestStatus).toBeUndefined();
  });

  it('leaves fields undefined when the enrichment row holds no value for them', async () => {
    const db = getDb();
    const queries = new EnrichmentQueries({ db });
    const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    await db
      .insert(mediaItems)
      .values({ providerId: radarrId, externalId: 5, mediaIdentityId: identity.id });
    // No replaceFields call at all — identity has zero enrichment rows.

    const items = [movie(radarrId, 5, 'NullEnrichment')];
    await mergeEnrichment(db, queries, items);

    expect(items[0].playCount).toBeUndefined();
    expect(items[0].overseerrRequestStatus).toBeUndefined();
    expect(items[0].tmdbStatus).toBeUndefined();
    expect(items[0].plexAddedAt).toBeUndefined();
  });

  it('no-ops when no items carry a providerId/externalId pair', async () => {
    const db = getDb();
    const queries = new EnrichmentQueries({ db });
    const items: NormalizedMovie[] = [{ _sourceIds: {}, title: 'No source id' }];
    await expect(mergeEnrichment(db, queries, items)).resolves.toBeUndefined();
    expect(items[0].playCount).toBeUndefined();
  });

  it('correctly attributes enrichment for a batch spanning two instances that share one group', async () => {
    const db = getDb();
    const queries = new EnrichmentQueries({ db });
    const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    // Both instances' copies resolve to the same group — group-level enrichment is
    // read identically by both: watched-ness is a fact about the title, not the copy.
    await db.insert(mediaItems).values([
      { providerId: radarrId, externalId: 1, mediaIdentityId: identity.id },
      { providerId: radarr4kId, externalId: 99, mediaIdentityId: identity.id },
    ]);
    await queries.replaceFields(identity.id, { playCount: 4 });

    const items = [movie(radarrId, 1, 'SD copy'), movie(radarr4kId, 99, '4k copy')];
    await mergeEnrichment(db, queries, items);

    expect(items[0].playCount).toBe(4);
    expect(items[1].playCount).toBe(4);
  });

  it("does not cross-attribute enrichment between two instances' distinct copies with colliding external ids", async () => {
    const db = getDb();
    const queries = new EnrichmentQueries({ db });
    const [identityA] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    const [identityB] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    // Both instances happen to use raw id 1 for unrelated titles.
    await db.insert(mediaItems).values([
      { providerId: radarrId, externalId: 1, mediaIdentityId: identityA.id },
      { providerId: radarr4kId, externalId: 1, mediaIdentityId: identityB.id },
    ]);
    await queries.replaceFields(identityA.id, { playCount: 1 });
    await queries.replaceFields(identityB.id, { playCount: 9 });

    const items = [movie(radarrId, 1, 'A'), movie(radarr4kId, 1, 'B')];
    await mergeEnrichment(db, queries, items);

    expect(items[0].playCount).toBe(1);
    expect(items[1].playCount).toBe(9);
  });
});
