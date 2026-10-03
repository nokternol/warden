import { buildContainer } from '@server/container';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createSystemProcedures } from '@server/modules/system';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectErrorResponse, expectSuccessResponse } from '@tests/helpers/api';
import express, { type Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration test demonstrating:
 * - Full Express app setup with middleware
 * - Database initialization with :memory:
 * - Container-based dependency injection
 * - API testing with createApiClient helper
 * - Response assertions with expectSuccessResponse helper
 * - Test data generation with createMockConfig factory
 */
describe('Health API Integration', () => {
  let app: Express;
  let client: ReturnType<typeof createApiClient>;

  beforeAll(async () => {
    // 1. Load test configuration
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      PORT: 5057,
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });

    // Set env vars for loadConfig()
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }

    const config = loadConfig();

    // 2. Initialize database (in-memory for tests)
    const db = await initializeDatabase(config);

    // 3. Build DI container
    const container = buildContainer({ config, db });

    // 4. Create Express app with middleware
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    // 5. Mount the system procedures — no user is signed in, health is public
    app.use(serveApi({ system: createSystemProcedures(container.cradle) }));

    // 6. Error handler must be last
    app.use(errorHandlerMiddleware);

    // 7. Create test client
    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('GET /api/health', () => {
    it('returns health status with system info', async () => {
      const response = await client.get('/api/health');
      const data = expectSuccessResponse(response);

      expect(data).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        environment: 'test',
        version: expect.any(String),
      });
    });

    it('includes request ID in response headers', async () => {
      const response = await client.get('/api/health');

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    });

    it('timestamp is valid ISO 8601 format', async () => {
      const response = await client.get('/api/health');
      const data = expectSuccessResponse(response);

      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
    });
  });

  describe('Error Handling', () => {
    it('returns 404 for unknown endpoints', async () => {
      const response = await client.get('/api/unknown');

      // No 404 handler registered yet, so Express returns 404 with no body
      expect(response.status).toBe(404);
    });

    it('handles malformed JSON gracefully', async () => {
      const response = await client.post('/api/health', 'invalid-json' as unknown as object, {
        headers: { 'Content-Type': 'application/json' },
      });

      // Express json parser throws error, caught by error handler
      const error = expectErrorResponse(response, 500);
      expect(error.message).toContain('not valid JSON');
    });
  });
});
