# The `MediaFieldProvider`/`MediaFieldSource` role: field ownership by declaration

Why field ownership, precedence, and gating are each declared exactly once instead of three
independently hand-maintained copies. A fourth media-owned role alongside `MediaSource`
([`docs/architecture/provider-roles-and-identity.md`](ref:path:docs/architecture/provider-roles-and-identity.md))
and `MediaEnricher` ([`docs/architecture/media-enricher-role.md`](ref:path:docs/architecture/media-enricher-role.md))
— `providers/` still owns configuration/CRUD, `media/` still owns all usage of what a configured
provider produces; not a new boundary, the same one already drawn for the other two roles.

## The central declaration: `EnrichmentFields`

[`server/modules/media/mediaFieldProvider.ts`](ref:path:server/modules/media/mediaFieldProvider.ts)
declares one hand-authored, type-only mapped type — the canonical field-name → type dictionary every
adapter's output is checked against:

```ts
export interface EnrichmentFields {
  tags: number[];
  playCount: number;
  lastWatchedAt: string;
  overseerrRequestStatus: number;
  overseerrHasIssue: boolean;
  tmdbStatus: string;
  plexAddedAt: string;
  studio: string;
  runtimeMinutes: number;
  fileSizeBytes: number;
  releaseDate: string;
  fileContainer: string;
  videoCodec: string;
  audioCodec: string;
  fileResolution: string;
  labels: string[];
  jellyfinAddedAt: string;
  isFavorite: boolean;
}
```

`EnrichmentFields` is never read or branched on at runtime — it exists purely to constrain every
adapter's `toEnrichmentFields` return type. Two adapters declaring conflicting types for the same
field is not caught after the fact; it's inexpressible, because both are checked against the same
shared type rather than each provider unioning in its own bespoke shape.

## Two interfaces, because construction shape differs

A provider's own representation of a field (`TMediaField` — e.g. Tautulli's raw play-history rows)
is a different type from `MediaItem`'s canonical, post-precedence representation
(`Pick<EnrichmentFields, ...>`) whenever a real transform sits between them (unix timestamp → ISO
string). Two interfaces express the two ways that transform gets applied:

- **`MediaFieldSource<TMediaField, TFields>`** — `toEnrichmentFields(native): TFields` only. For
  `MediaSource`-style construction (`normalizeRadarrMovie`/`normalizeSonarrSeries`), which builds an
  entire canonical item from one raw item, always 1:1, with no existing item to decorate and no batch
  to join.
- **`MediaFieldProvider<TRaw, TMediaField, TFields, TKey>`** — `visit(raw): Map<TKey, TMediaField>` +
  `toEnrichmentFields(native): TFields`. For `MediaEnricher`-style adapters, which decorate fields
  onto an *already-existing* item, joined by key across a batch. `visit` absorbed the standalone
  mapper functions `mappers.ts` used to hold (`mapTautulliHistory`, `mapPlexItems`, `mapOverseerr`) —
  the mapper logic now lives on the adapter, alongside the field declaration it produces, and
  `mappers.ts` is deleted.

Both interfaces are checked against the same `EnrichmentFields`, so a source field and an enrichment
field can never disagree on type regardless of which interface declares them.

## Every adapter, and what it produces

| Adapter | Interface | Fields |
|---|---|---|
| `radarrTagsFieldSource` | `MediaFieldSource` | `tags` |
| `sonarrTagsFieldSource` | `MediaFieldSource` | `tags` |
| `tautulliFieldProvider` | `MediaFieldProvider` | `playCount`, `lastWatchedAt` |
| `plexFieldProvider` | `MediaFieldProvider` | `playCount`, `lastWatchedAt`, `plexAddedAt`, `studio`, `runtimeMinutes`, `fileSizeBytes`, `releaseDate`, `fileContainer`, `videoCodec`, `audioCodec`, `fileResolution`, `labels` |
| `jellyfinFieldProvider` | `MediaFieldProvider` | `playCount`, `lastWatchedAt`, `jellyfinAddedAt`, `studio`, `runtimeMinutes`, `fileSizeBytes`, `releaseDate`, `fileContainer`, `videoCodec`, `audioCodec`, `fileResolution`, `labels`, `isFavorite` |
| `overseerrFieldProvider` | `MediaFieldProvider` | `overseerrRequestStatus`, `overseerrHasIssue` |
| `tmdbFieldSource` | `MediaFieldSource` | `tmdbStatus` |

