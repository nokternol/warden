# Provider Roles & the Media Identity Model

As of 2026-07-12, this documents the model the code *actually* implements today, including its
remaining limits — recorded as architecture rather than intent because the hierarchy and the
multi-instance identity model described below are real and load-bearing, not an unstarted plan.

**Scope:** this covers the **MediaSource** role, the group/instance identity model underneath it, and
the enricher role's relationship to that model. (The enricher role is the `MediaEnricher` contract —
`enrich(items): EnrichmentResult` — re-grounded in Phase 2.5; its full spec is
`docs/architecture/media-enricher-role.md`.) The third role a system can play — **MediaActuator**
(tasks/actions) — is the role-owned task model in `docs/architecture/actuator-task-ownership.md`.

## Why this is recorded as architecture, not intent

Providers were originally conceived as a flat, all-optional set of feeders mapped into one graph. In
practice the code grew an implicit hierarchy: a couple of providers became *catalog owners* and the
rest became *decorators*. That hierarchy is not a mistake or an unstarted plan — it is a real,
load-bearing property of the running system, encoding an original intention (some providers *seed* the
catalog; others *enrich* it) that was discovered by evolution rather than declared up front.

A second load-bearing property, added later: catalog ownership is a **role membership fact**, not a
per-request assumption. Which provider types own which content type is declared in one place and
every other surface derives from it — never re-declares it.

## The three emergent tiers

| Tier | Providers (today) | Role in code |
|---|---|---|
| **Catalog owner** (`MediaSource`) | Radarr (movies), Sonarr (series) | Define what *exists* and its canonical id; the catalog is the union of every active instance's library |
| **Enricher** | Tautulli, Plex, Jellyfin, Overseerr, TMDB / OMDB / TVMaze | Decorate owner rows by shared key; contribute nothing standalone |
| **Inert toward catalog** | Plex-as-*owner*, Jellyfin-as-*owner* | Cannot produce a catalog row at all |

With no Radarr and no Sonarr configured, the app is effectively empty: browse lists, identity
resolution, and enrichment all short-circuit to nothing (see the pipeline below).

## The single authority for catalog ownership

[`providers/roles.ts`](ref:path:server/modules/providers/roles.ts) declares `SOURCE_OWNER_BY_KIND: Record<MediaKind, MetadataProviderType>`
(`movie → RADARR`, `show → SONARR`) plus `isMediaSourceType`/`kindOfSourceType` derived from it. This is
the *only* place that fact is declared:

- `media/mediaSourceFactory.ts`'s `sourceOwnership()` (the `GET /api/media/sources` wire projection) and
  `filterRegistry.ts`'s `ContentType` (a type alias of `MediaKind`) both derive from it — media never
  re-declares the map, only imports it (the one legal `media → providers` direction).
- `ProviderSettingsService.assertNoActiveConflict` reads `isMediaSourceType` to decide whether the
  single-active-provider invariant (D8) applies — see below.
- The identity job reads `SOURCE_OWNER_BY_KIND`/`kindOfSourceType` to know which provider types to fetch
  and what `kind` to resolve their items under.

A type graduating into the `MediaSource` role (Plex, per the still-open intent doc) would extend this one
map; every consumer above inherits the change without its own edit.

## Multi-instance is real: Radarr/Sonarr may have any number of active instances

`ProviderSettingsService.assertNoActiveConflict` ([`server/modules/providers/providerSettingsService.ts`](ref:path:server/modules/providers/providerSettingsService.ts))
early-returns for `isMediaSourceType(type)` — Radarr and Sonarr carry **no** single-active invariant.
Every other provider type (TMDB, Overseerr, Tautulli, Plex-as-enricher, Jellyfin) still enforces it: at
most one active instance, or `assertNoActiveConflict` throws `ValidationError`. This is role-scoped, not
type-hardcoded, so it reads directly off the one authority above.

`ProviderFactory.createInstances(providers, logger)` ([`server/modules/providers/providerFactory.ts`](ref:path:server/modules/providers/providerFactory.ts))
is the structural half of this: it returns one `{ settings, provider }` entry per configured row, never
collapsing same-type entries into a single slot. `ProviderSet` (the older `createMany` result) has no
`radarr`/`sonarr` slots at all — the type system cannot express "the Radarr instance" any more, so no
future consumer can silently reintroduce last-one-wins.

## The identity model: group vs. instance copy

`media_identity`/`media_item` ([`server/database/schema.ts`](ref:path:server/database/schema.ts), migration `0014`) is the spine — a
two-table split between the logical title and each instance's concrete copy of it:

- **`media_identity` is the group** — one row per logical title, no per-source coordinate. Keyed
  per-`kind` (`movie`/`show`, scoping the primary-id namespace: a TMDB movie id and a TMDB tv id with the
  same number are different titles) by a partial-unique index on its primary id (`tmdbId` for movies,
  `tvdbId` for shows).
