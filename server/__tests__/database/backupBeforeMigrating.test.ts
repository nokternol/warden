import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { backUpBeforeMigrating } from '@server/database/index';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const MIGRATIONS = path.resolve(__dirname, '../../database/migrations');

describe('backUpBeforeMigrating', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'warden-backup-'));
    file = path.join(dir, 'warden.db');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const database = async (applied: number) => {
    const client = createClient({ url: `file:${file}` });
    await client.execute('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY)');
    for (let i = 0; i < applied; i += 1)
      await client.execute('INSERT INTO __drizzle_migrations DEFAULT VALUES');
    return client;
  };

  it('copies a database with migrations pending, named for where it was', async () => {
    const client = await database(3);
    await backUpBeforeMigrating(client, file, MIGRATIONS);
    const backup = `${file}.before-migration-3`;
    expect(existsSync(backup)).toBe(true);
    expect(readFileSync(backup)).toEqual(readFileSync(file));
    client.close();
  });

  it('copies nothing when no migration is pending', async () => {
    const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, 'meta/_journal.json'), 'utf-8'));
    const client = await database(journal.entries.length);
    await backUpBeforeMigrating(client, file, MIGRATIONS);
    expect(existsSync(`${file}.before-migration-${journal.entries.length}`)).toBe(false);
    client.close();
  });

  it('has nothing to copy on a new install', async () => {
    const client = createClient({ url: `file:${file}` });
    await backUpBeforeMigrating(client, file, MIGRATIONS);
    expect(existsSync(`${file}.before-migration-0`)).toBe(false);
    client.close();
  });
});
