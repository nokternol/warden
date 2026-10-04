# Seerr — API surface audit

Source: web research against Jellyseerr/Seerr's official API documentation (`docs.seerr.dev`,
`seerr-team/seerr` — see naming note below) and its OpenAPI spec (`seerr-api.yml`, `develop`
branch). Codebase audit as of this ticket: `git rev-parse HEAD` at time of writing = `855d514`
(post EAV-enrichment refactor).

Codebase entry points read: `server/modules/providers/connections/seerrProvider.ts`,
`server/modules/providers/connections/overseerrProvider.ts` (Seerr re-exports this wholesale),
`server/modules/providers/providerFactory.ts`, `server/modules/providers/connectionProbe.ts`
(L4-15, L58-59), `server/modules/providers/providers.procedures.ts` (L117-122),
`server/database/schema.ts` (`MetadataProviderType.SEERR`), `src/lib/provider-registry.ts`,
`server/modules/media/enrichment/enricherAdapters.ts`, `server/modules/media/filterRegistry.ts`,
`docs/architecture/media-providers.md` (existing "Seerr" section, L144-266).

## Naming note — read this before anything else in this doc

**"Seerr" is now an overloaded name outside this codebase, independent of anything inside it.**
As of a February 2026 upstream announcement, the Jellyseerr and Overseerr projects **merged into a
single unified open-source project literally named "Seerr"** (`seerr-team/seerr`, docs at
`docs.seerr.dev`, superseding both `sct/overseerr` and `fallenbagel/jellyseerr`, which are now
deprecated in favor of it). This is a coincidental collision, not a causal one: this codebase's
`MetadataProviderType.SEERR` enum value and `seerrProvider.ts` almost certainly predate that
merger and were named when "Seerr"/"Jellyseerr" meant *specifically* the Jellyfin-supporting fork
of Overseerr — a **distinct product** from Overseerr at the time, which is exactly the premise the
research ticket asked to verify rather than assume.

Practical effect for this map: **the codebase's `SEERR` type is ambiguous about which product it
targets.**
- If it means "the Jellyseerr fork, pre-merger API shape" — that product's API is what's audited
  below (fetched from the pre-merger-lineage spec/history, cross-checked against the current
  merged-project docs where the pre-merger spec wasn't independently reachable).
- If it means "whatever 'Seerr' is today" — that's now the *same upstream codebase* Overseerr
  itself will presumably converge on, which would make a separate `SEERR` `MetadataProviderType`
  redundant with `OVERSEERR` going forward, not just similar to it.

This ambiguity is itself a flag for the decision ticket, not something this research resolves.

## Wired today

**Nothing.** Confirmed via direct read, not inference:

- `server/modules/providers/connections/seerrProvider.ts` is a one-line re-export:
  `export { OverseerrProvider as SeerrProvider };` with a comment asserting "Seerr is a fork of
  Overseerr with an identical API." This class has **no implementation of its own** — it inherits
  whatever `OverseerrProvider` does (three endpoints: `getRequests()`, `getIssues()`, `search()` —
  see `docs/in_progress/provider-e2e-spec/research/overseerr.md` for that audit). The comment's
  "identical API" claim is asserted, not verified anywhere in-repo; see naming note above and the
  divergence section below for why it should be treated as unverified.
- `ProviderFactory.create()` (`providerFactory.ts:53-74`) has cases for RADARR, SONARR, PLEX,
  JELLYFIN, TAUTULLI, OVERSEERR, TMDB, OMDB — **no `SEERR` case**. Falls through to
  `default: throw new Error('Unsupported provider type: ...')`. Confirmed by reading the switch
  directly; the ticket's stated known-state is accurate.
- `AnyProvider` union type (`providerFactory.ts:18-26`) and `ProviderSet` interface
  (`providerFactory.ts:34-39`) both omit Seerr entirely — it isn't even a constructible type from
  the factory's perspective, let alone assigned a named slot.
- `server/modules/media/enrichment/enricherAdapters.ts` has an `overseerrEnricher` function
  (L46-64) but no `seerrEnricher` — and couldn't have one today, since `ProviderFactory` can't
  construct a `SeerrProvider` instance in the first place.
- `server/modules/media/filterRegistry.ts` has `overseerrRequestStatus`/`overseerrHasIssue` filter
  rules (L446-469) with `sourceProviders: deriveSourceProviders(...)` scoped to Overseerr's field
  names only — no Seerr-scoped filter exists.
- `src/lib/provider-registry.ts`'s `PROVIDER_REGISTRY` has exactly 8 keys (PLEX, JELLYFIN, RADARR,
  SONARR, TAUTULLI, OVERSEERR, TMDB, OMDB) — **confirmed no `SEERR` key**. This is the UI-facing
  provider list (`getProviderEntry`, `getProviderOrder`, `getProviderTypes` all iterate this
  object), so Seerr is invisible to any UI that walks the registry, independent of any backend
  wiring gap. **Flagging explicitly per the ticket: this is a concrete, low-ambiguity gap** — adding
  an entry doesn't require resolving the identity/naming question above, it's a mechanical
  registry-completeness fix once decided worth doing at all.

