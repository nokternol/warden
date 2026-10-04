import { and, eq, isNull, or } from 'drizzle-orm';
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
function isAccountOf(account: PlexAccount) {
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
      .where(isAccountOf(account))
      .limit(1);

    if (known) return this.refreshOwner(known, account, authToken);
    if (await this.hasOwner()) {
      throw new ForbiddenError('This Warden instance belongs to another Plex account');
    }
    return this.claimInstance(account, authToken);
  }

  private async hasOwner(): Promise<boolean> {
    const rows = await this.db.select({ id: users.id }).from(users).limit(1);
    return rows.length > 0;
  }

  private async claimInstance(account: PlexAccount, authToken: string): Promise<PublicUser> {
    const [owner] = await this.db
      .insert(users)
      .values({
        email: account.email.toLowerCase(),
        plexUsername: account.username,
        plexId: account.id,
        plexToken: authToken,
        avatar: account.thumb ?? null,
        userType: UserType.PLEX,
        isActive: true,
      })
      .returning(publicUserColumns);

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
