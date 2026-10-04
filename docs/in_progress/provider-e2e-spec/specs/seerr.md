---
type: wayfinder-spec
label: wayfinder:spec
provider: seerr
status: draft
source_ticket: docs/in_progress/provider-e2e-spec/tickets/09-seerr-decision.md
source_research: docs/in_progress/provider-e2e-spec/research/seerr.md
---

# Seerr — E2E spec (migration note)

Seerr is the go-forward `MetadataProviderType` — the upstream Overseerr/Jellyseerr merger (Feb 2026,
`seerr-team/seerr`) means Seerr is where this provider is headed — but the live build target for this
pass is [Overseerr](overseerr.md), since that's the instance actually running today. This file records
what changes once Seerr is wired, not a parallel field-by-field spec.

## What sharing means

- `SEERR` stays a distinct `MetadataProviderType` alongside `OVERSEERR` (not a replacement) — someone
  still on Overseerr and someone on merged Seerr can each configure their own instance.
- Seerr routes through the **same** implementation as Overseerr: the same enricher, the same actuator
  tasks, the same `overseerr`-prefixed field names (`overseerrRequestStatus`, `overseerrHasIssue`,
  `overseerrRequestedAt`, etc. — see [`specs/overseerr.md`](overseerr.md) for the full field/task
  list). `SeerrProvider` already re-exports `OverseerrProvider` wholesale in the code today; this
  spec extends that pattern rather than replacing it.
- Implementation-time work this implies (not decided further here): add a `SEERR` case to
  `ProviderFactory.create()` alongside the existing `OVERSEERR` case (both constructing the shared
  provider class), and remove `SEERR` from the deferred provider types in `contract/scope.ts` so it's
  offered and configurable in the UI (its entry in the server's provider-type catalogue,
  `server/modules/providers/providerCatalogue.ts`, already exists).
- Because both types write into the same `overseerr`-prefixed fields, running Overseerr and Seerr
  simultaneously against two different instances would have one overwrite the other's enrichment
  data with no way to distinguish which provider a value came from. Not a concern today (nobody runs
  both), but worth a note if that ever becomes a real scenario.

## What's deferred until upgrade/verification

- **Live API compatibility is unverified.** Research found the three endpoints this codebase actually
  calls (`request`, `issue`, `search`) structurally unchanged between Overseerr and the merged Seerr
  project's current OpenAPI spec — divergence is concentrated in auth and media-server settings, which
  aren't wired for either provider. Treat this as a reasonable bet, not a confirmed fact. Verify
  against a live Seerr instance once the container is upgraded, before relying on the shared
  implementation in production.
- **Seerr-only surfaces, no Overseerr equivalent** — out of scope until upgrade:
  - Jellyfin/Emby auth and user-sync (`/auth/jellyfin`, non-Plex user import) — Jellyseerr's lineage
    supports non-Plex media servers; Overseerr is Plex-only. No design started.
  - Multi-Plex-server settings (`/settings/plex` describing more than one Plex instance) — may not fit
    the current one-`metadata_provider`-row-per-provider model. Flag as a possible structural schema
    gap if it turns out to be needed, once confirmed live against the targeted version.

## Filter type mapping

None — Seerr introduces zero net-new fields of its own; it shares Overseerr's exact field set and
`overseerr`-prefixed EnrichmentFields keys once wired (see `specs/overseerr.md`'s filter type mapping
for the actual widget/dataType decisions). Nothing to map here until Seerr is promoted from a
migration note to a full spec.

## UI decisions

No `/prototype` session and no `impeccable` pass needed — Seerr has no fields or tasks of its own to
run a UI pass against. Per the "What sharing means" section above, Seerr shares Overseerr's exact
implementation (same enricher, same actuator tasks, same `overseerr`-prefixed field names), so the
actual widget/parameter decisions already live in [`specs/overseerr.md`](overseerr.md)'s "UI
decisions" section — that is the source of truth, not this file. Nothing to record here until Seerr
is promoted from a migration note to a full spec (see "Trigger to revisit this file" below).

## Trigger to revisit this file

Upgrade the container to the merged Seerr project, then: (1) confirm `request`/`issue`/`search`
responses still match what `overseerrFieldProvider` expects, (2) decide whether the Jellyfin/Emby and
multi-Plex surfaces above are worth wiring, (3) promote this from a migration note to a full spec if
Seerr-specific surface work is scoped in.