Tautulli, Plex, and Jellyfin report the identical play-history native shape (play count + optional
last-played unix timestamp — Jellyfin synthesizes `playCount` from its `Played` boolean when
`PlayCount` is absent), so all three build on one `PlayHistoryFields` type and share the
`playHistoryToEnrichmentFields` transform for that shared portion. Plex and Jellyfin each additionally
report a library-added timestamp (`plexAddedAt`/`jellyfinAddedAt`, kept as two separate fields — same
kind of event from mutually-exclusive server choices, not merged) plus a shared set of directly-owned
metadata (`studio`, `runtimeMinutes`, file-tech fields, `releaseDate`, `labels`); each extends
`PlayHistoryFields` into its own native-fields type and wraps `playHistoryToEnrichmentFields` with its
own extra conversions, rather than folding provider-specific fields into the shared transform Tautulli
would then also carry. `isFavorite` has no Plex analog — Jellyfin-only, no precedence entry needed.
`tmdbFieldSource` is a `MediaFieldSource`, not a `MediaFieldProvider`, despite TMDB being a
`MediaEnricher` — its `getStatus(tmdbId)` call has no natural batch to `visit()` (fetched one id at a
time), so the checked transform (`string` → `{ tmdbStatus }`) stands alone without the `visit`/join
machinery.

