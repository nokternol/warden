import { buildContainer } from '@server/container';
import { MetadataProviderType, automations, mediaIdentity } from '@server/database/schema';
/**
 * Integration test for Phase 1 — system task execution via DI (D1).
 *
 * Resolves AutomationExecutor from the real container and executes the seeded
 * `system:enrichment` automation. Asserts the enrichment job runs through the
 * SystemTaskRunner and marks the identity enriched — i.e. the system tick no
 * longer throws "has no provider".
 *
 * Run: yarn vitest run --project server server/__tests__/integration/system.task.execution.integration.test.ts
 */
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import type { DrizzleDb } from '@server/kernel/db';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { ensureSystemJobs } from '@server/modules/system/ensureSystemJobs';
import { createMockConfig } from '@tests/factories';
import { server } from '@tests/mocks/server';
import { eq } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('system task execution via container — system:enrichment', () => {
  let db: DrizzleDb;
  let container: ReturnType<typeof buildContainer>;

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    db = await initializeDatabase(config);
    container = buildContainer({ config, db });
    await ensureSystemJobs(db);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('executes the seeded system:enrichment automation and marks the identity enriched', async () => {
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 603, resolvedAt: 0 })
      .returning();

    const [enrichmentAutomation] = await db
      .select({ id: automations.id })
      .from(automations)
      .where(eq(automations.taskId, 'system:enrichment'));

    await container.cradle.automationExecutor.execute(enrichmentAutomation.id);

    const [updated] = await db
      .select()
      .from(mediaIdentity)
      .where(eq(mediaIdentity.id, identity.id));
    expect(updated.enrichedAt).not.toBeNull();
  });

  it('resolves an active Seerr provider so enrichment writes a non-null seerrRequestStatus', async () => {
    server.use(
      http.get('http://overseerr.test/api/v1/request', () =>
        HttpResponse.json({
          results: [
            {
              id: 1,
              status: 2,
              type: 'movie',
              requestedBy: { id: 1, displayName: 'u', email: 'u@u.com' },
              media: { tmdbId: 700, title: 'X' },
              createdAt: '',
            },
          ],
        })
      ),
      http.get('http://overseerr.test/api/v1/issue', () => HttpResponse.json({ results: [] }))
    );
    await container.cradle.providerSettingsService.create({
      type: MetadataProviderType.SEERR,
      name: 'Seerr',
      url: 'http://overseerr.test',
      apiKey: 'k',
    });
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 700, resolvedAt: 0 })
      .returning();
    const [enrichmentAutomation] = await db
      .select({ id: automations.id })
      .from(automations)
      .where(eq(automations.taskId, 'system:enrichment'));

    await container.cradle.automationExecutor.execute(enrichmentAutomation.id);

    const fields = await new EnrichmentQueries({ db }).getByIdentityIds([identity.id]);
    expect(fields.get(identity.id)?.seerrRequestStatus).toBe(2);
  });
});
