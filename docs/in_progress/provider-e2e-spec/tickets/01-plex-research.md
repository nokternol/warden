---
type: wayfinder-ticket
label: wayfinder:research
status: closed
assignee: claude
blocked_by: []
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Plex — research

## Question

Audit Plex's full API surface (web research against its official API docs) and cross-check
against what this codebase currently wires (`server/modules/providers/connections/plexProvider.ts`
if it exists, `server/modules/providers/providerFactory.ts`, `server/modules/media/enrichment/enricherAdapters.ts`,
`server/modules/media/ruleRegistry.ts`, `src/lib/provider-registry.ts`). Produce a markdown asset
(linked from this ticket, not pasted into it) enumerating, for every field and task/action Plex's
API exposes:

- Whether it's already wired into this codebase, and where.
- If not wired: what layer(s) it would touch (db/config surface, provider field, UI filter, query
  engine, enrichment, task/actuator, automation option).
- Any field whose *name* might collide with another provider's field of the same name but different
  meaning (don't resolve the collision here — just flag it for the final precedence ticket).
- Any gap that would require a *structural* schema change (new column/table, not just a new config
  value in the existing `settings` JSON blob) — flag, don't design.

Known context to start from: Wired: Plex is a MediaSource + enricher (playCount/watched-style fields via plexFieldProvider, per docs/architecture/media-providers.md). Note the naming-collision risk called out by the user: Plex's 'added' concept is downloadedAt-to-library (when the item entered the Plex library), not addedAt-to-source — do not conflate with Radarr/Sonarr's 'added' during research.

Do not decide what to build yet — that's the follow-on decision ticket. This ticket is exhaustive
enumeration, not curation.

## Assets

- [research/plex.md](../research/plex.md) — full field/task enumeration, wired vs not-wired, with
  naming-collision and structural-schema-gap flags.

## Resolution

- Codebase audit confirmed the ticket's starting context: Plex is `MediaEnricher` + `MediaActuator`
  (not `MediaSource`), 4 real actuator tasks (`deleteFromLibrary`, `refreshMetadata`, `markPlayed`,
  `markUnplayed`), and `plexAddedAt` is already distinctly named and wired (not conflated with
  Radarr/Sonarr's `added`) — re-verified, no drift found on that specific point.
- Found one doc/code drift unrelated to the ticket's main question: `docs/architecture/media-providers.md`
  lists a `moveToTrash` actuator task that does not exist in `plexProvider.ts`'s actual `tasks()` — flagged
  in the research asset, not fixed here (out of scope for a research ticket).
- Web research surfaced a large not-wired surface: per-item metadata fields already present in the
  same API responses this codebase already calls (`summary`, `tagline`, `studio`, `contentRating`,
  `rating`/`audienceRating`, `duration`, `originallyAvailableAt`, `Genre`, `Label`, `Media`/`Part`
  file info), plus entirely new endpoint families: collections/labels/playlists, active sessions
  ("now playing"), Plex Home multi-user watch data, PMS webhooks (Plex Pass-gated push events vs
  this codebase's poll-only model), library/server maintenance actions (scan-all, empty trash,
  optimize database), and plex.tv's separate Universal Watchlist.
- 7 naming-collision risks flagged (not resolved) — most notably `contentRating` vs the existing
  `certification` rule, and Plex's `rating`/`audienceRating` vs the existing Radarr-only `imdbRating`.
- 7 structural-schema gaps flagged (not designed) — collections, labels, playlists, and Plex Home
  multi-user watch data all need new tables/relations, not `settings` JSON entries; webhook receipt
  is a new subsystem; server/library-scoped actions (scan-all, empty trash, optimize DB) don't fit
  the existing item-id-scoped `ActuatorTask.run(ids)` signature.
