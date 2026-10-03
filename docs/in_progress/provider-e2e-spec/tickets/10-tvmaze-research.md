---
type: wayfinder-ticket
label: wayfinder:research
status: closed
assignee: claude
blocked_by: []
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Tvmaze — research

## Question

Audit Tvmaze's full API surface (web research against its official API docs) and cross-check
against what this codebase currently wires (`server/modules/providers/connections/tvmazeProvider.ts`
if it exists, `server/modules/providers/providerFactory.ts`, `server/modules/media/enrichment/enricherAdapters.ts`,
`server/modules/media/filterRegistry.ts`, `src/lib/provider-registry.ts`). Produce a markdown asset
(linked from this ticket, not pasted into it) enumerating, for every field and task/action Tvmaze's
API exposes:

- Whether it's already wired into this codebase, and where.
- If not wired: what layer(s) it would touch (db/config surface, provider field, UI filter, query
  engine, enrichment, task/actuator, automation option).
- Any field whose *name* might collide with another provider's field of the same name but different
  meaning (don't resolve the collision here — just flag it for the final precedence ticket).
- Any gap that would require a *structural* schema change (new column/table, not just a new config
  value in the existing `settings` JSON blob) — flag, don't design.

Known context to start from: No metadata_provider row/settings — ProviderFactory.createTvMaze() constructs it directly against the public https://api.tvmaze.com base, apiKey: null, keyless. Not in PROVIDER_REGISTRY (src/lib/provider-registry.ts) despite being a valid MetadataProviderType — flag whether it needs a registry entry. Known buildable gap: filterRegistry.ts's network rule already lists TVMAZE as a sourceProviders entry alongside Sonarr, and getShow() genuinely returns per-show network data — this one is confirmed real and wireable, not just 'listed'.

Do not decide what to build yet — that's the follow-on decision ticket. This ticket is exhaustive
enumeration, not curation.

## Assets

- [research/tvmaze.md](../research/tvmaze.md) — full field/task enumeration.

## Resolution

- **Confirmed-buildable headline gap**: `filterRegistry.ts`'s `network` rule already lists TVMaze
  as a `sourceProviders` entry and `NormalizedSeries.network` already exists as a field, but no
  `tvmazeEnricher` exists in `enricherAdapters.ts` and `enrichmentJobFactory.ts` never requests a
  TVMaze provider instance at all — the enricher is the only missing piece. A naive fix must also
  read `webChannel` (unwired, undeclared in the `TvMazeShow` type), not just `network`, or every
  streaming-exclusive show would silently read as network-less.
- **DB/config surface**: no `metadata_provider` row exists or is needed for correctness — TVMaze is
  keyless with one fixed public base URL, and both construction sites hardcode it. The only benefit
  a `PROVIDER_REGISTRY` entry (`src/lib/provider-registry.ts`, currently absent) would add is UI
  visibility/toggling and a place to advertise its filter capability — flagged as a design question,
  not asserted as required.
- **Tasks/automation is genuinely empty**, not a gap — TVMaze implements no `MediaActuator` and none
  is plausible for a read-only public metadata API.
- **Naming collisions flagged, not resolved**: `network` (vs. Sonarr), `type` (vs.
  `NormalizedSeries.seriesType`, disjoint vocabulary), `status` (vs. `NormalizedSeries.status`, disjoint
  vocabulary), `genres` (third contributor alongside Sonarr/TMDB), and `rating` (already handled by
  `ratingsAggregation.ts`'s blended average).
- **Structural schema gaps** (new column/table, not a settings-blob value): episodes, cast/crew,
  akas/alternate titles, broadcast schedule, and images/artwork have zero existing concept anywhere
  in `NormalizedSeries`/`NormalizedMovie` for any provider. A duplicated inline `TvMazeProvider`
  construction in `providers.procedures.ts` (bypassing `ProviderFactory.createTvMaze()`) was also
  found and flagged as a process oddity, not a field gap.