The **only** place Seerr is referenced beyond the dead-end connection class:

- `connectionProbe.ts` L11 (`API_SUFFIXES.SEERR: ''`) and L58-59 (`case
  MetadataProviderType.SEERR: case MetadataProviderType.OVERSEERR:` share a connection-test probe
  hitting `GET {base}/api/v1/status` with an `X-Api-Key` header).
- `providers.procedures.ts` L117-122: the settings-page "test connection" `getData` route shares a
  case between `OVERSEERR` and `SEERR`, and **directly instantiates `new OverseerrProvider(config,
  log)`** (not `SeerrProvider` — the re-export isn't even used here) to call `getRequests()` for a
  connection-test preview payload.

Net effect: a user can configure a Seerr provider row in settings and successfully test the
connection (assuming a Jellyseerr/Seerr instance answers `/api/v1/status` and `/api/v1/request`
the same way Overseerr does) — and that is the entire extent of what happens. No enrichment, no
filter, no actuator, no UI registry entry, no `ProviderFactory` construction path outside the
settings/test-connection routes.

## Divergence from Overseerr (why "identical API" is not safe to assume)

Findings from Jellyseerr's/Seerr's own documentation and release history, not inferred from
Overseerr:

- **Media-server sync scope differs.** Overseerr syncs exclusively from Plex. Jellyseerr (Seerr's
  direct ancestor) was built to sync from **Jellyfin or Emby**, with Plex support added afterward —
  i.e., Jellyseerr supports a *superset* of media-server backends, not just an API-identical
  request/issue layer bolted onto the same Plex-only model. This means auth and user-import
  endpoints (`/auth/jellyfin`, `/auth/plex`, `/auth/local`, and historically Emby-specific paths)
  have no Overseerr equivalent for the non-Plex cases — Overseerr only ever had `/auth/plex` and
  `/auth/local`.
- **Multi-Plex-server support**: the current merged "Seerr" docs/spec describe `/settings/plex`
  differently in shape than the historical single-Plex-instance model; multi-server support for
  Plex specifically was a long-standing Jellyseerr/Overseerr feature request (tracked upstream
  since 2022) that appears to have landed as part of consolidating the two projects. Whether the
  *specific* Jellyseerr version this codebase's `SeerrProvider` was presumably written against had
  this is unverified — flagging as a version-currency unknown, not a fact either way.
- **Request/Issue/Search shape**: the `MediaRequest` and `Issue` schemas' core fields (`id`,
  `status`, `media.tmdbId`, `createdAt`, `requestedBy`, `issueType`, `comments`, etc. — see the
  Overseerr research doc for the full enumeration) appear structurally unchanged in the current
  Seerr OpenAPI spec — this part of the "identical API" claim looks plausible for the
  request/issue/search endpoints specifically, since Jellyseerr always was a fork rather than a
  from-scratch rewrite. The divergence is concentrated in **auth and media-server settings**, not
  in the request/issue data model the codebase currently touches (which is also the *only* part
  `OverseerrProvider`/`SeerrProvider` calls today — `getRequests`, `getIssues`, `search`, all under
  `/api/v1/{request,issue,search}`).
