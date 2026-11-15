import { MetadataProviderType } from '../../../database/schema';
import { ValidationError } from '../../../kernel/errors';
import type { EnrichmentFields } from '../mediaFieldProvider';
import type { EnrichableField } from './enricher';

export type { EnrichableField };

/**
 * Per-field precedence, declared once per *contested* field only — a field
 * with a single real producer needs no entry, since there is nothing to
 * order. Ordered as a non-empty readonly tuple rather than a freely-ranked
 * number: two positions in an array can't collide, so a tie is structurally
 * unrepresentable instead of merely forbidden by convention.
 */
export type ContestedFieldPrecedence = Partial<{
  [K in keyof EnrichmentFields]: readonly [MetadataProviderType, ...MetadataProviderType[]];
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
 * Fail-fast guardrail hooked into `assertNoActiveConflict`'s call site
 * (provider create/update): for every contested field, every active
 * provider type that produces it must be covered by that field's
 * `contestedFieldPrecedence` order. An active producer left out would
 * silently default to an accident of ordering instead of the deliberate
 * trust judgment precedence is meant to encode — this makes the gap loud
 * at provider-activation time instead. Takes `precedence`/`fieldsByType`
 * as parameters (not the module's own constants) so it stays pure and
 * testable against synthetic data, not just today's fixed 2-provider set.
 */
export function assertContestedFieldsCovered(
  activeTypes: Set<MetadataProviderType>,
  precedence: ContestedFieldPrecedence,
  fieldsByType: Partial<Record<MetadataProviderType, readonly (keyof EnrichmentFields)[]>>
): void {
  for (const [field, order] of Object.entries(precedence) as [
    keyof EnrichmentFields,
    readonly MetadataProviderType[],
  ][]) {
    for (const type of activeTypes) {
      const producesField = (fieldsByType[type] ?? []).includes(field);
      if (producesField && !order.includes(type)) {
        throw new ValidationError(
          `${type} produces the contested field "${field}" but is not covered by its contestedFieldPrecedence order — add it before activating this provider`
        );
      }
    }
  }
}
