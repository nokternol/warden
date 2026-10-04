import { users } from '@server/database/schema';
/**
 * AuthService tests — behaviour-only, no implementation details inspected.
 *
 * Uses a real in-memory SQLite database so the queries run against actual SQL.
 * PlexService is mocked at the interface level.
 *
 * Run: vitest run --project server
 */
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { ForbiddenError } from '@server/kernel/errors';
import { AuthService } from '@server/modules/auth/authService';
import type { PlexService } from '@server/modules/providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlexService(overrides: Partial<PlexService> = {}): PlexService {
  return {
    getUserByToken: vi.fn(),
    ...overrides,
  } as unknown as PlexService;
}

function makePlexUser(
  overrides: Partial<{ id: number; email: string; username: string; thumb?: string }> = {}
) {
  return {
    id: 111,
    email: 'plex@example.com',
    username: 'plexuser',
    thumb: 'https://plex.tv/avatar.jpg',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let authService: AuthService;
  let plexService: PlexService;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    plexService = makePlexService();
    authService = new AuthService({ db: getDb(), plexService });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  describe('authenticateWithPlex', () => {
    it('makes the first account to sign in on a fresh instance its owner', async () => {
      const plexUser = makePlexUser();
      vi.mocked(plexService.getUserByToken).mockResolvedValue(plexUser);

      const user = await authService.authenticateWithPlex('token-abc');

      expect(user.id).toBeDefined();
      expect(user.email).toBe('plex@example.com');
      expect(user.plexId).toBe(111);
      expect(user.plexUsername).toBe('plexuser');
      expect(user.isActive).toBe(true);
    });

    it("lowercases the owner's email when the instance is claimed", async () => {
      vi.mocked(plexService.getUserByToken).mockResolvedValue(
        makePlexUser({ email: 'Plex@EXAMPLE.COM' })
      );

      const user = await authService.authenticateWithPlex('token-abc');

      expect(user.email).toBe('plex@example.com');
    });

    it("updates the owner's plexUsername and avatar when matched by plexId", async () => {
      const db = getDb();
      // Seed an existing user
      await db.insert(users).values({
        email: 'plex@example.com',
        plexId: 111,
        plexUsername: 'old-username',
        avatar: 'https://old.jpg',
        plexToken: 'old-token',
      });

      vi.mocked(plexService.getUserByToken).mockResolvedValue(
        makePlexUser({ username: 'new-username', thumb: 'https://new.jpg' })
      );

      const user = await authService.authenticateWithPlex('new-token');

      expect(user.plexUsername).toBe('new-username');
      expect(user.avatar).toBe('https://new.jpg');
      // plexToken is written to DB but not returned by the service
      expect('plexToken' in user).toBe(false);
    });

    it("refreshes the owner's stored Plex token when they sign in again", async () => {
      const db = getDb();
      await db
        .insert(users)
        .values({ email: 'plex@example.com', plexId: 111, plexToken: 'old-token' });
      vi.mocked(plexService.getUserByToken).mockResolvedValue(makePlexUser());

      await authService.authenticateWithPlex('rotated-token');

      const [stored] = await db.select({ plexToken: users.plexToken }).from(users);
      expect(stored.plexToken).toBe('rotated-token');
    });

    it('binds the Plex id to an owner stored without one, matching them by email', async () => {
      const db = getDb();
      await db.insert(users).values({
        email: 'plex@example.com',
        plexId: null,
        plexUsername: 'plexuser',
        plexToken: 'old-token',
      });
      vi.mocked(plexService.getUserByToken).mockResolvedValue(makePlexUser({ id: 222 }));

      const user = await authService.authenticateWithPlex('new-token');

      expect(user.plexId).toBe(222);
      expect(await db.select().from(users)).toHaveLength(1);
    });

    it("refuses an account presenting the owner's email under a different Plex id", async () => {
      const db = getDb();
      await db
        .insert(users)
        .values({ email: 'plex@example.com', plexId: 111, plexToken: 'owner-token' });
      vi.mocked(plexService.getUserByToken).mockResolvedValue(makePlexUser({ id: 999 }));

      await expect(authService.authenticateWithPlex('other-token')).rejects.toBeInstanceOf(
        ForbiddenError
      );

      const stored = await db
        .select({ plexId: users.plexId, plexToken: users.plexToken })
        .from(users);
      expect(stored).toEqual([{ plexId: 111, plexToken: 'owner-token' }]);
    });

    it('does not return plexToken in the result', async () => {
      vi.mocked(plexService.getUserByToken).mockResolvedValue(makePlexUser());

      const user = await authService.authenticateWithPlex('token-abc');

      expect('plexToken' in user).toBe(false);
    });
  });

  describe('getUserById', () => {
    it('returns an active user by id', async () => {
      const db = getDb();
      const [inserted] = await db
        .insert(users)
        .values({ email: 'active@example.com', isActive: true })
        .returning();

      const user = await authService.getUserById(inserted.id);

      expect(user.id).toBe(inserted.id);
      expect(user.email).toBe('active@example.com');
    });

    it('does not return plexToken in the result', async () => {
      const db = getDb();
      const [inserted] = await db
        .insert(users)
        .values({ email: 'active@example.com', plexToken: 'secret', isActive: true })
        .returning();

      const user = await authService.getUserById(inserted.id);

      expect('plexToken' in user).toBe(false);
    });

    it('throws NotFoundError for an unknown id', async () => {
      await expect(authService.getUserById(9999)).rejects.toThrow('User 9999 not found');
    });

    it('throws NotFoundError for an inactive user', async () => {
      const db = getDb();
      const [inserted] = await db
        .insert(users)
        .values({ email: 'inactive@example.com', isActive: false })
        .returning();

      await expect(authService.getUserById(inserted.id)).rejects.toThrow(
        `User ${inserted.id} not found`
      );
    });
  });
});
