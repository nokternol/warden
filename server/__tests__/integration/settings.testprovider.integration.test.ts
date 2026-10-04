import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Integration tests for GET /api/providers/test
 *
 * Covers the two provider types that were missing from the probeProvider switch:
 *   - TVMAZE: no auth, no outbound call — should return { ok: true } immediately
 *   - SEERR:  same auth pattern as OVERSEERR — GET {base}/api/v1/status with X-Api-Key header
 *
 * Run: yarn vitest run --project server server/__tests__/integration/settings.testprovider.integration.test.ts
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createProviderSettingsProcedures } from '@server/modules/settings';
import { createMockConfig } from '@tests/factories';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { http, HttpResponse } from 'msw';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

describe('GET /api/providers/test — TVMAZE and SEERR', () => {
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
    const settingsRoutes = serveApi({
      providers: createProviderSettingsProcedures(container.cradle),
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
    authedApp.use(settingsRoutes);
    authedApp.use(errorHandlerMiddleware);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // afterEach MSW reset is handled by tests/setup/vitest.server.ts globally

  // ---------------------------------------------------------------------------
  // TVMAZE
  // ---------------------------------------------------------------------------

  describe('TVMAZE', () => {
    it('returns { ok: true } without making any outbound HTTP call', async () => {
      // Track any request that MSW intercepts and attempts to forward to a TVMaze host.
      // MSW in Node mode also intercepts supertest's loopback connections, so we filter
      // to only care about requests aimed at the TVMaze URL we passed in.
      const tvmazeRequests: string[] = [];
      const listener = ({ request: req }: { request: globalThis.Request }) => {
        // Only capture actual outbound requests to the TVMaze host,
        // not the supertest loopback request (127.0.0.1) whose query string
        // happens to contain the encoded TVMaze URL.
        const parsed = new URL(req.url);
        if (parsed.hostname.includes('tvmaze')) {
          tvmazeRequests.push(req.url);
        }
      };
      server.events.on('request:start', listener);

      const res = await request(authedApp)
        .get('/api/providers/test')
        .query({ type: MetadataProviderType.TVMAZE, url: 'https://api.tvmaze.com' });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ ok: true });
      // probeProvider should have returned early without touching the TVMaze URL
      expect(tvmazeRequests).toHaveLength(0);

      server.events.removeListener('request:start', listener);
    });
  });

  // ---------------------------------------------------------------------------
  // SEERR
  // ---------------------------------------------------------------------------

  describe('SEERR', () => {
    const SEERR_URL = 'http://seerr.local';

    it('returns { ok: true } when the upstream /api/v1/status responds 200', async () => {
      server.use(http.get(`${SEERR_URL}/api/v1/status`, () => HttpResponse.json({ status: 'ok' })));

      const res = await request(authedApp)
        .get('/api/providers/test')
        .query({ type: MetadataProviderType.SEERR, url: SEERR_URL, apiKey: 'test-key' });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ ok: true });
    });

    it('returns { ok: false } when the upstream /api/v1/status responds 4xx', async () => {
      server.use(
        http.get(`${SEERR_URL}/api/v1/status`, () =>
          HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
        )
      );

      const res = await request(authedApp)
        .get('/api/providers/test')
        .query({ type: MetadataProviderType.SEERR, url: SEERR_URL, apiKey: 'bad-key' });

      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(false);
    });

    it('returns { ok: false } when the upstream /api/v1/status responds 5xx', async () => {
      server.use(
        http.get(`${SEERR_URL}/api/v1/status`, () =>
          HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
        )
      );

      const res = await request(authedApp)
        .get('/api/providers/test')
        .query({ type: MetadataProviderType.SEERR, url: SEERR_URL, apiKey: 'any-key' });

      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(false);
    });

    it('sends the apiKey in the X-Api-Key header (not as a query param)', async () => {
      const API_KEY = 'secret-seerr-key';
      let capturedHeader: string | null = null;
      let capturedSearchParams: string | null = null;

      server.use(
        http.get(`${SEERR_URL}/api/v1/status`, ({ request: req }) => {
          capturedHeader = req.headers.get('X-Api-Key');
          capturedSearchParams = new URL(req.url).searchParams.toString();
          return HttpResponse.json({ status: 'ok' });
        })
      );

      const res = await request(authedApp)
        .get('/api/providers/test')
        .query({ type: MetadataProviderType.SEERR, url: SEERR_URL, apiKey: API_KEY });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ ok: true });
      expect(capturedHeader).toBe(API_KEY);
      // The key must not appear in the query string
      expect(capturedSearchParams).not.toContain(API_KEY);
    });
  });
});
