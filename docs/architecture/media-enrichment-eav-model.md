# Media enrichment: `(mediaIdentityId, fieldId, value)` persistence shape

**Status:** AS-BUILT (current fact). `media_enrichment` is an entity-attribute-value (EAV) table — one
row per `(identity, field)` fact actually present, not one row per identity with a nullable column per
field.

## Why this shape, not a wide table

Which enrichment fields ever have data for a given media item is a fact about which providers are
*configured*, not a fixed property of the schema — a server with no Overseerr instance will never
populate `overseerrRequestStatus`, and that's true for however many fields a future provider might add.
A column-per-field table encodes that variability as schema (one column per field, `NULL` when the
owning provider isn't configured), when it's actually data: a field's existence for the catalog is
sparse by construction, not by accident. `enrichment_field`
([`server/database/schema.ts`](ref:path:server/database/schema.ts)) makes that fact a row instead of a
column — a field only occupies storage where it actually has a resolved value.

This is not a storage-bytes argument — libsql's variable-length row format stores a `NULL` column as
roughly one header byte, so a wide table's unused columns aren't a real cost at any plausible catalog
scale. It's a representational-fit argument: a schema shape that can't say "this field doesn't apply
here" without a nullable column is modeling the wrong thing for an attribute set whose membership varies
per deployment.

A secondary, supporting consequence: a wide table also means every new field is a schema change
(`ALTER TABLE`, a migration) no matter how small — `INVENTORY.md` (repo root) catalogs roughly 80–90
candidate fields across Radarr, Sonarr, Tautulli, Plex, Jellyfin, Overseerr, TMDB, OMDB, and TVMaze that
aren't yet fetched or filterable; today's 6 keys are the early edge of that backlog. Under the EAV shape,
adding a field is a seed row in a migration, never a schema change again.

## The shape

```
enrichment_field
  id       INTEGER PRIMARY KEY
  key      TEXT UNIQUE NOT NULL   -- 'plexAddedAt', 'playCount', … — seeded via migration

media_enrichment
  mediaIdentityId  INTEGER NOT NULL REFERENCES media_identity(id) ON DELETE CASCADE
  fieldId          INTEGER NOT NULL REFERENCES enrichment_field(id) ON DELETE CASCADE
  value            TEXT NOT NULL   -- JSON-encoded: number | string | boolean

media_identity
  …
  enrichedAt       INTEGER   -- last time EnrichmentJob resolved this identity's fields
```

([`server/database/schema.ts`](ref:path:server/database/schema.ts),
`server/database/migrations/0018_media_enrichment_eav.sql`)

- **`enrichment_field` stores only `{id, key}`.** Which provider produces which field stays a
  compile-time TypeScript fact
  ([`activeFieldSet.ts`](ref:path:server/modules/media/activeFieldSet.ts)'s `fieldsByProviderType`,
  exhaustiveness-checked against `EnrichmentFields`) — the table never derives from or feeds that
  declaration. TypeScript can't type-check against database rows, so making the DB the source of truth
  for provider ownership would trade a compile-time guarantee for a weaker runtime one, for a fact that
  doesn't need to live in storage at all.
- **`value` is JSON-encoded `TEXT`, not typed columns.** Filter predicates
  ([`ruleRegistry.ts`](ref:path:server/modules/media/ruleRegistry.ts)) run entirely in-memory
  against the reconstructed `NormalizedMovie`/`NormalizedSeries` object, never against the database again
  — so `value` only needs to round-trip cleanly through the DAL, not carry query-time type fidelity. One
  JSON column handles numbers, strings, and booleans uniformly, no type-discriminator column.
- **`fieldId` is a numeric FK to `enrichment_field`, not the literal string key.** libsql enforces
  foreign keys at runtime, so `ON DELETE CASCADE` is real: removing a field's declaration cascade-deletes
  its fact rows automatically, and the DB rejects a `fieldId` that doesn't correspond to a
  currently-seeded field.
- **`enrichedAt` lives on `media_identity`, one column, one per identity — not per field.** Matches
  `mediaItems.resolvedAt`'s existing precedent (a per-row "last refreshed" timestamp living on the
  entity table itself). `EnrichmentJob`'s staleness check is a plain filter over `media_identity` rows,
  no join required.
