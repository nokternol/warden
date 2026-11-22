import { MetadataProviderType } from '../../../database/schema';
import { ValidationError } from '../../../kernel/errors';
import type { ReportedFacts } from '../../providers';
import type { ReportedFactKey as EnrichableField } from '../../providers';

export type { EnrichableField };

/**
 * Per-field precedence, declared once per *contested* field only — a field
 * with a single real producer needs no entry, since there is nothing to
 * order. Ordered as a non-empty readonly tuple rather than a freely-ranked
 * number: two positions in an array can't collide, so a tie is structurally
 * unrepresentable instead of merely forbidden by convention.
 */
export type ContestedFieldPrecedence = Partial<{
  [K in keyof ReportedFacts]: readonly [MetadataProviderType, ...MetadataProviderType[]];
}>;

/** Plex ranks before Jellyfin wherever both media servers report a fact. */
const MEDIA_SERVERS = [MetadataProviderType.PLEX, MetadataProviderType.JELLYFIN] as const;

/**
 * The enrichment precedence in force: an order for every fact more than one enricher type
 * declares (`fieldsByProviderType`). Play count and last-watched come from Tautulli first (it
 * tracks completed plays, not opens), then Plex, then Jellyfin. The facts both media servers
 * report take Plex's value before Jellyfin's, as a fixed order: `applyPrimaryMediaServer`
 * implements a settings-driven swap, but nothing calls it while the `primaryMediaServer` setting
 * is deferred. A fact one enricher type declares needs no entry: its value is kept as reported.
 */
export const contestedFieldPrecedence: ContestedFieldPrecedence = {
  playCount: [MetadataProviderType.TAUTULLI, ...MEDIA_SERVERS],
  lastWatchedAt: [MetadataProviderType.TAUTULLI, ...MEDIA_SERVERS],
  studio: MEDIA_SERVERS,
  runtimeMinutes: MEDIA_SERVERS,
  fileSizeBytes: MEDIA_SERVERS,
  releaseDate: MEDIA_SERVERS,
  fileContainer: MEDIA_SERVERS,
  videoCodec: MEDIA_SERVERS,
  audioCodec: MEDIA_SERVERS,
  fileResolution: MEDIA_SERVERS,
  labels: MEDIA_SERVERS,
};

/**
 * Fail-fast guardrail hooked into `assertNoActiveConflict`'s call site (provider create/update):
 * every enrichable fact more than one active provider type declares is contested, and every one
 * of those types must be in that fact's `contestedFieldPrecedence` order. A fact with no order, or
 * an active producer left out, would otherwise be decided by an accident of storage order instead
 * of the deliberate trust judgment precedence encodes. Takes
 * `precedence`/`fieldsByType` as parameters so it stays pure and testable against synthetic data.
 */
export function assertContestedFieldsCovered(
  activeTypes: Set<MetadataProviderType>,
  precedence: ContestedFieldPrecedence,
  fieldsByType: Partial<Record<MetadataProviderType, readonly (keyof ReportedFacts)[]>>
): void {
  const producers = new Map<EnrichableField, MetadataProviderType[]>();
  for (const type of activeTypes) {
    for (const field of fieldsByType[type] ?? []) {
      producers.set(field, [...(producers.get(field) ?? []), type]);
    }
  }
  for (const [field, types] of producers) {
    if (types.length < 2) continue;
    const order: readonly MetadataProviderType[] = precedence[field] ?? [];
    const uncovered = types.find((type) => !order.includes(type));
    if (uncovered) {
      throw new ValidationError(
        `${uncovered} produces the contested field "${field}" but is not covered by its contestedFieldPrecedence order — add it before activating this provider`
      );
    }
  }
}
