import fs from 'node:fs';
import path from 'node:path';
import { type Client, createClient } from '@libsql/client';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');

function readStatements(tag: string): string[] {
  return fs
    .readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf-8')
    .split('--> statement-breakpoint')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter((s) => s.length > 0);
}

function journalTags(): string[] {
  const journal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf-8')
  );
  return (journal.entries as Array<{ tag: string }>).map((e) => e.tag);
}

/**
 * An in-memory database migrated up to, but not including, `tag` — the shape of an
 * install that has not yet received that migration. Legacy rows are written with raw
 * SQL, then `applyMigration(client, tag)` runs the migration under test against them.
 */
export async function databaseBefore(tag: string): Promise<Client> {
  const client = createClient({ url: ':memory:' });
  for (const earlier of journalTags()) {
    if (earlier === tag) break;
    await applyMigration(client, earlier);
  }
  return client;
}

export async function applyMigration(client: Client, tag: string): Promise<void> {
  for (const statement of readStatements(tag)) {
    await client.execute(statement);
  }
}
