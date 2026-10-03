import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetConfig, getConfig, loadConfig } from '../../kernel/config';

describe('config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    _resetConfig();
    // Clear relevant env vars so defaults apply
    for (const key of [
      'NODE_ENV',
      'PORT',
      'COMMIT_TAG',
      'LOG_LEVEL',
      'LOG_DIR',
      'DB_PATH',
      'TRUST_PROXY',
      'BYPASS_AUTH',
    ]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _resetConfig();
  });

  describe('loadConfig', () => {
    it('loads with defaults when no env vars are set', () => {
      const config = loadConfig();
      expect(config.NODE_ENV).toBe('development');
      expect(config.PORT).toBe(5057);
      expect(config.COMMIT_TAG).toBe('local');
      expect(config.LOG_LEVEL).toBe('info');
      expect(config.LOG_DIR).toBe('./config/logs');
      expect(config.DB_PATH).toBe('./config/db/warden.db');
      expect(config.TRUST_PROXY).toBe(false);
    });

    it('respects env var overrides', () => {
      Object.assign(process.env, { NODE_ENV: 'production' });
      process.env.PORT = '3000';
      process.env.LOG_LEVEL = 'debug';
      process.env.TRUST_PROXY = 'true';
      process.env.SESSION_SECRET = 'test-secret';

      const config = loadConfig();
      expect(config.NODE_ENV).toBe('production');
      expect(config.PORT).toBe(3000);
      expect(config.LOG_LEVEL).toBe('debug');
      expect(config.TRUST_PROXY).toBe(true);
    });

    it('coerces PORT from string to number', () => {
      process.env.PORT = '8080';
      const config = loadConfig();
      expect(config.PORT).toBe(8080);
      expect(typeof config.PORT).toBe('number');
    });

    it('rejects invalid PORT', () => {
      process.env.PORT = 'not-a-number';
      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('rejects PORT out of range', () => {
      process.env.PORT = '99999';
      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('rejects invalid NODE_ENV', () => {
      Object.assign(process.env, { NODE_ENV: 'staging' });
      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('rejects invalid LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'trace';
      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('handles TRUST_PROXY false string', () => {
      process.env.TRUST_PROXY = 'false';
      const config = loadConfig();
      expect(config.TRUST_PROXY).toBe(false);
    });

    it('handles TRUST_PROXY with "1"', () => {
      process.env.TRUST_PROXY = '1';
      const config = loadConfig();
      expect(config.TRUST_PROXY).toBe(true);
    });

    it('leaves the auth bypass off unless BYPASS_AUTH is "true"', () => {
      expect(loadConfig().BYPASS_AUTH).toBe(false);

      _resetConfig();
      process.env.BYPASS_AUTH = 'true';
      expect(loadConfig().BYPASS_AUTH).toBe(true);
    });

    it('refuses to start in production with the auth bypass on', () => {
      Object.assign(process.env, { NODE_ENV: 'production' });
      process.env.SESSION_SECRET = 'test-secret';
      process.env.BYPASS_AUTH = 'true';

      expect(() => loadConfig()).toThrow('Invalid configuration');
    });
  });

  describe('getConfig', () => {
    it('throws if loadConfig has not been called', () => {
      expect(() => getConfig()).toThrow('Config not loaded');
    });

    it('returns config after loadConfig has been called', () => {
      loadConfig();
      const config = getConfig();
      expect(config).toBeDefined();
      expect(config.PORT).toBe(5057);
    });
  });
});
