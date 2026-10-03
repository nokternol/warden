import { z } from 'zod';
import { getChildLogger } from './logger';

const log = getChildLogger('Config');

const configSchema = z
  .object({
    // Server
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5057),
    COMMIT_TAG: z.string().default('local'),

    // Logging
    LOG_LEVEL: z
      .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
      .default('info'),
    LOG_DIR: z.string().default('./config/logs'),

    // Database
    DB_PATH: z.string().default('./config/db/maintainarr.db'),
    DB_LOGGING: z
      .string()
      .default('false')
      .transform((v) => v === 'true' || v === '1'),

    // Network — 'true'/'1' → true, anything else → false
    TRUST_PROXY: z
      .string()
      .default('false')
      .transform((v) => v === 'true' || v === '1'),

    // TMDB Configuration
    TMDB_API_KEY: z.string().default('db55323b8d3e4154498498a75642b381'), // Public API key

    // Session Configuration
    SESSION_SECRET: z.string().default(() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SESSION_SECRET must be set in production');
      }
      // Generate random secret in development
      return require('node:crypto').randomBytes(32).toString('hex');
    }),

    // Development and browser tests only — 'true' answers every API procedure without a
    // signed-in user, so tools such as playwright-cli can drive the app without a Plex login.
    BYPASS_AUTH: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
  })
  .refine((config) => !(config.BYPASS_AUTH && config.NODE_ENV === 'production'), {
    message: 'BYPASS_AUTH must not be enabled in production',
    path: ['BYPASS_AUTH'],
  });

export type AppConfig = z.infer<typeof configSchema>;

let _config: AppConfig | null = null;

/**
 * Load and validate configuration from process.env.
 * Call once at server startup. Throws on invalid config.
 */
export function loadConfig(): AppConfig {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const errors = z.flattenError(result.error);
    log.error('Configuration validation failed', { errors });
    throw new Error(`Invalid configuration: ${JSON.stringify(errors.fieldErrors)}`);
  }

  _config = result.data;
  log.info('Configuration loaded', {
    env: _config.NODE_ENV,
    port: _config.PORT,
    logLevel: _config.LOG_LEVEL,
  });
  return _config;
}

/**
 * Get the loaded config. Throws if loadConfig() hasn't been called.
 */
export function getConfig(): AppConfig {
  if (!_config) {
    throw new Error('Config not loaded. Call loadConfig() at startup.');
  }
  return _config;
}

/**
 * Reset config state. Only for use in tests.
 */
export function _resetConfig(): void {
  _config = null;
}

/** Session time-to-live: 30 days in seconds. Used by both cookie maxAge and the session store. */
export const SESSION_TTL_SECONDS = 86400 * 30;