- **`media_item` is one row per instance's copy**, `UNIQUE(providerId, externalId)` — `providerId` is the
  *configured instance* (`metadata_provider.id`), not the provider type, so a non-4k Radarr and a 4k
  Radarr never collide; both copies attach to the same `media_identity` group when they report the same
  primary id.
- **`resolveGroup(db, kind, ids)`** ([`server/modules/providers/groupResolver.ts`](ref:path:server/modules/providers/groupResolver.ts)) is the
  sole find-or-create authority for which group an item belongs to: primary id per kind if present;
  otherwise a fallback chain (`imdbId`, then `title`+`year`); otherwise a fresh group. Identifier fields
  are merged onto an existing group **fill-only** — a found group's non-`NULL` column is never
  overwritten. No code path ever merges two *existing* groups; a group left with zero `media_item` rows
  is swept, not merged away.

## The identity job: one loop per active instance

`IdentityResolutionJob`/`IdentityJobFactory` ([`server/modules/providers/identityResolutionJob.ts`](ref:path:server/modules/providers/identityResolutionJob.ts))
loop every active instance per type — never collapsed to one:

- `IdentityJobFactory.create()` builds `movieSources`/`seriesSources` arrays via `createInstances`, one
  `{ providerId, provider }` per active Radarr/Sonarr row.
