# Database

Drizzle ORM over libSQL (SQLite). One schema file, hand-written SQL migrations applied automatically at
startup, and a typed db handle injected everywhere through the container.

## Layout

```
server/database/
  index.ts        # initializeDatabase() / getDb() / closeDatabase() — the DrizzleDb handle
  schema.ts       # All tables, enums, and relations (single schema module)
  columns/        # Custom column types: bit (INTEGER↔boolean), datetime (TEXT↔Date, UTC)
  migrations/     # Numbered .sql migrations + drizzle meta journal
  drizzleStore.ts # express-session store backed by the sessions table
```

## Core pattern: fail-fast init, guarded access

`initializeDatabase(config)` is called once at startup: it creates the libSQL client
(`file:` path from `DB_PATH`, creating its parent directory first, or `:memory:` for tests), builds the Drizzle handle with the full schema,
and **runs pending migrations** from `migrations/`. It throws on failure — the server does not start on
a broken database. After startup, code gets the handle via `getDb()`, which throws if initialization
never ran. The handle type is `DrizzleDb` (`LibSQLDatabase<typeof schema>` plus the raw `$client`).

The handle is registered in the container as `db` and injected into services:

```typescript
export class MediaQueryService {
  private readonly db: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.db = db;
  }

  async list() {
    return this.db.select().from(mediaQueries).orderBy(mediaQueries.createdAt);
  }
}
```

## Schema

Everything lives in `schema.ts`: `sqliteTable(...)` definitions, plain-TypeScript enums (SQLite has no
enum type — e.g. `MetadataProviderType`), and the shared column helpers. Use the custom column types
for booleans and dates so driver values stay consistent:

```typescript
import { bit } from './columns/bit';
import { createdAt, updatedAt } from './columns/datetime';
```

Query with the standard Drizzle builders (`db.select().from(...)`, `eq`, `and`, `inArray`, …) — there
is no repository layer.

## Migrations

Migrations are **hand-written SQL files** in `migrations/`, numbered (`0013_media_rule_range_collapse.sql`)
and tracked by the drizzle meta journal. They are applied automatically by `migrate()` inside
`initializeDatabase()` — there is no separate migrate command to run.

To add one: write the `.sql` file, register it in `migrations/meta/_journal.json`, and update
`schema.ts` to match. `drizzle-kit` (configured via `drizzle.config.ts`) is available for generating a
starting point, but the checked-in artifact is the SQL itself — review and edit it rather than trusting
generation.

## Testing

Tests run against `:memory:` databases: `initializeDatabase` with `DB_PATH: ':memory:'` gives each
suite a fresh schema (migrations run on init). `_resetDatabase()` closes and clears the handle between
suites. Integration tests build a real app over the in-memory db via the container — see
`server/__tests__/integration/`.

## Sessions

`drizzleStore.ts` implements the `express-session` store contract (`get`/`set`/`destroy`/`touch` +
`purgeExpired`) over a sessions table, so auth sessions live in the same SQLite file as everything else.

## Troubleshooting

- **"database is locked"** — SQLite dislikes concurrent writers: make sure only one server instance is
  running and no orphaned process holds the file open.
- **Migration failed at startup** — the server refuses to boot by design. Fix the SQL (or the journal
  entry) rather than working around the crash.
