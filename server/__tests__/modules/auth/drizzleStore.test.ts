import { sessions } from '@server/database/schema';
/**
 * DrizzleStore — express-session compatible store backed by the sessions table.
 *
 * Tests are written against the public session.Store interface only; the
 * implementation details (Drizzle queries, column names) are not inspected
 * directly except where we need to seed data that the store itself cannot set.
 *
 * Run: vitest run --project server
 */
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { DrizzleStore } from '@server/modules/auth/drizzleStore';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Promisify store.get */
function storeGet(
  store: DrizzleStore,
  sid: string
): Promise<Express.SessionData | null | undefined> {
  return new Promise((resolve, reject) =>
    store.get(sid, (err, session) => (err ? reject(err) : resolve(session)))
  );
}

/** Promisify store.set */
function storeSet(store: DrizzleStore, sid: string, session: Express.SessionData): Promise<void> {
  return new Promise((resolve, reject) =>
    store.set(sid, session, (err) => (err ? reject(err) : resolve()))
  );
}

/** Promisify store.destroy */
function storeDestroy(store: DrizzleStore, sid: string): Promise<void> {
  return new Promise((resolve, reject) =>
    store.destroy(sid, (err) => (err ? reject(err) : resolve()))
  );
}

/** Promisify store.touch */
function storeTouch(store: DrizzleStore, sid: string, session: Express.SessionData): Promise<void> {
  return new Promise((resolve, reject) =>
    store.touch!(sid, session, (err) => (err ? reject(err) : resolve()))
  );
}

/** Minimal valid session data */
function makeSession(overrides: Partial<Express.SessionData> = {}): Express.SessionData {
  return {
    cookie: {
      originalMaxAge: 1000 * 60 * 60, // 1 hour
      maxAge: 1000 * 60 * 60,
      secure: false,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrizzleStore', () => {
  let store: DrizzleStore;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    store = new DrizzleStore({ db: getDb() });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  describe('set + get', () => {
    it('stores a session and retrieves it by sid', async () => {
      const session = makeSession();
      await storeSet(store, 'sid-1', session);

      const retrieved = await storeGet(store, 'sid-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.cookie).toBeDefined();
    });

    it('overwrites an existing session (upsert)', async () => {
      await storeSet(store, 'sid-1', makeSession());
      const updated = makeSession({ userId: 42 } as Express.SessionData & { userId: number });
      await storeSet(store, 'sid-1', updated);

      const retrieved = await storeGet(store, 'sid-1');
      expect((retrieved as Express.SessionData & { userId: number })?.userId).toBe(42);
    });
  });

  describe('get', () => {
    it('returns null for an unknown sid', async () => {
      const result = await storeGet(store, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns null for an expired session', async () => {
      // Seed an already-expired row directly into the DB
      const db = getDb();
      await db.insert(sessions).values({
        id: 'expired-sid',
        expiredAt: Date.now() - 1000, // 1 second in the past
        json: JSON.stringify(makeSession()),
      });

      const result = await storeGet(store, 'expired-sid');
      expect(result).toBeNull();
    });
  });

  describe('destroy', () => {
    it('removes the session so subsequent get returns null', async () => {
      await storeSet(store, 'sid-1', makeSession());
      await storeDestroy(store, 'sid-1');

      const result = await storeGet(store, 'sid-1');
      expect(result).toBeNull();
    });

    it('does not throw when destroying a non-existent sid', async () => {
      await expect(storeDestroy(store, 'ghost-sid')).resolves.not.toThrow();
    });
  });

  describe('touch', () => {
    it('extends the expiry of an existing session', async () => {
      const db = getDb();

      // Seed a session that will expire in ~100 ms
      const shortExpiry = Date.now() + 100;
      await db.insert(sessions).values({
        id: 'touch-sid',
        expiredAt: shortExpiry,
        json: JSON.stringify(makeSession()),
      });

      // Touch with a 1-hour maxAge — expiry should jump forward
      const session = makeSession();
      await storeTouch(store, 'touch-sid', session);

      const rows = await db.select().from(sessions);
      const updated = rows.find((r) => r.id === 'touch-sid');
      expect(updated?.expiredAt).toBeGreaterThan(shortExpiry + 1000);
    });

    it('does not throw when touching a non-existent sid', async () => {
      await expect(storeTouch(store, 'ghost-sid', makeSession())).resolves.not.toThrow();
    });
  });

  describe('purgeExpired (triggered by set)', () => {
    /** Seed a session directly into the DB bypassing store.set so the store's
     *  cleanup logic is not triggered during seeding. */
    async function seedExpired(id: string): Promise<void> {
      await getDb()
        .insert(sessions)
        .values({ id, expiredAt: Date.now() - 1, json: JSON.stringify(makeSession()) });
    }

    async function seedActive(id: string): Promise<void> {
      await getDb()
        .insert(sessions)
        .values({ id, expiredAt: Date.now() + 60_000, json: JSON.stringify(makeSession()) });
    }

    async function allIds(): Promise<string[]> {
      return (await getDb().select({ id: sessions.id }).from(sessions)).map((r) => r.id);
    }

    it('removes expired sessions when a new session is set', async () => {
      await seedExpired('exp-1');

      await storeSet(store, 'new-sid', makeSession());

      expect(await allIds()).not.toContain('exp-1');
    });

    it('preserves non-expired sessions during cleanup', async () => {
      await seedActive('active-1');
      await seedExpired('exp-1');

      await storeSet(store, 'new-sid', makeSession());

      expect(await allIds()).toContain('active-1');
    });

    it('deletes at most cleanupLimit expired sessions per set call', async () => {
      store = new DrizzleStore({ db: getDb(), cleanupLimit: 1 });

      await seedExpired('exp-1');
      await seedExpired('exp-2');

      await storeSet(store, 'new-sid', makeSession());

      // One of the two expired sessions should survive (limit=1)
      const remaining = await allIds();
      const expiredRemaining = remaining.filter((id) => id.startsWith('exp-'));
      expect(expiredRemaining).toHaveLength(1);
    });

    it('skips cleanup entirely when cleanupLimit is 0', async () => {
      store = new DrizzleStore({ db: getDb(), cleanupLimit: 0 });

      await seedExpired('exp-1');

      await storeSet(store, 'new-sid', makeSession());

      expect(await allIds()).toContain('exp-1');
    });

    it('does not remove the session that was just set, even if it looks expired', async () => {
      // A session with no maxAge uses the store ttl (default 86400s — far future)
      const sessionWithNoMaxAge: Express.SessionData = {
        cookie: { originalMaxAge: null, path: '/' },
      };
      await storeSet(store, 'just-set', sessionWithNoMaxAge);

      expect(await allIds()).toContain('just-set');
    });
  });
});
