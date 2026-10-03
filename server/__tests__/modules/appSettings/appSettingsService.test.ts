import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { AppSettingsService } from '@server/modules/appSettings/appSettingsService';
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

describe('AppSettingsService', () => {
  let service: AppSettingsService;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    service = new AppSettingsService({ db: getDb() });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('returns default primaryMediaServer PLEX and null region when no row exists', async () => {
    const settings = await service.get();
    expect(settings).toEqual({ region: null, primaryMediaServer: 'PLEX' });
  });

  it('persists an update and reflects it on the next get', async () => {
    await service.update({ region: 'US', primaryMediaServer: 'JELLYFIN' });
    const settings = await service.get();
    expect(settings).toEqual({ region: 'US', primaryMediaServer: 'JELLYFIN' });
  });
});