`radarrMediaSource`/`sonarrMediaSource`
([`sourceAdapters.ts`](ref:path:server/modules/media/sourceAdapters.ts)) and the five
`MediaEnricher` adapters
([`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts))
route through these `MediaFieldSource`/`MediaFieldProvider` instances instead of hand-copied field
assignments — `normalizeRadarrMovie`/`normalizeSonarrSeries` spread `...radarrTagsFieldSource
.toEnrichmentFields(m.tags)` rather than assigning `tags: m.tags` directly, and each enricher runs a
shared `toFieldsByKey` helper over its provider's `visit`/`toEnrichmentFields` pair before decorating.

Sonarr's `qualityProfileId` is **not** covered — `EnrichmentFields` has no `qualityProfileId` key;
both Radarr's and Sonarr's `qualityProfileId` remain hand-assigned in
[`normalizeMedia.ts`](ref:path:server/modules/media/normalizeMedia.ts). A real, scoped gap, not an
oversight: closing it is follow-on work, not part of what shipped.

## `movie.ts`/`series.ts` carry every enrichment field, not a hand-picked subset

[`movie.ts`](ref:path:server/modules/media/movie.ts) and
[`series.ts`](ref:path:server/modules/media/series.ts) no longer hand-type `tags`, `playCount`,
`lastWatchedAt`, `overseerrHasIssue`, `overseerrRequestStatus`, `tmdbStatus`, `plexAddedAt` — each
interface extends `Partial<EnrichmentFields>` directly (no field is movie-only or series-only within
`EnrichmentFields` itself; that distinction lives in `providers`/`contentTypes` instead). This
started as an explicit `Partial<Pick<EnrichmentFields, 'tags' | 'playCount' | ...>>` union, but `Pick`
only constrains the *listed* keys to be real ones — it doesn't require the list to be complete, so a
new `EnrichmentFields` key could be silently left off it and nothing would fail to compile. `Partial<
EnrichmentFields>` removes the union (and the maintenance burden) entirely, so a *new* field is now
automatically carried on `NormalizedMovie`/`NormalizedSeries` instead of needing a matching edit here.
(`enrichmentMerge.ts` no longer assigns fields one at a time — since
[the EAV rewrite](ref:path:docs/architecture/media-enrichment-eav-model.md) it applies whatever
`EnrichmentQueries.getByIdentityIds` returns via one generic `Object.assign`, so a field-type change
there is no longer a compile-time-checked touch point at all; it was never enforceable in that shape to
begin with.) See
[`docs/architecture/browse-range-param-enforcement.md`](ref:path:docs/architecture/browse-range-param-enforcement.md)
for the fuller set of compile-time checks a new `EnrichmentFields` key is now subject to end to end.

## Precedence: a total order, declared once per contested field

`playCount` is legitimately produced by Tautulli, Plex, and Jellyfin — precedence encodes a deliberate
trust judgment (Tautulli wins; it tracks completed plays, not opens), not a race-breaker, so a tie is
never a valid state.
[`enrichment/precedence.ts`](ref:path:server/modules/media/enrichment/precedence.ts) declares
`contestedFieldPrecedence`, a non-empty readonly tuple per contested field:

```ts
export const contestedFieldPrecedence: ContestedFieldPrecedence = {
  playCount: [MetadataProviderType.TAUTULLI, MetadataProviderType.PLEX, MetadataProviderType.JELLYFIN],
  lastWatchedAt: [
    MetadataProviderType.TAUTULLI,
    MetadataProviderType.PLEX,
    MetadataProviderType.JELLYFIN,
  ],
};
```

Jellyfin sits after Plex as a fixed literal order, not yet a `primaryMediaServer`-driven swap — that
settings-aware ordering (`applyPrimaryMediaServer`,
[`enrichment/settingsAwarePrecedence.ts`](ref:path:server/modules/media/enrichment/settingsAwarePrecedence.ts))
exists and is tested but isn't wired to a live setting read at either call site above yet.

Scoped only to fields with more than one real producer — an uncontested field (`overseerrHasIssue`,
`tmdbStatus`, `tags`, `isFavorite`, all single-producer today) needs no entry, since there's nothing to
order; it carries through `resolvePrecedence` unlisted. An array's positions can't collide, so a tie is
structurally unrepresentable rather than merely forbidden by convention — the same shape decision
`EnrichmentFields` makes for field types, applied to field ordering. This replaced the prior
`ENRICHMENT_POLICY`/`PrecedencePolicy` shape, which listed every field (including single-producer
ones) against a mutable array.

`enricher.ts`'s `EnrichableField` is `Exclude<keyof EnrichmentFields, 'tags'>` — every enrichment
field `EnrichmentFields` declares except `tags`, which is `MediaFieldSource`'s construction-only
field, never decorated onto an existing item by a `MediaEnricher`.

### Fail-fast: an uncovered contested field at provider-activation time

`assertContestedFieldsCovered` (same file) checks every contested field's active producers against
its `contestedFieldPrecedence` order, throwing if an active producer is missing from it. Pure and
parameterized over `precedence`/`fieldsByType` rather than reading the module's own constants, so
it's testable against synthetic data independent of today's fixed 3-provider contested set.

`ProviderSettingsService` ([`providerSettingsService.ts`](ref:path:server/modules/providers/providerSettingsService.ts))
exposes an optional `precedenceCoverageValidator` injection point — invoked with the prospective
active-type set (current active types plus the type being activated) from `assertPrecedenceCovered`,
run alongside the existing single-active-per-type check
(`assertNoActiveConflict`) via `assertActivationIsValid`, both at `create`/`update`'s hook point. The
class itself stays ignorant of `EnrichmentFields`/`media` entirely — the real validator (closing over
`contestedFieldPrecedence` and `fieldsByProviderType`) is wired as a cradle value in
[`server/container.ts`](ref:path:server/container.ts), the one place allowed to import from both
`providers` and `media`, keeping `providers → media` illegal in both directions
(enforced by a `depcruise` rule).

The fail-fast path is unreachable with today's real data — both real contested fields already list
every real producer (Tautulli, Plex, and now Jellyfin) — verified only against synthetic data. It
would trigger the moment a new provider starts producing an already-contested field without a
covering precedence entry, which is exactly what happened when Jellyfin joined `playCount`/
`lastWatchedAt` as a third producer: activating a Jellyfin instance failed fast until its entry was
added above.

## The active field set: computed once, cached, invalidated on provider change

[`activeFieldSet.ts`](ref:path:server/modules/media/activeFieldSet.ts) declares
`fieldsByProviderType`, the single source of truth for which `EnrichmentFields` keys each provider
type's adapter(s) produce — hand-authored, mirroring
[`roles.ts`](ref:path:server/modules/providers/roles.ts)'s `SOURCE_OWNER`, since an adapter's
field coverage lives in its generic type parameters, not something a runtime scan could discover:

```ts
export const fieldsByProviderType = {
  [RADARR]: ['tags'],
  [SONARR]: ['tags'],
  [TAUTULLI]: ['playCount', 'lastWatchedAt'],
  [PLEX]: [
    'playCount', 'lastWatchedAt', 'plexAddedAt', 'studio', 'runtimeMinutes',
    'fileSizeBytes', 'releaseDate', 'fileContainer', 'videoCodec', 'audioCodec',
    'fileResolution', 'labels',
  ],
  [JELLYFIN]: [
    'playCount', 'lastWatchedAt', 'jellyfinAddedAt', 'studio', 'runtimeMinutes',
    'fileSizeBytes', 'releaseDate', 'fileContainer', 'videoCodec', 'audioCodec',
    'fileResolution', 'labels', 'isFavorite',
  ],
  [OVERSEERR]: ['overseerrRequestStatus', 'overseerrHasIssue'],
  [TMDB]: ['tmdbStatus'],
};
```

`activeFieldSet(activeTypes)` unions every active type's declared fields — membership only ("who can
produce this field at all"), answering a different question from precedence (which only orders an
already-established membership set). `ActiveFieldSetCache` wraps it in a compute-once cache with two
accessors sharing one underlying fetch (`get()` for the field set, `getActiveTypes()` for the raw
provider-type set), invalidated by a `provider:changed` domain event
([`kernel/eventBus.ts`](ref:path:server/kernel/eventBus.ts)) rather than a direct import —
`ProviderSettingsService.create`/`update` emit it after a successful mutation, the same
`providers → media`-illegal boundary the precedence validator crosses via the event bus instead of an
import.

## `ruleRegistry.ts`: derived where possible, hand-listed where genuinely source-owned

`deriveProviders(field)` inverts `fieldsByProviderType` — every provider type whose declared
fields include the given key. Every rule whose predicate reads an `EnrichmentFields`-tracked field
calls it, either directly (`studio`, `runtimeMinutes`, `fileContainer`, `videoCodec`, `audioCodec`,
`fileResolution`, `fileSizeBytes`, `labels`, `isFavorite` → `jellyfinIsFavorite`, `tmdbStatus`,
`overseerrRequestStatus`, `overseerrHasIssue`) or under a different rule key than the field itself
(`watched`/`lastWatchedDaysAgo` read `playCount`/`lastWatchedAt`; `plexAddedDaysAgo` reads
`plexAddedAt`; `jellyfinAddedDaysAgo` reads `jellyfinAddedAt`; `releaseDaysAgo` reads `releaseDate`).
Every other rule — most of `NormalizedMovie`/`NormalizedSeries`'s fields (`title`, `year`, `hasFile`,
`monitored`, `network`, `communityRating`, …) — stays hand-listed, correctly: they're source-owned
fields with no `EnrichmentFields` entry to derive from.

**Not content-type-scoped.** `deriveProviders` has no awareness of which content type a rule
applies to, so it's only safe to call for a field whose producer set doesn't vary by content type. The
movie- and series-side `tagIds` rules both read the now-`EnrichmentFields`-backed `tags` field, but stay
hand-listed (`[RADARR]` / `[SONARR]` respectively) rather than calling
`deriveProviders('tags')`, which would derive to `[RADARR, SONARR]` on *both* rules — wrong,
since Sonarr can't produce a movie's tags and Radarr can't produce a series'.

Three hand-listed `providers` entries match the provider catalog in
[`docs/architecture/media-providers.md`](ref:path:docs/architecture/media-providers.md): `genres` (movie) and `imdbRating` are Radarr-only (no TMDB genres call or OMDB
integration exists); `communityRating` (series) is Sonarr-only (Sonarr's `ratings` is a single
aggregate, no TMDB key configured). `network`'s `TVMAZE` entry is deliberately unchanged — real and
buildable, just not yet wired to an adapter.

[`media.rules.procedures.ts`](ref:path:server/modules/media/media.rules.procedures.ts)'s
`gatedDescriptors` serves a rule only when it has a live producer: one of its `providers` is configured,
active, and of a type the scope declaration ([`contract/scope.ts`](ref:path:contract/scope.ts)) offers.
A deferred type is never a producer, so a rule only TMDB or TVmaze claim is not served even when a TMDB
row exists. It reads `activeFieldSetCache.getActiveTypes()` instead of calling
`providerSettingsService.activeTypes()` per request — one cache read instead of a live per-request DB
query, invalidated the same way as the active field set above. The `media.rules` procedure's
output (`MediaRuleDescriptor[]`) and the client (`MediaFilterBar`, `useMediaRules`, `useMediaFilters`)
are unaffected by where the gating computation reads from.

## What this does not solve

- **`MediaRule`'s predicate/label/dataType authorship stays manual.** A field's existence is
  derivable from `EnrichmentFields`; *how a filter for it behaves* is a human decision, not
  auto-generated from field declarations.
- **Data presence stays out of scope.** "Active" means provider-configured only — whether a field has
  actually been *observed populated* is a separate, harder, unscoped question (a provider can have
  data then be disabled; a completed enrichment pass can still lack data for an item for its own
  reasons). If tackled, it composes as a stricter filter on top of the active field set, not instead
  of it.
- **TVMaze's `network` adapter and any TMDB integration for `communityRating`** are real, buildable
  gaps, not part of this role's scope.
