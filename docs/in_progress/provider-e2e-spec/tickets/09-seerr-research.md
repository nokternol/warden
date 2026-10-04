---
type: wayfinder-ticket
label: wayfinder:research
status: closed
assignee: claude
blocked_by: []
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Seerr — research

## Question

Audit Seerr's full API surface (web research against its official API docs) and cross-check
against what this codebase currently wires (`server/modules/providers/connections/seerrProvider.ts`
if it exists, `server/modules/providers/providerFactory.ts`, `server/modules/media/enrichment/enricherAdapters.ts`,
`server/modules/media/filterRegistry.ts`, `src/lib/provider-registry.ts`). Produce a markdown asset
(linked from this ticket, not pasted into it) enumerating, for every field and task/action Seerr's
API exposes:

- Whether it's already wired into this codebase, and where.
- If not wired: what layer(s) it would touch (db/config surface, provider field, UI filter, query
  engine, enrichment, task/actuator, automation option).
- Any field whose *name* might collide with another provider's field of the same name but different
  meaning (don't resolve the collision here — just flag it for the final precedence ticket).
- Any gap that would require a *structural* schema change (new column/table, not just a new config
  value in the existing `settings` JSON blob) — flag, don't design.

Known context to start from: Configurable via settings test-connection (server/modules/providers/connectionProbe.ts, server/modules/providers/providers.procedures.ts) but ProviderFactory.create() throws 'Unsupported provider type: SEERR' — connection.ts exists (server/modules/providers/connections/seerrProvider.ts) but is not wired to any MediaSource/MediaEnricher/MediaActuator role. Distinct product from Overseerr (Jellyseerr) — do not assume field/API parity with Overseerr during research.

Do not decide what to build yet — that's the follow-on decision ticket. This ticket is exhaustive
enumeration, not curation.

## Assets

- [research/seerr.md](../research/seerr.md) — full field/task enumeration.

## Resolution

- **Nothing is wired today, confirmed by direct read.** `seerrProvider.ts` is a bare one-line
  re-export of `OverseerrProvider` with no implementation of its own. `ProviderFactory.create()`
  has no `SEERR` case (throws `Unsupported provider type`), so no `SeerrProvider` instance is even
  constructible — which means no enricher, no filter rule, and no `PROVIDER_REGISTRY` entry can
  exist downstream either. The only live code paths are two connection-test-probe `case` clauses
  in `connectionProbe.ts` and `providers.procedures.ts` (the latter directly instantiates
  `OverseerrProvider`, not `SeerrProvider`).
- **Naming ambiguity flagged for the decision ticket**: as of a Feb 2026 upstream announcement,
  Jellyseerr and Overseerr merged into one project now literally named "Seerr"
  (`seerr-team/seerr`). This codebase's `MetadataProviderType.SEERR` almost certainly predates
  that merger and meant the pre-merger Jellyseerr fork. Whether the decision ticket should treat
  `SEERR` as targeting the old fork or the new merged project — and whether keeping `SEERR` and
  `OVERSEERR` as distinct enum values makes sense long-term now that upstream itself merged them —
  is unresolved.
- **"Identical API to Overseerr" (per `seerrProvider.ts`'s own comment) is plausible but
  unverified.** Request/issue/search endpoints (the only three this codebase's connection class
  calls) look structurally unchanged from Overseerr in the current spec. Divergence is
  concentrated in auth and media-server settings: Jellyseerr syncs from Jellyfin/Emby in addition
  to Plex (Overseerr is Plex-only), and multi-Plex-server settings may not fit the current
  one-`metadata_provider`-row-per-provider model — flagged as a possible structural schema gap,
  not confirmed live.
- **Central question for the decision ticket**: duplicate (independent `MediaSource`/
  `MediaEnricher`/`MediaActuator` wiring with `seerr`-prefixed fields) vs. share (extend
  `ProviderFactory`'s existing `instanceof OverseerrProvider` handling and `overseerrEnricher` to
  also accept Seerr-sourced data, writing into the same `overseerr`-prefixed fields). The
  divergence findings favor "share" for the narrow request/issue/search slice actually wired
  today, but sharing field names risks silently overwriting data if a user runs both providers
  simultaneously against different instances.
- **Collisions flagged, not resolved**: all of Overseerr's field-name collisions apply identically
  if Seerr gets its own `seerr`-prefixed fields, plus the `overseerr`-field-sharing risk above if
  it doesn't.
- **6 Seerr-specific gaps** beyond the full 24-item Overseerr not-wired set (which applies
  identically once/if Seerr shares or duplicates that wiring): missing `PROVIDER_REGISTRY` entry,
  missing `ProviderFactory.create()` case, no enricher, no actuator, plus two Seerr-only surfaces
  with no Overseerr equivalent (Jellyfin/Emby auth+user-sync, multi-Plex-server settings).
