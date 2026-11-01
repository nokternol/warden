import { MetadataProviderType } from '../../../database/schema';
import { ValidationError } from '../../../kernel/errors';
import type { EnrichmentFields } from '../mediaFieldProvider';
import type { MediaItem } from '../mediaItem';
import type { EnrichableField, EnrichmentResult } from './enricher';

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

/**
 * The enrichment precedence in force. Play count and last-watched are the only
 * fields with more than one real producer today — Tautulli, Plex, or Jellyfin —
 * and Tautulli wins (it tracks completed plays, not opens). Jellyfin is placed
 * after Plex as a fixed literal order. `applyPrimaryMediaServer` implements a settings-driven
 * Plex/Jellyfin swap, but nothing calls it, because the `primaryMediaServer` setting is deferred.
 * Plex-then-Jellyfin is a safe default until then (the same "arr-stack wins, media servers rank
 * lowest" reasoning already applied to Plex). Every other field has exactly
 * one producer and so carries through `resolvePrecedence` unlisted.
 */
export const contestedFieldPrecedence: ContestedFieldPrecedence = {
  playCount: [
    MetadataProviderType.TAUTULLI,
    MetadataProviderType.PLEX,
    MetadataProviderType.JELLYFIN,
  ],
  lastWatchedAt: [
    MetadataProviderType.TAUTULLI,
    MetadataProviderType.PLEX,
    MetadataProviderType.JELLYFIN,
  ],
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

/** A stable identity for a canonical item across results — its cross-provider keys. */
function identityKey(item: MediaItem): string {
  return JSON.stringify(item._sourceIds);
}

/**
 * Merge every enricher's contributions into one canonical item set. Items are
 * grouped by identity across results; each contested field is taken from the
 * highest-precedence provider that set it. Fields with no entry (single
 * producer, nothing to order) carry their decorated value through unchanged.
 * Pure: the write-time replacement for read-time `??` precedence chains.
 */
export function resolvePrecedence(
  results: EnrichmentResult[],
  precedence: ContestedFieldPrecedence
): MediaItem[] {
  const groups = new Map<
    string,
    { base: MediaItem; byProvider: Map<MetadataProviderType, MediaItem> }
  >();
  for (const { provider, items } of results) {
    for (const item of items) {
      const key = identityKey(item);
      let group = groups.get(key);
      if (!group) {
        group = { base: item, byProvider: new Map() };
        groups.set(key, group);
      }
      group.byProvider.set(provider, item);
    }
  }

  return [...groups.values()].map(({ base, byProvider }) => {
    const resolved: MediaItem = { ...base };
    for (const [field, order] of Object.entries(precedence) as [
      EnrichableField,
      readonly MetadataProviderType[],
    ][]) {
      for (const provider of order) {
        const contributor = byProvider.get(provider);
        if (contributor && contributor[field] != null) {
          (resolved as Record<EnrichableField, unknown>)[field] = contributor[field];
          break;
        }
      }
    }
    return resolved;
  });
}