- `runForMovies`/`runForSeries` resolve each fetched item's group via `resolveGroup`, upsert its
  `media_item` row on `(providerId, externalId)`, then **prune** that instance's `media_item` rows whose
  `externalId` is no longer in its fetched set (an item removed from one instance's library stops being a
  copy there without touching any other instance's copies), and finally **sweep** every group left with
  zero `media_item` rows.
- `runForPlex` never inserts a group — it only *stamps* `plexRatingKey` onto groups matching by
  `kind` + `tmdbId`/`tvdbId`, closing a bug where an unscoped `tmdbId` match could cross the movie/tv id
  namespaces.

## Enrichment: two distinct paths through the group/item split

- **The enrichment job** (`EnrichmentJob.run`, [`server/modules/media/enrichmentJob.ts`](ref:path:server/modules/media/enrichmentJob.ts)) is
  group-level and instance-agnostic: it selects every `media_identity` row and filters on that row's own
  `enrichedAt` column (staleness is a fact about the group, not a joined fact table —
  see [the EAV rewrite](ref:path:docs/architecture/media-enrichment-eav-model.md) for why enrichment
  storage no longer carries one row per identity to join against), hydrates each stale group into a
  canonical `MediaItem` (`_sourceIds.identity` is the group's own surrogate id — collision-free by
  construction, since no two groups share it, unlike a bare `tmdbId` that could span kinds), and hands the
  batch to every `MediaEnricher`; each matches by the logical key it speaks (`_sourceIds.plex`/`.tmdb`) and
  `resolvePrecedence` resolves per field at write time. An empty identity table means the enrichers are
  never even queried. See `docs/architecture/media-enricher-role.md`.
- **`mergeEnrichment(db, enrichmentQueries, items)`** (browse/preview path,
  [`server/modules/media/enrichmentMerge.ts`](ref:path:server/modules/media/enrichmentMerge.ts)) joins
  the other direction — from a batch of source-produced items, each carrying its own
  `_sourceIds.providerId`/native id, grouped by `providerId` and joined through `media_item` to its
  group's id, which `EnrichmentQueries.getByIdentityIds` resolves to that group's fields. Two items from
  two instances that resolve to the same group correctly read identical group-level enrichment
  (watched-ness is a fact about the title, not the copy); two instances' distinct copies that happen to
  share a raw external id never cross-attribute, since the join is scoped per `providerId`. No type
  parameter — attribution is a relational join, not a type-string equality.

## The MediaSource read contract

The source role is a typed read contract ([`server/modules/media/mediaSource.ts`](ref:path:server/modules/media/mediaSource.ts)), not duck-typed
access to `getMovies`/`getSeries`:

```ts
interface MediaSource {
  getMediaItems(): Promise<MediaItemSet>;          // already normalized, self-describing provenance
  idOf(item: NormalizedMovie | NormalizedShow): number | undefined;
}
```

The method names are role-named — a source advertises *media items*, not movies or series. Every
source-produced item's `_sourceIds` carries `providerId` (the constructing instance) and the logical
`tmdb`/`imdb`/`tvdb` ids (`normalizeRadarrMovie`/`normalizeSonarrSeries` take `providerId` and populate
them). `MediaQueryEngine.evaluate` never branches on provider type: it reads `source.getMediaItems()`,
merges DB enrichment via `mergeEnrichment(db, items)`, and pools matched items by `itemKey(item)`
(`${providerId}:${externalId}`, [`server/modules/media/mediaItem.ts`](ref:path:server/modules/media/mediaItem.ts) — collision-free across
instances) rather than a single source's `idOf`. `idOf` stays as the provider-native id projection
`task.run` speaks — unambiguous within one bound instance, which is what an automation execution and a
raw-DTO lookup both are.

`MediaSourceFactory.sourcesFor(contentType)` ([`server/modules/media/mediaSourceFactory.ts`](ref:path:server/modules/media/mediaSourceFactory.ts)) resolves a
`ContentType` to one `{ providerId, name, source: MediaSource }` entry per *active instance* owning it —
never collapsed to one. `GET /api/media-queries/:id/preview` fans out over it, evaluating the query spec
once per instance and summing per-instance match counts into `{ count, instances: [{ providerId, name,
count }] }`. The executor instead binds a specific provider by `automation.provider.id`, since it needs
the actuator role on the same instance for `task.run` — an automation targets one instance; running the
same query against two instances is two automations sharing that query record.

## Browse: per-instance sublists, live display dedup, and instance-qualified filters

`media.procedures.ts`'s `getMovies()`/`getSeries()` fetch every active instance's raw
`RadarrMovie[]`/`SonarrSeries[]` into **per-instance sublists** (`{ providerId, providerName, movies }`),
never flattened into one array before matching. The inline `MediaSource` normalizes each sublist's rows
with their own `providerId` (`normalizeRadarrMovie(m, providerId)`), so every item pooled into
`MediaQueryEngine.evaluate` self-describes which instance produced it. Raw-row recovery after matching
keys on `itemKey(item)` (`${providerId}:${externalId}`), so two instances' rows sharing a raw provider id
are never conflated.

**Display dedup** groups the matched raw rows by native primary id (`tmdbId` for movies, `tvdbId` for
series; a row with no primary id falls back to `${providerId}:${id}`, its own singleton group) —
computed live per request over provider data, no DB join, no dependency on the identity job having run,
the same key `resolveGroup` uses so the live browse view and the persisted `media_identity` grouping
agree by construction. Grouping happens **after** engine matching, so filter semantics are ANY: a title
appears if at least one of its copies matched (the motivating case — "do I have this in 4k?"). The
representative row is the first matched copy in sort order, decorated with additive `sourceCount` and
`sourceProviderIds` fields; pagination and totals operate on the grouped rows. With exactly one active
instance every group is a singleton, so every row is byte-identical to the single-instance shape apart
from the two additive fields. `listTags`/`listQualityProfiles` decorate each returned tag/profile with
`{ providerId, providerName }`, and `MediaSourceDescriptor.instances` (`GET /api/media/sources`) lists
every active instance — the provenance the client needs to label per-instance options.

**Instance-qualified filter values.** `qualityProfileIds` and `tagIds` are provider-*minted* numeric id
spaces — each instance numbers its own profiles/tags independently, so instance A's id `1` and instance
B's id `1` are two unrelated things. `MediaRule.instanceScoped` (`filterRegistry.ts`) marks exactly these
four rule variants (movie/show × tags/profiles); every other rule (strings, universal facts, computed
measures) is unaffected. `FilterValueEntry` carries an optional `providerId`
(`media_query_filter_values.providerId`, migration `0015`) that qualifies which instance's namespace the
paired ids belong to — `undefined` means unqualified (today's pre-multi-instance semantics: the id is
interpreted in each matched item's own namespace, which is exactly correct whenever evaluation is bound
to one instance, i.e. every automation and every single-instance deployment). The gate lives once, in
`matchItems`'s predicate loop
([`server/modules/media/mediaQueryEngine.ts`](ref:path:server/modules/media/mediaQueryEngine.ts)): a
qualified entry only matches items whose `_sourceIds.providerId` equals the entry's — it never
pass-throughs to a different instance's coincidentally-matching id. `computeHealth`
(`mediaQueryService.ts`) surfaces two misconfiguration cases as `QueryHealth` degradations rather than
silent mismatches: an entry qualified to a `providerId` that is not an active instance, and — on the
automation surface — an entry qualified to a provider other than the automation's own bound instance
(which the gate above would otherwise make match nothing with no visible signal).

The client (`MediaFilterBar`) mirrors this: when a rule's owning content type has more than one active
instance (`useMediaSources()`), its dropdown renders options grouped into labeled per-instance sections
and, if every currently-selected option resolves to exactly one instance, emits a qualified entry; a
selection spanning instances (or none) falls back to the unqualified interpretation. With exactly one
active instance the control renders flat and emits unqualified entries — the wire shape of a
single-instance deployment is unchanged.

## Remaining limitations

1. **No version/edition concept.** A logical title is assumed to be one concrete item per instance. Real
   sources can expose several editions from *one* instance (a single Plex item with multiple
   quality-optimized versions) — distinct from the multi-*instance* case the identity model above
   already handles.
2. **Media servers cannot own.** Plex and Jellyfin both only enrich — neither can produce a catalog row,
   the same limitation `docs/architecture/media-providers.md`'s Jellyfin entry documents in full.