- **Migration path: drop and recreate, no unpivot.** `media_enrichment` had already been dropped and
  recreated outright at least twice before this change (`0004_drop_media_enrichment.sql`,
  `0008_drop_old_media_enrichment.sql`) — it's a derived cache, not a source of truth.
  `EnrichmentJob.run()` already does a full resolve-and-replace from live provider state every pass, so
  losing existing rows on migration just means every identity is treated as never-enriched until the
  next scheduled pass (bounded by 24h staleness) repopulates it.

## The DAL seam: `EnrichmentQueries`

[`server/modules/media/enrichment/enrichment.queries.ts`](ref:path:server/modules/media/enrichment/enrichment.queries.ts)
is the one place that pivots EAV rows into/out of the `EnrichmentFields` object shape every consumer
works with. Constructed with `{ db }` and registered via awilix in
[`media.registrations.ts`](ref:path:server/modules/media/media.registrations.ts) alongside every other
module service.

- **`getByIdentityIds(ids)`** reads via a SQL-side pivot:
  ```sql
  json_group_object(enrichment_field.key, json(media_enrichment.value))
  ```
  grouped by `mediaIdentityId`, one row back per identity. The `json(...)` wrap is load-bearing, not
  decorative: `media_enrichment.value` is already JSON-encoded text, so omitting the wrap would make
  `json_group_object` re-encode it as a JSON string (`3` becomes `"3"`, silently, with no error at any
  layer). This is called out inline in the source, not just here, because it's the one place in this
  file a dropped function call produces wrong-typed data instead of a compile or runtime error.
- **`replaceFields(mediaIdentityId, values)`** does a full delete-then-insert for that identity — one
  row per key present in `values`. A key with no matching `enrichment_field` row (migration/
  `EnrichmentFields` drift — see below) throws a named error identifying the missing key, rather than
  hitting a `NOT NULL` constraint on `fieldId` as an opaque SQL failure.

`enrichmentMerge.ts` and `EnrichmentJob` both depend on `EnrichmentQueries` instead of touching
`media_enrichment` directly — see `docs/architecture/warden-core-model.md`'s enrichment section for how
this replaces the two modules' direct table access with a shared dependency neither imports from the
other.

## What replaced the wide table's per-field touch points

Before this change, `mediaEnrichment`'s six columns meant seven hand-maintained touch points existed for
each new field: `schema.ts`, a migration, `EnrichmentFields`, `activeFieldSet.ts`'s
`fieldsByProviderType`, `movie.ts`/`series.ts`'s field union, `enrichmentMerge.ts`'s copy-through,
`ruleRegistry.ts`'s rule, and `enrichmentJob.ts`'s write values. Four of those already carry
compile-time exhaustiveness checks unrelated to this rewrite (`docs/architecture/browse-range-param-enforcement.md`)
and are untouched by it. This rewrite removes the remaining two that had no such
guard and couldn't get one under a wide-table shape:

- **`schema.ts` + a migration per field** — eliminated as a recurring action. Adding field #7 through
  #90 is a seed row in `enrichment_field`, never a schema change.
- **`enrichmentMerge.ts`'s copy-through** — eliminated by making the read generic. Storage only ever
  holds a row for a field actually present, so the merge is one `Object.assign(item, fields)` instead of
  a hand-written `if` line per field; there's no per-field line left to omit.

**Accepted, documented residual risk: migration seed drift.** The migration's seeded `enrichment_field`
keys are hand-typed and asserted against `fieldsByProviderType`'s deduped values in a test
(`server/__tests__/database/mediaEnrichment.test.ts`), which is itself compile-time exhaustive against
`EnrichmentFields`. That test only runs against whatever migrations have executed by the time it runs,
so a future field added to `EnrichmentFields`/`fieldsByProviderType` without a corresponding seed
migration is a test-time catch, not a compile-time one. Deliberately accepted rather than engineered
around — the mitigation is documenting the "add a provider field" procedure clearly, not a stronger
gate.