- **Net assessment**: for the three endpoints this codebase's connection class actually calls, the
  "identical API" comment in `seerrProvider.ts` is plausible and likely low-risk if verified
  against a real instance. For anything beyond those three endpoints (auth, settings, user
  management, multi-server config) — none of which is wired today either — the claim does **not**
  hold, and any future work assuming full parity should verify against a live Jellyseerr/Seerr
  instance rather than trust the comment as written.

## Not wired — request/issue/search fields (would mirror Overseerr's, if wired)

Since `SeerrProvider` is a bare re-export of `OverseerrProvider`, every not-wired field/gap
catalogued in `docs/in_progress/provider-e2e-spec/research/overseerr.md`'s "Not wired — request
fields", "Not wired — issue fields", and structural-gap sections applies identically to Seerr *if
and when* it's wired the same way — down to the same field names, since it would be the same
class. Not re-enumerated here field-by-field to avoid duplicating that doc; cross-reference it
directly. Layer for all of them, if Seerr is wired: provider field + enrichment + UI filter +
(for the structural items — 4K/non-4K duality, per-season detail, issue comments, issue-type
breakdown) the same schema-change flags already raised for Overseerr.

The one respect in which Seerr's not-wired set is **not** simply a copy of Overseerr's: everything
Overseerr already has wired (request status, has-issue) is *also* not-wired for Seerr, because
`ProviderFactory` can't construct a `SeerrProvider` at all. So Seerr's gap is a strict superset —
it needs the "already done for Overseerr" wiring redone (or shared) *and* carries all of
Overseerr's own remaining gaps on top.

## Not wired — actions/tasks (candidate `MediaActuator.tasks()` entries)

