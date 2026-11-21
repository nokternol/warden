import type { ContentType } from '@contract/schemas';
import type { Cradle } from '@server/container';
import {
  MetadataProviderType,
  enrichmentField,
  mediaEnrichment,
  metadataProviders,
} from '@server/database/schema';
import { type DrizzleDb, getDb } from '@server/kernel/db';
import { DomainEventBus } from '@server/kernel/eventBus';
import { getChildLogger } from '@server/kernel/logger';
import type { EnrichmentFields } from '@server/modules/media';
import { LibraryCache } from '@server/modules/media/libraryCache';
import {
  type IProviderFactory,
  type ProviderSettingsService,
  type RadarrMovie,
  type RadarrProvider,
  type RefreshKind,
  type SonarrProvider,
  type SonarrSeries,
  readRefreshRecords,
  recordRefreshed,
} from '@server/modules/providers';
import { CatalogRefreshJob } from '@server/modules/providers/catalogRefreshJob';
import { ProviderFactory } from '@server/modules/providers/providerFactory';
import { emptyCatalogRun } from '@tests/helpers/collaborators';
import { and, eq } from 'drizzle-orm';

const log = getChildLogger('TestLibrary');

/**
 * Runs the catalog refresh as its system automation would, so the library copy holds what the
 * mocked providers answer, then tells the cache the copy changed.
 */
export async function refreshCatalog(
  cradle: Pick<Cradle, 'systemTaskRunner' | 'eventBus'>
): Promise<void> {
  await cradle.systemTaskRunner.run('system:identity-resolution');
  cradle.eventBus.emit('media:changed', {});
}

/**
 * Stores facts about one title as `providerId` reported them, as the enrichment job would, for
 * tests that need facts without running an enricher. Without `providerId` the facts are credited
 * to the first configured provider. Other titles' facts are left alone.
 */
export async function seedFacts(
  db: DrizzleDb,
  mediaIdentityId: number,
  facts: Partial<EnrichmentFields>,
  providerId?: number
): Promise<void> {
  const fields = new Map((await db.select().from(enrichmentField)).map((f) => [f.key, f.id]));
  const [firstProvider] = await db
    .select({ id: metadataProviders.id })
    .from(metadataProviders)
    .orderBy(metadataProviders.id)
    .limit(1);
  const credited = providerId ?? firstProvider.id;
  await db
    .delete(mediaEnrichment)
    .where(
      and(
        eq(mediaEnrichment.mediaIdentityId, mediaIdentityId),
        eq(mediaEnrichment.providerId, credited)
      )
    );
  const rows = Object.entries(facts)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({
      mediaIdentityId,
      providerId: credited,
      fieldId: fields.get(key)!,
      value: JSON.stringify(value),
    }));
  if (rows.length > 0) await db.insert(mediaEnrichment).values(rows);
}

/** What one active Radarr/Sonarr instance holds, for a catalog refresh to store. */
interface InstanceLibrary {
  providerId: number;
  name?: string;
  rows: RadarrMovie[] | SonarrSeries[];
  contentType?: ContentType;
}

/** Stores what each instance holds as the catalog refresh would, so the copy holds exactly it. */
export async function refreshCopies(db: DrizzleDb, libraries: InstanceLibrary[]): Promise<void> {
  const of = (contentType: ContentType) =>
    libraries
      .filter((l) => (l.contentType ?? 'movie') === contentType)
      .map(({ providerId, name = 'Instance', rows }) => ({ providerId, name, rows }));
  const job = new CatalogRefreshJob({
    ...emptyCatalogRun(),
    db,
    movieSources: of('movie').map(({ providerId, name, rows }) => ({
      providerId,
      name,
      provider: { getMovies: async () => rows as RadarrMovie[] },
    })),
    seriesSources: of('series').map(({ providerId, name, rows }) => ({
      providerId,
      name,
      provider: { getSeries: async () => rows as SonarrSeries[] },
    })),
  });
  await job.runForMovies();
  await job.runForSeries();
}

/**
 * A library cache over the test database whose first read stores, as a catalog refresh would,
 * what every active Radarr and Sonarr instance answers through `providerFactory`, so a test sets
 * the copy by mocking the providers. Each call builds its own cache.
 */
export function libraryCacheOver(
  providerSettingsService: Pick<ProviderSettingsService, 'findActiveByTypes'>,
  providerFactory: Pick<IProviderFactory, 'create'> = new ProviderFactory()
): LibraryCache {
  const db = getDb();
  return refreshingOnFirstRead(db, async () => {
    const settings = await providerSettingsService.findActiveByTypes([
      MetadataProviderType.RADARR,
      MetadataProviderType.SONARR,
    ]);
    const libraries: InstanceLibrary[] = [];
    for (const s of settings) {
      const connection = providerFactory.create(s, log) as RadarrProvider | SonarrProvider;
      const rows =
        s.type === MetadataProviderType.RADARR
          ? await (connection as RadarrProvider).getMovies()
          : await (connection as SonarrProvider).getSeries();
      libraries.push({
        providerId: s.id,
        name: s.name,
        rows,
        contentType: s.type === MetadataProviderType.RADARR ? 'movie' : 'series',
      });
    }
    await refreshCopies(db, libraries);
  });
}

/** A library cache whose first read stores exactly these instances' rows in the copy first. */
export function libraryCacheHolding(libraries: InstanceLibrary[]): LibraryCache {
  const db = getDb();
  return refreshingOnFirstRead(db, () => refreshCopies(db, libraries));
}

/**
 * Records every active media server's links and every active enricher's facts as refreshed now,
 * where no record says otherwise, so a test's copy reads as fully refreshed.
 */
async function markOthersRefreshed(db: DrizzleDb): Promise<void> {
  const records = await readRefreshRecords(db);
  const providers = await db
    .select()
    .from(metadataProviders)
    .where(eq(metadataProviders.isActive, true));
  const kinds: Partial<Record<string, RefreshKind[]>> = {
    PLEX: ['links', 'facts'],
    JELLYFIN: ['links', 'facts'],
    TAUTULLI: ['facts'],
    SEERR: ['facts'],
    TMDB: ['facts'],
  };
  for (const provider of providers) {
    for (const kind of kinds[provider.type] ?? []) {
      if (!records.some((r) => r.providerId === provider.id && r.kind === kind)) {
        await recordRefreshed(db, provider.id, kind);
      }
    }
  }
}

function refreshingOnFirstRead(db: DrizzleDb, refresh: () => Promise<void>): LibraryCache {
  const cache = new LibraryCache({ db, eventBus: new DomainEventBus() });
  const read = cache.read.bind(cache);
  let refreshed: Promise<void> | undefined;
  cache.read = async () => {
    refreshed ??= refresh()
      .then(() => markOthersRefreshed(db))
      .then(() => cache.clear());
    await refreshed;
    return read();
  };
  return cache;
}
