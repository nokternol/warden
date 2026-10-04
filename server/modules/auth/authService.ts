import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { type PublicUser, UserType, users } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { ForbiddenError, NotFoundError } from '../../kernel/errors';
import { getChildLogger } from '../../kernel/logger';
import type { PlexService } from '../providers';

const log = getChildLogger('AuthService');

/** The Plex account a sign-in token belongs to. */
type PlexAccount = Awaited<ReturnType<PlexService['getUserByToken']>>;

// Columns returned by every standard user query — plexToken intentionally excluded
const publicUserColumns = {
  id: users.id,
  email: users.email,
  plexUsername: users.plexUsername,
  plexId: users.plexId,
  avatar: users.avatar,
  userType: users.userType,
  isActive: users.isActive,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

/**
 * The user row a Plex account signs in as. The Plex id is the account's
 * identity; email identifies only a row stored before its Plex id was known,
 * because an email can move between Plex accounts.
 */
function matchesAccount(account: PlexAccount) {
  return or(
    eq(users.plexId, account.id),
    and(isNull(users.plexId), eq(users.email, account.email.toLowerCase()))
  );
}

export class AuthService {
  private readonly db: DrizzleDb;
  private readonly plexService: PlexService;

  constructor({ db, plexService }: { db: DrizzleDb; plexService: PlexService }) {
    this.db = db;
    this.plexService = plexService;
  }

  /**
   * Signs a Plex account in. The first account to sign in on a fresh instance
   * claims it as the owner; any other account is refused.
   */
  async authenticateWithPlex(authToken: string): Promise<PublicUser> {
    const account = await this.plexService.getUserByToken(authToken);

    const [known] = await this.db
      .select(publicUserColumns)
      .from(users)
      .where(matchesAccount(account))
      .limit(1);

    if (known) return this.refreshOwner(known, account, authToken);
    return this.claimInstance(account, authToken);
  }

  /**
   * Makes the account the owner if the instance has no user yet, in one
   * statement so two first sign-ins cannot both claim it. Refuses otherwise.
   * Raw SQL because Drizzle's insert builder has no `INSERT … SELECT … WHERE
   * NOT EXISTS`; its column list must follow the `users` schema.
   */
  private async claimInstance(account: PlexAccount, authToken: string): Promise<PublicUser> {
    const claimed = await this.db.all<{ id: number }>(sql`
      INSERT INTO ${users} (email, plexUsername, plexId, plexToken, avatar, userType, isActive)
      SELECT ${account.email.toLowerCase()}, ${account.username}, ${account.id}, ${authToken},
             ${account.thumb ?? null}, ${UserType.PLEX}, 1
      WHERE NOT EXISTS (SELECT 1 FROM ${users})
      RETURNING id`);
    if (claimed.length === 0) {
      throw new ForbiddenError('This Warden instance belongs to another Plex account');
    }
    const [owner] = await this.db
      .select(publicUserColumns)
      .from(users)
      .where(eq(users.id, claimed[0].id));

    log.info('Plex account claimed the instance as owner', {
      userId: owner.id,
      plexId: account.id,
    });
    return owner;
  }

  private async refreshOwner(
    owner: PublicUser,
    account: PlexAccount,
    authToken: string
  ): Promise<PublicUser> {
    await this.db
      .update(users)
      .set({
        plexToken: authToken,
        plexUsername: account.username,
        avatar: account.thumb ?? null,
        ...(owner.plexId === null ? { plexId: account.id } : {}),
      })
      .where(eq(users.id, owner.id));

    // Re-fetch with updated fields (updatedAt was auto-updated by $onUpdateFn)
    const [refreshed] = await this.db
      .select(publicUserColumns)
      .from(users)
      .where(eq(users.id, owner.id));

    log.info('Owner signed in', { userId: refreshed.id, plexId: account.id });
    return refreshed;
  }

  async getUserById(userId: number): Promise<PublicUser> {
    const rows = await this.db
      .select(publicUserColumns)
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)));

    if (rows.length === 0) {
      throw new NotFoundError(`User ${userId} not found`);
    }

    return rows[0];
  }
}

export type AuthServiceType = AuthService;
