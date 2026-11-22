# Media enrichment: `(mediaIdentityId, fieldId, providerId, value)` persistence shape

**Status:** AS-BUILT (current fact). `media_enrichment` is an entity-attribute-value (EAV) table — one
row per `(identity, field, provider)` fact actually present, as the provider reported it, not one row
per identity with a nullable column per field.

## Why this shape, not a wide table

Which enrichment fields ever have data for a given media item is a fact about which providers are
*configured*, not a fixed property of the schema — a server with no Seerr instance will never
populate `requestStatus`, and that's true for however many fields a future provider might add.
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
candidate fields across Radarr, Sonarr, Tautulli, Plex, Jellyfin, Seerr, TMDB, OMDB, and TVMaze that
aren't yet fetched or filterable; today's 6 keys are the early edge of that backlog. Under the EAV shape,
adding a field is a seed row in a migration, never a schema change again.

## The shape

```
enrichment_field
  id       INTEGER PRIMARY KEY
  key      TEXT UNIQUE NOT NULL   -- 'addedToMediaServerAt', 'playCount', … — seeded via migration

media_enrichment
  mediaIdentityId  INTEGER NOT NULL REFERENCES media_identity(id) ON DELETE CASCADE
  fieldId          INTEGER NOT NULL REFERENCES enrichment_field(id) ON DELETE CASCADE
  providerId       INTEGER NOT NULL REFERENCES metadata_provider(id) ON DELETE CASCADE
  value            TEXT NOT NULL   -- JSON-encoded: number | string | boolean
  UNIQUE (mediaIdentityId, fieldId, providerId)
```

([`server/database/schema.ts`](ref:path:server/database/schema.ts),
`server/database/migrations/0039_facts_per_provider.sql`)

- **`enrichment_field` stores only `{id, key}`.** Which provider reports which fact is declared on the
  reporting connection (`capabilities.facts.reports`, keys of
  [`ReportedFacts`](ref:path:server/modules/providers/facts.ts)) — the table never derives from or
  feeds that declaration. TypeScript can't type-check against database rows, so making the DB the
  source of truth for who reports a fact would trade a compile-time guarantee for a weaker runtime one,
  for a fact that doesn't need to live in storage at all.
- **`value` is JSON-encoded `TEXT`, not typed columns.** Filter predicates
  ([`ruleRegistry.ts`](ref:path:server/modules/media/ruleRegistry.ts)) run entirely in-memory
  against the reconstructed `NormalizedMovie`/`NormalizedSeries` object, never against the database again
  — so `value` only needs to round-trip cleanly through the DAL, not carry query-time type fidelity. One
  JSON column handles numbers, strings, and booleans uniformly, no type-discriminator column.
- **`fieldId` is a numeric FK to `enrichment_field`, not the literal string key.** libsql enforces
  foreign keys at runtime, so `ON DELETE CASCADE` is real at runtime and the DB rejects a `fieldId`
  that doesn't correspond to a currently-seeded field. The migrator runs with foreign keys off, so a
  migration that removes a field moves or deletes its fact rows itself (migration `0041` re-points the
  Jellyfin added dates at the merged `addedToMediaServerAt` field before deleting the old row).
- **Facts are stored per provider, as reported.** Where more than one provider supplies a fact (play
  count from Tautulli, Plex and Jellyfin; studio and file details when Plex and Jellyfin are both
  active), each provider's value is its own row. No value is lost at write time: precedence picks one
  value when the library cache loads (below), so a title Tautulli and Plex both track keeps Plex's
  studio and codecs alongside Tautulli's play count.
- **When the facts were read is a refresh record, not a column.** Each reporter's `facts` row in
  `provider_refresh` says when its facts were last read and whether the latest attempt failed. There is
  no staleness window: Enrichment asks every reporter about every title it can match on every run.
- **Migration path: drop and recreate, no unpivot.** `media_enrichment` had already been dropped and
  recreated outright at least twice before this change (`0004_drop_media_enrichment.sql`,
  `0008_drop_old_media_enrichment.sql`) — it's a derived cache, not a source of truth.
  Each provider's facts are replaced in full on every pass, so losing existing rows on migration just
  means the next enrichment run repopulates them (migration `0039` deleted every fact stored without a
  provider).

## The DAL seam: `EnrichmentQueries`

[`server/modules/media/enrichment/enrichment.queries.ts`](ref:path:server/modules/media/enrichment/enrichment.queries.ts)
is the one place that pivots EAV rows into/out of the `ReportedFacts` object shape every consumer
works with. Constructed with `{ db }` and registered via awilix in
[`media.registrations.ts`](ref:path:server/modules/media/media.registrations.ts) alongside every other
module service.

- **`allFacts()`** reads every fact with the provider that reported it, value decoded from JSON.
- **`replaceProviderFacts(providerId, factsByTitle)`** replaces everything one provider reported, in one
  `db.batch` so a reader never sees the provider's facts half gone. A title or field the provider no
  longer reports loses its fact from that provider; other providers' facts are untouched. A key with no
  matching `enrichment_field` row (migration/`ReportedFacts` drift — see below) throws a named error
  identifying the missing key.

## How a failed reporter is kept, and how one value is chosen

[`EnrichmentJob`](ref:path:server/modules/media/enrichmentJob.ts) reads each reporter on its own. A
successful answer replaces that provider's facts and records its `facts` refresh; a failed answer, or a
write that throws, keeps every fact Warden held from it, records the failure, and the run ends in error
naming it (north-star belief 6). The other reporters are still read and written.

A fact is contested when more than one kind of provider reports it.
[`REPORTED_FACT_PRECEDENCE`](ref:path:server/modules/providers/facts.ts) orders the kinds for each
contested fact: a watch-history tracker before a media server for play count and last watched. When the
library cache loads, [`resolveFacts`](ref:path:server/modules/media/enrichmentMerge.ts) picks, for each
title and fact, the value of the kind ranked first and, between two providers of one kind, the one
connected first (lowest provider id); a fact one provider reported is kept as reported (north-star
belief 3). A test over every declaration keeps every contested fact's order complete.

The library cache and `EnrichmentJob` both depend on `EnrichmentQueries` instead of touching
`media_enrichment` directly — see `docs/architecture/warden-core-model.md`'s enrichment section for how
this replaces the two modules' direct table access with a shared dependency neither imports from the
other.

## What replaced the wide table's per-field touch points

Before this change, `mediaEnrichment`'s six columns meant seven hand-maintained touch points existed for
each new field, among them `schema.ts`, a migration per field and the read's per-field copy-through.
The rest are now derived from the reporting connections' declarations or compile-checked
(`docs/architecture/enrichment-field-completeness.md`). The EAV shape removes the two that couldn't get
a guard under a wide-table shape:

- **`schema.ts` + a migration per field** — eliminated as a recurring action. Adding field #7 through
  #90 is a seed row in `enrichment_field`, never a schema change.
- **The read's per-field copy-through** — eliminated by making the read generic. Storage only ever
  holds a row for a field actually present, so the library cache assigns each title's resolved facts in
  one step instead of a hand-written line per field; there's no per-field line left to omit.

**Accepted, documented residual risk: migration seed drift.** The migrations' seeded `enrichment_field`
keys are asserted against the `ReportedFactKey` set in a test
(`server/__tests__/database/mediaEnrichment.test.ts`), through a `Record<ReportedFactKey, true>` that is
compile-time exhaustive. A future fact added to `ReportedFacts` without a seed migration is a test-time
catch, not a compile-time one. Deliberately accepted rather than engineered
around — the mitigation is documenting the "add a provider field" procedure clearly, not a stronger
gate.
