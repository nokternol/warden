import { MetadataProviderType } from '../../database/schema';
import type { DomainEventBus } from '../../kernel/eventBus';
import type { ReportedFacts } from '../providers';

/**
 * The single declared source of truth for which `ReportedFacts` keys each
 * provider type's `MediaFieldProvider`/`MediaFieldSource` adapter(s) produce.
 * Hand-authored per provider type, not declared on the connection classes as
 * their other capabilities are (`catalogueEntry`), because an adapter's
 * field coverage lives in its generic type parameters, not something a
 * runtime scan of `mediaFieldProvider.ts`'s exports could discover, so this
 * is the compiled-in declaration every consumer (gating, `providers`)
 * reads instead of re-deriving.
 */
export const fieldsByProviderType = {
  [MetadataProviderType.TAUTULLI]: ['playCount', 'lastWatchedAt'],
  [MetadataProviderType.PLEX]: [
    'playCount',
    'lastWatchedAt',
    'plexAddedAt',
    'studio',
    'runtimeMinutes',
    'fileSizeBytes',
    'releaseDate',
    'fileContainer',
    'videoCodec',
    'audioCodec',
    'fileResolution',
    'labels',
  ],
  [MetadataProviderType.JELLYFIN]: [
    'playCount',
    'lastWatchedAt',
    'jellyfinAddedAt',
    'studio',
    'runtimeMinutes',
    'fileSizeBytes',
    'releaseDate',
    'fileContainer',
    'videoCodec',
    'audioCodec',
    'fileResolution',
    'labels',
    'isFavorite',
  ],
  [MetadataProviderType.SEERR]: ['seerrRequestStatus', 'seerrHasIssue'],
  [MetadataProviderType.TMDB]: ['tmdbStatus'],
} as const satisfies Partial<Record<MetadataProviderType, readonly (keyof ReportedFacts)[]>>;

/**
 * Every `ReportedFacts` key must have at least one declared producer above — a field
 * with no producer anywhere is unreachable (nothing would ever populate it), the same
 * silent-gap shape as the other coverage checks in this codebase (see
 * `docs/architecture/enrichment-field-completeness.md`). `_ActualCoveredField` is the
 * real union of every provider's declared fields; a new `ReportedFacts` key with no
 * matching entry above fails to compile here, naming it.
 */
type _ActualCoveredField = (typeof fieldsByProviderType)[keyof typeof fieldsByProviderType][number];
type _UncoveredField = Exclude<keyof ReportedFacts, _ActualCoveredField>;
const _everyFieldHasAProducer: Record<_UncoveredField, never> = {};

/**
 * The union of every currently-active provider type's declared fields —
 * membership only ("who can produce this field at all"), not precedence
 * (which only orders an already-established membership set).
 */
export function activeFieldSet(activeTypes: Set<MetadataProviderType>): Set<keyof ReportedFacts> {
  // Widened for indexing by the full `MetadataProviderType` enum (most of which have
  // no entry above) — the literal-narrowed export type only has the declared keys.
  const table = fieldsByProviderType as Partial<
    Record<MetadataProviderType, readonly (keyof ReportedFacts)[]>
  >;
  const fields = new Set<keyof ReportedFacts>();
  for (const type of activeTypes) {
    for (const field of table[type] ?? []) {
      fields.add(field);
    }
  }
  return fields;
}

/** The narrow slice of `ProviderSettingsService` this cache depends on. */
export interface ActiveTypesSource {
  activeTypes(): Promise<Set<MetadataProviderType>>;
}

/**
 * Caches `activeFieldSet`'s union so `ruleRegistry`/`gatedDescriptors` don't
 * recompute it (and re-query every provider's active state) per request.
 * Invalidates on `provider:changed`, which `ProviderSettingsService` sends from
 * create, update and delete, kept decoupled via the kernel event bus so
 * `providers` never imports from `media`. It has no expiry, so a read in flight
 * when the event fires returns its result without caching it: the old set can
 * never be written back.
 */
export class ActiveFieldSetCache {
  private readonly source: ActiveTypesSource;
  private cached: Set<keyof ReportedFacts> | null = null;
  private cachedActiveTypes: Set<MetadataProviderType> | null = null;
  private generation = 0;

  constructor(deps: { providerSettingsService: ActiveTypesSource; eventBus: DomainEventBus }) {
    this.source = deps.providerSettingsService;
    deps.eventBus.on('provider:changed', () => {
      this.generation++;
      this.cached = null;
      this.cachedActiveTypes = null;
    });
  }

  async get(): Promise<Set<keyof ReportedFacts>> {
    if (this.cached !== null) return this.cached;
    const generation = this.generation;
    const fields = activeFieldSet(await this.getActiveTypes());
    if (this.generation === generation) this.cached = fields;
    return fields;
  }

  /** The underlying active provider-type set, cached alongside `get()`'s field set —
   *  sharing one fetch when a caller needs both. */
  async getActiveTypes(): Promise<Set<MetadataProviderType>> {
    if (this.cachedActiveTypes !== null) return this.cachedActiveTypes;
    const generation = this.generation;
    const types = await this.source.activeTypes();
    if (this.generation === generation) this.cachedActiveTypes = types;
    return types;
  }
}
