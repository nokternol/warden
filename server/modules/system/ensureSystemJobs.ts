import { eq } from 'drizzle-orm';
import { automations } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';

/** `taskId` identifies a job; `name` is what the owner reads on System and Runs. */
const SYSTEM_JOBS = [
  {
    name: 'Identity resolution',
    taskId: 'system:identity-resolution',
    schedule: '0 * * * *',
  },
  { name: 'Enrichment', taskId: 'system:enrichment', schedule: '0 */6 * * *' },
] as const;

export async function ensureSystemJobs(db: DrizzleDb): Promise<void> {
  const existing = await db
    .select({ id: automations.id, name: automations.name, taskId: automations.taskId })
    .from(automations)
    .where(eq(automations.kind, 'system'));

  for (const job of SYSTEM_JOBS) {
    const row = existing.find(({ taskId }) => taskId === job.taskId);
    if (!row) {
      await db.insert(automations).values({ ...job, kind: 'system' });
    } else if (row.name !== job.name) {
      await db.update(automations).set({ name: job.name }).where(eq(automations.id, row.id));
    }
  }
}
