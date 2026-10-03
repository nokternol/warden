---
type: wayfinder-ticket
label: wayfinder:research
status: closed
assignee: claude
blocked_by: []
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Sonarr — research

## Question

Audit Sonarr's full API surface (web research against its official API docs) and cross-check
against what this codebase currently wires (`server/modules/providers/connections/sonarrProvider.ts`
if it exists, `server/modules/providers/providerFactory.ts`, `server/modules/media/enrichment/enricherAdapters.ts`,
`server/modules/media/filterRegistry.ts`, `src/lib/provider-registry.ts`). Produce a markdown asset
(linked from this ticket, not pasted into it) enumerating, for every field and task/action Sonarr's
API exposes:

- Whether it's already wired into this codebase, and where.
- If not wired: what layer(s) it would touch (db/config surface, provider field, UI filter, query
  engine, enrichment, task/actuator, automation option).
- Any field whose *name* might collide with another provider's field of the same name but different
  meaning (don't resolve the collision here — just flag it for the final precedence ticket).
- Any gap that would require a *structural* schema change (new column/table, not just a new config
  value in the existing `settings` JSON blob) — flag, don't design.

Known context to start from: Wired: MediaSource (show) + MediaActuator, fields (genres, network, etc.) flow direct to filterRegistry. Audit for actuator/task gaps analogous to Radarr's modelledRun.

Do not decide what to build yet — that's the follow-on decision ticket. This ticket is exhaustive
enumeration, not curation.

## Assets

- [research/sonarr.md](../research/sonarr.md) — full field/task enumeration, wired vs not-wired,
  naming-collision flags, structural schema-change gaps.

## Resolution

- Sonarr is wired as both a `MediaSource` (series → `NormalizedSeries`, most core fields flow through
  `normalizeSonarrSeries`) and a `MediaActuator` (6 tasks), but has no dedicated `MediaEnricher` —
  its only `EnrichmentFields` contribution is `tags`.
- Sonarr has the **same `modelledRun` gap as Radarr**: `deleteSeriesKeepFiles` is declared but
  rejects on invocation, mirroring `deleteMovieKeepFiles`. Not Sonarr-specific — a shared gap class.
- Found a likely **latent bug**: the `hasFile` filter rule lists Sonarr as a `sourceProviders`
  entry, but `SonarrSeries`/`NormalizedSeries` has no `hasFile` field at all, so the filter silently
  never matches a show. Flagged, not fixed (out of scope for a research ticket).
- Sonarr's v3 API exposes several command families with no representation at all in this codebase's
  task model: episode/season-level search & rename (needs sub-item addressing this codebase's
  series-level `ActuatorTargetId` doesn't support), and instance-scoped commands
  (`MissingEpisodeSearch`, `RssSync`, `Backup`, `DownloadedEpisodesScan`) that don't fit the
  per-item `run(ids, ...)` task shape at all.
- Queue and history endpoints are entirely unrepresented — flagged as a structural-design question
  (event/progress stream, not a flat filterable row), not a simple field gap.
- Naming-collision flags for the precedence ticket: `added`/`addedDate` (Sonarr, addedAt-to-source)
  vs Plex's `plexAddedAt` (addedAt-to-library) — already split into separate filter rules today,
  worth confirming as intentional; `network` shared with TVMaze; `certification` shared across four
  providers with no value-format normalization.
