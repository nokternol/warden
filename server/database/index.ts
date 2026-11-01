import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { type Client, createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { AppConfig } from '../kernel/config';
import { getChildLogger } from '../kernel/logger';
import * as schema from './schema';

const log = getChildLogger('Database');

export type DrizzleDb = LibSQLDatabase<typeof schema> & { $client: Client };

let _db: DrizzleDb | null = null;
let _client: ReturnType<typeof createClient> | null = null;

/**
 * Initialize the Drizzle database connection and run migrations.
 * Call once at server startup. Throws on connection failure.
 */
export async function initializeDatabase(config: AppConfig): Promise<DrizzleDb> {
  if (_db) {
    log.warn('Database already initialized, skipping');
    return _db;
  }

  try {
    let url = ':memory:';
    if (config.DB_PATH !== ':memory:') {
      const dbFile = path.resolve(process.cwd(), config.DB_PATH);
      // SQLite creates the file but not its directory, so a fresh config volume would otherwise
      // fail to open.
      mkdirSync(path.dirname(dbFile), { recursive: true });
      url = `file:${dbFile}`;
    }

    log.info('Initializing database connection', { url });

    _client = createClient({ url });
    _db = drizzle(_client, { schema });

    await migrate(_db, {
      migrationsFolder: path.resolve(__dirname, 'migrations'),
    });

    log.info('Database connection established and migrations applied');

    return _db;
  } catch (error) {
    // A libsql error's fields do not serialize, so the message is logged explicitly.
    log.error('Failed to initialize database', {
      message: error instanceof Error ? error.message : String(error),
      dbPath: config.DB_PATH,
    });
    _db = null;
    _client = null;
    throw error;
  }
}

/**
 * Get the initialized Drizzle db handle. Throws if not initialized.
 */
export function getDb(): DrizzleDb {
  if (!_db) {
    throw new Error('Database not initialized. Call initializeDatabase() at startup.');
  }
  return _db;
}

/**
 * Close the database connection. Used for graceful shutdown.
 */
export async function closeDatabase(): Promise<void> {
  if (_client) {
    log.info('Closing database connection');
    _client.close();
    _client = null;
    _db = null;
  }
}

/**
 * Reset database state. Only for use in tests.
 */
export async function _resetDatabase(): Promise<void> {
  await closeDatabase();
}
