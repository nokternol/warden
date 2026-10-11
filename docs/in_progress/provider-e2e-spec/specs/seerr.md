---
type: wayfinder-spec
label: wayfinder:spec
provider: seerr
status: implementing
source_ticket: docs/in_progress/provider-e2e-spec/tickets/09-seerr-decision.md
source_research: docs/in_progress/provider-e2e-spec/research/seerr.md
---

# Seerr — E2E spec (migration note)

Seerr is the one request-manager `MetadataProviderType` — the upstream Overseerr/Jellyseerr merger
(Feb 2026, `seerr-team/seerr`) is where this provider is headed. The live instance is Overseerr until
the NAS upgrades, and the same type serves it. Field-by-field and task decisions live in
[`specs/overseerr.md`](overseerr.md); this file records what is deferred until the upgrade.

## What sharing means

- `SEERR` is the only request-manager type. `ProviderFactory` builds `SeerrProvider` for it, and
  `contract/scope.ts` offers it. There is no separate Overseerr type: an Overseerr server is
  configured as a Seerr provider, since the APIs this codebase calls match.
- Seerr's fields and rule keys take the `seerr` prefix (`seerrRequestStatus`, `seerrHasIssue`, and the
  unbuilt fields in [`specs/overseerr.md`](overseerr.md)).

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
`seerr`-prefixed EnrichmentFields keys (see `specs/overseerr.md`'s filter type mapping
for the actual widget/dataType decisions). Nothing to map here until Seerr is promoted from a
migration note to a full spec.

## UI decisions

No `/prototype` session and no `impeccable` pass needed — Seerr has no fields or tasks of its own to
run a UI pass against. Per the "What sharing means" section above, Seerr shares Overseerr's exact
implementation (same enricher, same actuator tasks, same `seerr`-prefixed field names), so the
actual widget/parameter decisions already live in [`specs/overseerr.md`](overseerr.md)'s "UI
decisions" section — that is the source of truth, not this file. Nothing to record here until Seerr
is promoted from a migration note to a full spec (see "Trigger to revisit this file" below).

## Trigger to revisit this file

Upgrade the container to the merged Seerr project, then: (1) confirm `request`/`issue`/`search`
responses still match what `seerrFieldProvider` expects, (2) decide whether the Jellyfin/Emby and
multi-Plex surfaces above are worth wiring, (3) promote this from a migration note to a full spec if
Seerr-specific surface work is scoped in.
