import { mediaIdentity } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { yieldToEventLoop } from '../../kernel/yieldToEventLoop';
import { failureMessage, recordRefreshFailed, recordRefreshed } from '../providers';
import type { ProviderFactory, ReportedFactKey, ReportedFacts } from '../providers';
import type { EnrichmentQueries } from './enrichment/enrichment.queries';

/** One active fact reporter, with its title id column and the facts it declares. */
type Reporter = ReturnType<ProviderFactory['factReportersOf']>[number];

interface Deps {
  db: DrizzleDb;
  enrichmentQueries: EnrichmentQueries;
  /** Every active fact reporter; an empty list when none is active. */
  reporters: Reporter[];
}

/** The facts among `facts` that the reporter declares, with defined, non-null values. */
function declaredFacts(
  facts: Partial<ReportedFacts>,
  reports: readonly ReportedFactKey[]
): Partial<ReportedFacts> {
  return Object.fromEntries(
    reports.flatMap((key) => (facts[key] != null ? [[key, facts[key]]] : []))
  ) as Partial<ReportedFacts>;
}

/**
 * Enrichment: the scheduled refresh of reported facts. On every run it asks every active reporter
 * about every title it can match, by the title id column its declaration names, and stores each
 * reporter's declared facts as it reported them. One id may name several titles (a movie and a
 * series can share a TMDB id); each gets the answer. A reporter's successful answer replaces
 * everything Warden held from it; a failed one keeps it and records the failure. Precedence
 * between reporters is applied when the library cache loads, not here.
 */
export class EnrichmentJob {
  private readonly failed: string[] = [];

  constructor(private deps: Deps) {}

  /** The reporters this run could not read, by name. */
  failedProviders(): string[] {
    return [...this.failed];
  }

  async run(): Promise<number> {
    const identities = await this.deps.db.select().from(mediaIdentity);

    for (const { providerId, name, provider, titleIdColumn, reports } of this.deps.reporters) {
      const titlesById = new Map<string | number, number[]>();
      for (const identity of identities) {
        const id = identity[titleIdColumn];
        if (id != null) titlesById.set(id, [...(titlesById.get(id) ?? []), identity.id]);
      }
      let answers: Map<string | number, Partial<ReportedFacts>>;
      try {
        answers = await provider.readReportedFacts([...titlesById.keys()]);
      } catch (err) {
        this.failed.push(name);
        await recordRefreshFailed(this.deps.db, providerId, 'facts', failureMessage(err));
        continue;
      }
      const factsByTitle = new Map<number, Partial<ReportedFacts>>();
      for (const [id, facts] of answers) {
        await yieldToEventLoop();
        const declared = declaredFacts(facts, reports);
        for (const titleId of titlesById.get(id) ?? []) factsByTitle.set(titleId, declared);
      }
      await this.deps.enrichmentQueries.replaceProviderFacts(providerId, factsByTitle);
      await recordRefreshed(this.deps.db, providerId, 'facts');
    }

    return identities.length;
  }
}
