# MediaEnricher role

Why the enricher half of the system-roles model is shaped the way the
code is. Detailed spec of the **MediaEnricher** role, one of three roles a configured system can play;
its sibling for the MediaActuator role is `docs/architecture/actuator-task-ownership.md`. The
surrounding source/identity model (MediaSource) is `docs/architecture/provider-roles-and-identity.md`.

## The role

A **MediaEnricher** is a configured system that contributes metadata about media **it does not own**,
joined to the catalog by a **shared logical key** (`tmdbId` / `tvdbId` / `imdbId` / `plexRatingKey`). It
decorates the canonical media model and knows nothing about which system *owns* the item, nor the item's
`contentType`.

The naming is deliberate: the core noun is `MediaItem` (a view is a `MediaItemSet`), so every role that
acts on media is `Media*` — `MediaSource`, `MediaEnricher`, `MediaActuator`. The role exists to keep
enrichment **decoupled from ownership**: a system contributes data about media regardless of who owns it,
matched only by a logical key both sides speak.

**Membership is declared, never assumed:**

| System | MediaEnricher? | Why |
|---|---|---|
| Plex, Tautulli, Overseerr, TMDB | **yes** | contribute data about media owned by Radarr/Sonarr, matched by logical key |
| Radarr, Sonarr | **no** | they are `MediaSource` (+ `MediaActuator`); their tags/quality/genres are Source fields on their own `MediaItem` rows |

The rule that draws the line: a field carried on a system's **own** Source rows is Source data;
enrichment is strictly metadata about media a system does **not** own. That is why the catalog owners are
not enrichers even though they carry rich fields.

## The contract is the canonical MediaItem

```ts
// server/modules/media/enrichment/enricher.ts
interface MediaEnricher {
  enrich(items: MediaItem[]): Promise<EnrichmentResult>;
}
interface EnrichmentResult { provider: MetadataProviderType; items: MediaItem[]; }
```

`enrich` receives canonical `MediaItem`s already hydrated with their cross-provider keys (`_sourceIds`),
matches on the key **it** speaks (`_sourceIds.plex`, `_sourceIds.tmdb`, …), and returns **only the items
it touched**, decorated with **only its fields**, tagged with its provider. The enricher never sees
`RADARR`/`SONARR` or `contentType`; the only outward type it imports is `MediaItem`.

The reason there is no separate enrichment transport type is that the canonical `MediaItem`
(`NormalizedMovie`/`NormalizedSeries`) already carries **both halves** enrichment needs: the match keys
(`_sourceIds: { radarr?, plex?, tmdb?, imdb?, providerId?, identity? }` — `providerId` on
source-produced items identifies the instance; `identity` on job-hydrated items is the group's own
surrogate id, set only by `hydrate` below, never by a source) and the fill slots (`playCount`,
`lastWatchedAt`, `overseerrHasIssue`, `overseerrRequestStatus`, `tmdbStatus`, …). The item **is** the
contract — each enricher owns its own match-and-decorate, so no central lingua franca has to carry
fragments between them.

`EnrichmentResult` is internal to the enrichment job: it carries provenance (which provider produced the
items) for write-time precedence resolution, and never persists nor crosses a read boundary.

Each `enrich` is a **thin shell over a `MediaFieldProvider` adapter**
([`docs/architecture/media-field-provider-role.md`](ref:path:docs/architecture/media-field-provider-role.md)):
fetch in the shell, run the adapter's `visit`/`toEnrichmentFields` pair via a shared `toFieldsByKey`
helper, then [`enrichment/decorate.ts`](ref:path:server/modules/media/enrichment/decorate.ts) applies
it — so the hard logic stays mock-free testable. The standalone mapper functions this used to route
through (`mappers.ts`'s `mapTautulliHistory`/`mapPlexItems`/`mapOverseerr`) are deleted; that logic now
lives on each adapter, alongside the field declaration it produces.

## Cross-enricher precedence is a per-field policy, resolved at write time

Two enrichers can speak to one canonical field (`playCount` from Tautulli **or** Plex). A single global
enricher ordering cannot express this, because precedence can differ per field — so it is a small
declarative map, scoped to only the fields with more than one real producer, consumed by a **pure**
`resolvePrecedence` ([`enrichment/precedence.ts`](ref:path:server/modules/media/enrichment/precedence.ts)).
Full shape and the fail-fast guardrail around it are in
[`docs/architecture/media-field-provider-role.md`](ref:path:docs/architecture/media-field-provider-role.md):

```ts
const contestedFieldPrecedence = {
  playCount:     [TAUTULLI, PLEX],
  lastWatchedAt: [TAUTULLI, PLEX],
};
```

Precedence runs at **write time**, so the cache stores **resolved** canonical fields (`playCount`,
`lastWatchedAt`), not provider-shaped columns side by side. Read-time `enrichmentMerge.ts` is then a
generic `Object.assign` of whatever fields storage holds for the matched identity onto the item — see
[the EAV rewrite](ref:path:docs/architecture/media-enrichment-eav-model.md) for why storage only ever
holds a row for a field actually present, which is what makes the read-side generic rather than a
per-field copy. Resolution is explicit and testable at the point of write rather than implicit at every
read; storage-level provenance is intentionally discarded because the job recomputes from all enrichers
on every staleness pass.

## The job is a scheduled executor over a cache

```
items     = hydrate(identities)                  // MediaItem with _sourceIds resolved (identity layer)
results   = await Promise.all(enrichers.map(e => e.enrich(items)))
canonical = resolvePrecedence(results, contestedFieldPrecedence)
persist(canonical)                                // cache projection for cheap reads
```

`EnrichmentJob` (`modules/media/enrichmentJob.ts`, wired by `EnrichmentJobFactory`) is a scheduled executor, not
the hot path: enrichers do live fetches, so their output is **cached** and refreshed on staleness, and
browse/preview/executor read the cache cheaply.

## Identity resolution is upstream, and is a Source concern

`media_identity` / `IdentityResolutionJob` is **not** enrichment: it is what lets a Radarr-owned item learn
its `plexRatingKey` (Radarr never knew it), hydrating `_sourceIds` so a `MediaEnricher` has a key to match.
It is upstream of, and separate from, enrichment — an ownership/identity concern, not an enricher one.

## How it is wired

- [`server/modules/media/enrichment/enricher.ts`](ref:path:server/modules/media/enrichment/enricher.ts) — `MediaEnricher` / `EnrichmentResult` contracts.
- [`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts) — `plexEnricher`, `tautulliEnricher`,
  `overseerrEnricher`, `tmdbEnricher`, each a thin shell binding a provider connection to the role: fetch,
  run its `MediaFieldProvider`/`MediaFieldSource` adapter's `visit`/`toEnrichmentFields`, then `enrichment/decorate.ts`.
- [`enrichment/precedence.ts`](ref:path:server/modules/media/enrichment/precedence.ts) — `resolvePrecedence` + the per-field `contestedFieldPrecedence`.
- `EnrichmentJob` — hydrates stale identities into `MediaItem`s, runs every enricher, resolves per field,
  persists resolved canonical fields via `EnrichmentQueries.replaceFields`.
- [`enrichmentMerge.ts`](ref:path:server/modules/media/enrichmentMerge.ts) — read-time generic assign of canonical fields onto browse/executor items via `EnrichmentQueries.getByIdentityIds`.
