import { buildContainer } from '@server/container';
/**
 * Container wiring tests — verify singleton invariants for services that
 * carry no per-request state and must not be captured stale by singletons.
 *
 * Run: vitest run --project server
 */
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
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

describe('Container wiring', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  describe('singleton invariant for DB-backed services', () => {
    it('resolves automationService as the same instance on every resolution', () => {
      const db = getDb();
      const container = buildContainer({ config: testConfig, db });

      const a = container.cradle.automationService;
      const b = container.cradle.automationService;

      expect(a).toBe(b);
    });

    it('resolves providerSettingsService as the same instance on every resolution', () => {
      const db = getDb();
      const container = buildContainer({ config: testConfig, db });

      const a = container.cradle.providerSettingsService;
      const b = container.cradle.providerSettingsService;

      expect(a).toBe(b);
    });

    it('resolves mediaQueryService as the same instance on every resolution', () => {
      const db = getDb();
      const container = buildContainer({ config: testConfig, db });

      const a = container.cradle.mediaQueryService;
      const b = container.cradle.mediaQueryService;

      expect(a).toBe(b);
    });

    it('automationExecutor holds the same automationService instance the container resolves', () => {
      const db = getDb();
      const container = buildContainer({ config: testConfig, db });

      const executor = container.cradle.automationExecutor;
      const service = container.cradle.automationService;

      // The executor was constructed with the singleton service; the container
      // must return that same instance when resolved directly.
      expect((executor as unknown as { automationService: unknown }).automationService).toBe(
        service
      );
    });

    it('resolves automationRunService as the same instance on every resolution', () => {
      const db = getDb();
      const container = buildContainer({ config: testConfig, db });

      const a = container.cradle.automationRunService;
      const b = container.cradle.automationRunService;

      expect(a).toBe(b);
    });

    it('automationExecutor holds the same providerSettingsService instance the container resolves', () => {
      const db = getDb();
      const container = buildContainer({ config: testConfig, db });

      const executor = container.cradle.automationExecutor;
      const service = container.cradle.providerSettingsService;

      expect(
        (executor as unknown as { providerSettingsService: unknown }).providerSettingsService
      ).toBe(service);
    });
  });
});
