import { type MetadataProviderType, mediaIdentity } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { yieldToEventLoop } from '../../kernel/yieldToEventLoop';
import { failureMessage, recordRefreshFailed, recordRefreshed } from '../providers';
import type { ReportedFacts } from '../providers';
import { fieldsByProviderType } from './activeFieldSet';
import type { EnrichableField, MediaEnricher } from './enrichment/enricher';
import type { EnrichmentQueries } from './enrichment/enrichment.queries';
import type { MediaItem } from './mediaItem';

/** One active enricher, with the provider instance whose facts it reads. */
export interface EnricherSource {
  providerId: number;
  name: string;
  enricher: MediaEnricher;
}

interface Deps {
  db: DrizzleDb;
  enrichmentQueries: EnrichmentQueries;
  /** Every active enricher; an empty list when none is active. */
  enrichers: EnricherSource[];
}

/**
 * Project a title row into the canonical item the enrichers match and decorate. No
 * `radarr`/`sonarr` key: the title carries no per-instance coordinate, and no enricher matches
 * on those keys (`enricherAdapters.ts`).
 */
function hydrate(identity: typeof mediaIdentity.$inferSelect): MediaItem {
  const ids: Record<string, number | string> = { identity: identity.id };
  if (identity.tmdbId != null) ids.tmdb = identity.tmdbId;
  if (identity.plexRatingKey != null) ids.plex = identity.plexRatingKey;
  if (identity.imdbId != null) ids.imdb = identity.imdbId;
  if (identity.jellyfinItemId != null) ids.jellyfin = identity.jellyfinItemId;
  return { _sourceIds: ids, title: '' } as MediaItem;
}

/**
 * Reads every active enricher for every title on every run and stores each provider's facts as
 * it reported them. A provider's successful answer replaces everything Warden held from it; a
 * failed one keeps it and records the failure. Precedence between providers is applied when the
 * library cache loads, not here.
 */
export class EnrichmentJob {
  private readonly failed: string[] = [];

  constructor(private deps: Deps) {}

  /** The enrichers this run could not read, by name. */
  failedProviders(): string[] {
    return [...this.failed];
  }

  async run(): Promise<number> {
    const identities = await this.deps.db.select().from(mediaIdentity);
    const items = identities.map(hydrate);

    for (const { providerId, name, enricher } of this.deps.enrichers) {
      let result: Awaited<ReturnType<MediaEnricher['enrich']>>;
      try {
        result = await enricher.enrich(items);
      } catch (err) {
        this.failed.push(name);
        await recordRefreshFailed(this.deps.db, providerId, 'facts', failureMessage(err));
        continue;
      }
      const declared = fieldsByProviderType as Partial<
        Record<MetadataProviderType, readonly (keyof ReportedFacts)[]>
      >;
      const fields: readonly EnrichableField[] = declared[result.provider] ?? [];
      const factsByTitle = new Map<number, Partial<ReportedFacts>>();
      for (const item of result.items) {
        await yieldToEventLoop();
        const titleId = item._sourceIds.identity;
        if (titleId === undefined) continue;
        const facts = Object.fromEntries(
          fields
            .map((field) => [field, item[field]] as const)
            .filter(([, value]) => value !== undefined && value !== null)
        ) as Partial<ReportedFacts>;
        factsByTitle.set(titleId, facts);
      }
      await this.deps.enrichmentQueries.replaceProviderFacts(providerId, factsByTitle);
      await recordRefreshed(this.deps.db, providerId, 'facts');
    }

    return identities.length;
  }
}
