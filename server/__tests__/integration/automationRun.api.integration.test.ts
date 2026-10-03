import { buildContainer } from '@server/container';
import { automations } from '@server/database/schema';
/**
 * POST /api/automations/:id/run — Phase 3 Run Now
 * Async 202 + background execute; unknown id → 404; kind-agnostic and ignores paused.
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createAutomationProcedures } from '@server/modules/automations';
import { createMockConfig } from '@tests/factories';
import { createApiClient } from '@tests/helpers/api';
import express, { type Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('POST /api/automations/:id/run — Phase 3', () => {
  let client: ReturnType<typeof createApiClient>;
  let systemAutomationId: number;

  async function runsFor(automationId: number): Promise<unknown[]> {
    const res = await client.get(`/api/automations/runs?automationId=${automationId}`);
    return (res.body as { data: { data: unknown[] } }).data.data;
  }

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      PORT: 5093,
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }

    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });

    // A system automation with an unrecognised task fails fast and deterministically —
    // it records a run without depending on any external provider HTTP.
    const [systemRow] = await db
      .insert(automations)
      .values({ name: 'sys:noop', taskId: 'system:noop', schedule: '0 * * * *', kind: 'system' })
      .returning();
    systemAutomationId = systemRow.id;

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use(serveApi({ automations: createAutomationProcedures(container.cradle) }));
    app.use(errorHandlerMiddleware);

    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('returns 202 immediately and records a run for the automation', async () => {
    const res = await client.post(`/api/automations/${systemAutomationId}/run`);

    expect(res.status).toBe(202);
    await expect.poll(async () => (await runsFor(systemAutomationId)).length).toBeGreaterThan(0);
  });

  it('returns 404 for an unknown automation id', async () => {
    const res = await client.post('/api/automations/999999/run');

    expect(res.status).toBe(404);
  });

  it('runs a paused automation once (status is not a gate)', async () => {
    const [paused] = await getDb()
      .insert(automations)
      .values({
        name: 'sys:paused',
        taskId: 'system:noop',
        schedule: '0 * * * *',
        kind: 'system',
        status: 'paused',
      })
      .returning();

    const res = await client.post(`/api/automations/${paused.id}/run`);

    expect(res.status).toBe(202);
    await expect.poll(async () => (await runsFor(paused.id)).length).toBeGreaterThan(0);
  });
});