Same candidate list as Overseerr's research doc (approve/decline/retry/delete request, resolve/
reopen/delete issue, add/delete issue comment, override media availability status) — identical
endpoints, identical `/api/v1/request/{id}/...` and `/api/v1/issue/{id}/...` shapes, per the
divergence assessment above (request/issue endpoints look unchanged from Overseerr's). Not
re-enumerated field-by-field; cross-reference the Overseerr doc. No `MediaActuator` exists for
either provider today.

## Not wired — Seerr-specific surface with no Overseerr equivalent

- **Jellyfin/Emby auth and user-sync endpoints** (`/auth/jellyfin`, user-import from a non-Plex
  media server) — genuinely Seerr/Jellyseerr-only surface, no Overseerr analog to cross-reference.
  Layer: entirely new provider-field/config surface if ever modeled; likely db/config (auth
  credentials) rather than a media-item field.
- **Multi-server Plex settings** (`/settings/plex` describing more than one Plex instance) — if
  confirmed present in whichever Seerr version this app targets, this doesn't fit the existing
  single-`settings`-JSON-blob-per-provider-row model this app uses for all other providers today
  (one `metadata_provider` row per provider instance, per `docs/architecture/media-providers.md`
  and the schema). **Flag: potential structural-schema gap** — not confirmed live, since it depends
  on which Seerr/Jellyseerr version is targeted (see naming note), but worth surfacing now rather
  than discovering it mid-implementation.

## Naming-collision risks (flagged, not resolved)

- **"Seerr" the product name vs. `MetadataProviderType.SEERR` the enum value** — see the naming
  note at the top of this doc. This is a collision between the codebase's identifier and an
  external product's current branding, not a same-repo field collision, but it's exactly the kind
  of "flag, don't resolve" naming risk the ticket asked for: a future contributor reading "Seerr"
  in this codebase without this context could easily assume it targets the current unified
  `seerr-team/seerr` project rather than the pre-merger Jellyseerr fork it was presumably written
  against.
- **All Overseerr field-name collisions apply identically if Seerr is wired with its own
  `seerr`-prefixed field names** (e.g. a hypothetical `seerrRequestStatus` alongside
  `overseerrRequestStatus`) — same `status`-overload risk (`MediaRequest.status` vs `MediaInfo.status`
  vs TMDB's `tmdbStatus`) documented in the Overseerr research doc, doubled if both providers are
  ever configured simultaneously and their fields aren't clearly distinguished in UI copy. Flag for
  the precedence ticket.
- **If Seerr is ever wired to *share* Overseerr's field names outright** (rather than getting its
  own `seerr`-prefixed set) — e.g. both write into the same `overseerrRequestStatus` EAV
  field — that's a deliberate design choice with its own collision risk (a user running both
  Overseerr *and* Seerr simultaneously, pointed at different instances, would have one overwrite
  the other's enrichment data with no way to distinguish which provider a value came from). Flagging
  as a consideration for the decision ticket's "share code with Overseerr" question below, not
  resolving it.

## Structural schema-change gaps (flagged, not designed)

1. All four gaps already flagged in the Overseerr research doc (4K/non-4K request duality,
   per-season request detail, issue comments, issue-type breakdown) apply identically if/when
   Seerr is wired via the same `OverseerrProvider`-derived field-provider shape.
2. **Multi-Plex-server settings** (see above) — new, Seerr-specific, unconfirmed for the exact
   targeted version but worth flagging now: would not fit the current one-`metadata_provider`-row
   model without a structural change (either a child table for multiple server entries per
   provider row, or a JSON array within the existing `settings` blob if the shape stays
   config-only and never needs to be queried/filtered directly).

## The central open question for the decision ticket

Since literally nothing is wired for Seerr today (not even a `ProviderFactory` case), the decision
ticket's central question is not "which fields to add" but **which of two build strategies to
follow**:

1. **Duplicate**: give Seerr its own full `MediaSource`/`MediaEnricher`/`MediaActuator`
   implementation, parallel to Overseerr's, wired independently through `ProviderFactory`,
   `enricherAdapters.ts`, and `filterRegistry.ts` with `seerr`-prefixed field names.
2. **Share**: reuse Overseerr's enricher/actuator code paths against a Seerr-typed connection
   instance (extending `ProviderFactory`'s existing `instanceof OverseerrProvider` checks and
   `overseerrEnricher`'s field provider to also accept/produce Seerr-sourced data, given
   `SeerrProvider` is currently structurally identical to `OverseerrProvider` — literally the same
   class), likely writing into the *same* `overseerr`-prefixed fields (with the collision risk
   noted above) rather than duplicating names.

Findings that bear on this without deciding it:
- The request/issue/search endpoints this codebase actually touches appear structurally unchanged
  between Overseerr and Seerr/Jellyseerr (see divergence section) — this favors "share" for the
  narrow slice currently wired for Overseerr.
- The upstream Feb 2026 Overseerr/Jellyseerr merger into one shared "Seerr" codebase (see naming
  note) means upstream itself is trending toward "these are the same product" for *future*
  versions — which could make today's "duplicate" investment obsolete faster than a shared
  approach, or could mean "Seerr" and "Overseerr" as distinct `MetadataProviderType`s become
  redundant entirely once users are all on the merged upstream. Worth the decision ticket
  considering whether keeping two enum values long-term make sense at all, independent of the
  build-strategy question.
- Seerr/Jellyseerr's Jellyfin/Emby-specific surface (auth, user-sync) has no Overseerr equivalent
  to share — any "share" strategy would necessarily be partial (shared for request/issue/search,
  standalone for anything Jellyfin/Emby-specific, if that's ever wired at all).

## Not-yet-wired field/task count

Distinct items flagged in this doc, counting only items not already covered by a 1:1 cross-
reference note to the Overseerr doc's own count:

- 1 gap: `PROVIDER_REGISTRY` missing `SEERR` entry entirely (mechanical, low-ambiguity).
- 1 gap: `ProviderFactory.create()` missing `SEERR` case (blocks everything else).
- 1 gap: no `seerrEnricher`/`MediaEnricher` role wired (blocked by the above).
- 1 gap: no `MediaActuator` role wired (same as Overseerr's own gap — doubled by nothing existing
  to extend).
- 2 Seerr-specific surfaces with no Overseerr equivalent: Jellyfin/Emby auth+user-sync, multi-Plex-
  server settings.
- Plus the full 24-item not-wired set from the Overseerr research doc, which applies identically
  once/if Seerr shares or duplicates that wiring (not re-counted here to avoid double-counting;
  see that doc for the itemized 24).

**6 Seerr-specific newly-flagged items in this doc**, on top of the Overseerr doc's existing 24
that would carry over identically.
