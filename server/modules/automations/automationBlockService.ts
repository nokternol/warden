import type { ReadinessFinding } from '@contract/readiness';
import { and, eq, isNotNull, isNull, notInArray } from 'drizzle-orm';
import { automationBlocks } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { ConflictError } from '../../kernel/errors';

/**
 * The filter findings each automation's user can sign off, kept as rows so a sign-off persists
 * between checks. Every write is row-level, so a sign-off landing during a check is never
 * overwritten by it.
 */
export class AutomationBlockService {
  private readonly db: DrizzleDb;

  constructor({ db }: { db: DrizzleDb }) {
    this.db = db;
  }

  /**
   * Brings `automationId`'s stored blocks in line with the findings a check just produced:
   * inserts the new ones, deletes those no longer found. Answers the ids already signed off.
   */
  async reconcile(
    automationId: number,
    findings: readonly ReadinessFinding[]
  ): Promise<Set<string>> {
    const ids = findings.map((f) => f.id);
    await this.db
      .delete(automationBlocks)
      .where(
        and(
          eq(automationBlocks.automationId, automationId),
          notInArray(automationBlocks.findingId, ids)
        )
      );
    if (findings.length > 0) {
      await this.db
        .insert(automationBlocks)
        .values(
          findings.map((f) => ({
            automationId,
            findingId: f.id,
            queryId: f.queryId,
            ruleKey: f.ruleKey,
            kind: f.kind,
            providerIds: JSON.stringify(f.providerIds),
          }))
        )
        .onConflictDoNothing();
    }
    const signedOff = await this.db
      .select({ findingId: automationBlocks.findingId })
      .from(automationBlocks)
      .where(
        and(
          eq(automationBlocks.automationId, automationId),
          isNotNull(automationBlocks.signedOffAt)
        )
      );
    return new Set(signedOff.map((b) => b.findingId));
  }

  /**
   * Accepts the finding as known risk for this automation. Refused when the latest check no
   * longer found it, or it is already signed off: only a block awaiting sign-off can be accepted.
   */
  async signOff(automationId: number, findingId: string): Promise<void> {
    const updated = await this.db
      .update(automationBlocks)
      .set({ signedOffAt: Math.floor(Date.now() / 1000) })
      .where(
        and(
          eq(automationBlocks.automationId, automationId),
          eq(automationBlocks.findingId, findingId),
          isNull(automationBlocks.signedOffAt)
        )
      )
      .returning({ id: automationBlocks.id });
    if (updated.length === 0) {
      throw new ConflictError('This problem is no longer waiting for sign-off.');
    }
  }
}
