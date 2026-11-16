import { providerRefresh } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';

/** The kinds of a provider's data Warden refreshes, each with its one writer. */
export type RefreshKind = 'catalog' | 'links' | 'lists' | 'facts';

/** When Warden last refreshed one kind of one provider's data, and whether the latest attempt failed. */
export interface StoredRefreshRecord {
  providerId: number;
  kind: RefreshKind;
  refreshedAt: number | null;
  failedAt: number | null;
  error: string | null;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Every refresh record, for every provider and kind. */
export async function readRefreshRecords(db: DrizzleDb): Promise<StoredRefreshRecord[]> {
  const rows = await db.select().from(providerRefresh);
  return rows.map((row) => ({ ...row, kind: row.kind as RefreshKind }));
}

/** Records that one kind of a provider's data was refreshed now; any earlier failure clears. */
export async function recordRefreshed(
  db: DrizzleDb,
  providerId: number,
  kind: RefreshKind
): Promise<void> {
  const set = { refreshedAt: nowSeconds(), failedAt: null, error: null };
  await db
    .insert(providerRefresh)
    .values({ providerId, kind, ...set })
    .onConflictDoUpdate({ target: [providerRefresh.providerId, providerRefresh.kind], set });
}

/** Records that refreshing one kind of a provider's data failed now; the last success is kept. */
export async function recordRefreshFailed(
  db: DrizzleDb,
  providerId: number,
  kind: RefreshKind,
  error: string
): Promise<void> {
  const set = { failedAt: nowSeconds(), error };
  await db
    .insert(providerRefresh)
    .values({ providerId, kind, ...set })
    .onConflictDoUpdate({ target: [providerRefresh.providerId, providerRefresh.kind], set });
}

/** Why a provider's answer was not taken, as a refresh record keeps it. */
export function failureMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
