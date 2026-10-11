import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '../kernel/db';

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
  TMDB_API_KEY: 'test-tmdb-key',
  SESSION_SECRET: 'test-session-secret',
};

describe('database', () => {
  afterEach(async () => {
    await _resetDatabase();
  });

  describe('initializeDatabase', () => {
    it('successfully initializes with valid config', async () => {
      const db = await initializeDatabase(testConfig);
      expect(db).toBeDefined();
    });

    it('returns the same db instance if already initialized', async () => {
      const first = await initializeDatabase(testConfig);
      const second = await initializeDatabase(testConfig);
      expect(second).toBe(first);
    });

    it('creates the missing directory of a file DB_PATH and migrates into it', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'warden-db-'));
      const dbPath = path.join(root, 'nested', 'db', 'warden.db');
      try {
        const db = await initializeDatabase({ ...testConfig, DB_PATH: dbPath });
        expect(db).toBeDefined();
        expect(existsSync(dbPath)).toBe(true);
      } finally {
        await _resetDatabase();
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('accepts :memory: as DB_PATH for in-memory testing', async () => {
      const db = await initializeDatabase(testConfig);
      expect(db).toBeDefined();
    });
  });

  describe('getDb', () => {
    it('throws if database not initialized', () => {
      expect(() => getDb()).toThrow('Database not initialized');
    });

    it('returns the db handle after initialization', async () => {
      const initialized = await initializeDatabase(testConfig);
      const retrieved = getDb();
      expect(retrieved).toBe(initialized);
    });
  });

  describe('_resetDatabase', () => {
    it('cleans up database state for tests', async () => {
      await initializeDatabase(testConfig);
      getDb(); // does not throw

      await _resetDatabase();

      expect(() => getDb()).toThrow('Database not initialized');
    });

    it('handles reset when database was never initialized', async () => {
      await expect(_resetDatabase()).resolves.not.toThrow();
    });
  });
});
