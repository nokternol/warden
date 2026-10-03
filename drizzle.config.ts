import type { Config } from 'drizzle-kit';

export default {
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  dialect: 'turso',
  dbCredentials: { url: `file:${process.env.DB_PATH ?? './config/db/warden.db'}` },
} satisfies Config;
