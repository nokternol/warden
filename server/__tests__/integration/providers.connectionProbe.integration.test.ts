import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Integration tests for GET /api/providers/test: which provider types the API
 * will probe. The probe itself is covered in modules/providers/connectionProbe.test.ts.
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createProvidersProcedures } from '@server/modules/providers';
import { createMockConfig } from '@tests/factories';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { http, HttpResponse } from 'msw';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('GET /api/providers/test', () => {
  let authedApp: Express;

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
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });
    const providerRoutes = serveApi({
      providers: createProvidersProcedures(container.cradle, () => {}),
    });

    authedApp = express();
    authedApp.use(express.json());
    authedApp.use(requestIdMiddleware);
    authedApp.use((_req: Request, _res: Response, next: NextFunction) => {
      _req.user = {
        id: 1,
        email: 'test@example.com',
        plexUsername: 'testuser',
        plexId: null,
        avatar: null,
        userType: 'plex',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      next();
    });
    authedApp.use(providerRoutes);
    authedApp.use(errorHandlerMiddleware);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // ---------------------------------------------------------------------------
  // A type that is not offered
  // ---------------------------------------------------------------------------

  it('probes a Seerr provider at its status endpoint', async () => {
    const SEERR_URL = 'http://seerr.local';
    server.use(http.get(`${SEERR_URL}/api/v1/auth/me`, () => HttpResponse.json({ status: 'ok' })));

    const res = await request(authedApp)
      .get('/api/providers/test')
      .query({ type: MetadataProviderType.SEERR, url: SEERR_URL, apiKey: 'k' });

    expect(res.status).toBe(200);
  });

  it("probes with a saved provider's stored key when given its id", async () => {
    const SEERR_URL = 'http://seerr-stored.local';
    let seenKey: string | null = null;
    server.use(
      http.get(`${SEERR_URL}/api/v1/auth/me`, ({ request: upstream }) => {
        seenKey = upstream.headers.get('X-Api-Key');
        return HttpResponse.json({ status: 'ok' });
      })
    );
    const created = await request(authedApp)
      .post('/api/providers')
      .send({ type: MetadataProviderType.SEERR, name: 'Seerr', url: SEERR_URL, apiKey: 'stored' });

    const res = await request(authedApp)
      .get('/api/providers/test')
      .query({ type: MetadataProviderType.SEERR, url: SEERR_URL, id: created.body.data.id });

    expect(res.status).toBe(200);
    expect(seenKey).toBe('stored');

    // The key stays with the host it was saved for.
    const OTHER_URL = 'http://elsewhere.local';
    let contacted = false;
    server.use(
      http.get(`${OTHER_URL}/api/v1/auth/me`, () => {
        contacted = true;
        return HttpResponse.json({ status: 'ok' });
      })
    );
    const elsewhere = await request(authedApp)
      .get('/api/providers/test')
      .query({ type: MetadataProviderType.SEERR, url: OTHER_URL, id: created.body.data.id });
    expect(elsewhere.body.data.ok).toBe(false);
    expect(elsewhere.body.data.error).toMatch(/enter the api key/i);
    expect(contacted).toBe(false);
  });

  it('refuses to probe a type that is not offered, without contacting it', async () => {
    const OMDB_URL = 'http://omdb.local';
    let contacted = false;
    server.use(
      http.get(`${OMDB_URL}/*`, () => {
        contacted = true;
        return HttpResponse.json({});
      }),
      http.get(OMDB_URL, () => {
        contacted = true;
        return HttpResponse.json({});
      })
    );

    const res = await request(authedApp)
      .get('/api/providers/test')
      .query({ type: MetadataProviderType.OMDB, url: OMDB_URL, apiKey: 'k' });

    expect(res.status).toBe(400);
    expect(contacted).toBe(false);
  });
});
