---
type: wayfinder-spec
label: wayfinder:spec
provider: overseerr
status: implementing
source_ticket: docs/in_progress/provider-e2e-spec/tickets/06-overseerr-decision.md
source_research: docs/in_progress/provider-e2e-spec/research/overseerr.md
---

# Overseerr — E2E spec

This spec covers the request-manager provider. In Warden it is one provider type, `SEERR`
(`SeerrProvider`), which serves an Overseerr server and a Seerr server alike because their APIs match.
The user's live instance is Overseerr until the NAS upgrades to Seerr. Every field and rule key takes
the `seerr` prefix. [`specs/seerr.md`](seerr.md) covers what stays deferred until the upgrade.

## Fields already wired (unchanged baseline)

| Domain field | Source | Flow |
|---|---|---|
| `seerrRequestStatus` | `MediaRequest.status` (1/2/3 = pending/approved/declined) | `seerrProvider.ts` → `mediaFieldProvider.ts` (`seerrFieldProvider`) → `enricherAdapters.ts` (`seerrEnricher`) → `ruleRegistry.ts` (numeric-equality filter) → `activeFieldSet.ts` |
| `seerrHasIssue` | Presence of any `Issue` on a title (boolean, collapses type/count) | Same chain as above; boolean predicate in `ruleRegistry.ts` |

## New fields to wire

All new fields follow the existing `seerr`-prefix naming convention. Flow for every row below is
the same shape as the two baseline fields: provider read (`seerrProvider.ts`) → field provider
(`mediaFieldProvider.ts`, `seerrFieldProvider`) → enrichment (`enricherAdapters.ts`,
`seerrEnricher`) → filter (`ruleRegistry.ts`) → `activeFieldSet.ts`.

| Domain field | Source | Notes |
|---|---|---|
| `seerrRequestedAt` | `MediaRequest.createdAt` | Enables "requests pending longer than N days" filter. |
| `seerrRequestedBy` | `MediaRequest.requestedBy` (User) | Store as user identifier/display name, not the full `User` object. UI filter: "requested by user X". |
| `seerrModifiedBy` | `MediaRequest.modifiedBy` (User \| string, nullable) | Who approved/declined the request. Audit field, not primarily a filter target. |
| `seerrRequestId` | `MediaRequest.id` | Task-target only — not a UI filter/column. Required so actuator tasks (approve/decline/etc.) have something to act on. |
| `seerrServerId` / `seerrProfileId` / `seerrRootFolder` / `seerrLanguageProfileId` | `MediaRequest.{serverId,profileId,rootFolder,languageProfileId}` | Sonarr/Radarr routing config carried on the request. Config-surface fields, not filterable — expose as read-only detail, not a filter widget. |
| `seerrIssueType` | `Issue.issueType` (undocumented locally, but present: video/audio/subtitle/other) | Single scalar per title (most-recent/most-severe issue), same shape as the existing `seerrHasIssue` boolean just richer. Does **not** attempt to represent multiple simultaneous issue types on one title — see Known limitations. |
| `seerrIssueStatus` | `Issue.status` (undocumented in the published schema but live in the API; 1=open, 2=resolved observed) | Replaces the pure-presence `seerrHasIssue` with an open/resolved distinction. Treat the codebase's live runtime read as authoritative over the published schema doc, per research finding. |
| `seerrIssueCreatedBy` / `seerrIssueModifiedBy` | `Issue.createdBy` / `Issue.modifiedBy` (User) | Who filed / last touched the issue. Audit fields. |
| `seerrHasComments` | Presence of any `IssueComment` on an issue | Presence-only boolean, same shape as `seerrHasIssue` today. No per-comment record is surfaced — see Known limitations. |
| `seerrRequestScope` | Derived from `MediaRequest.seasons` (`"all"` vs a season-number array) | Coarse scalar: `"all"` or `"partial"`. Not full per-season detail — see Known limitations. |

## Tasks / automation options (`MediaActuator`)

Modeled after the existing `RadarrProvider.tasks()` shape (`id`, `label`, `destructive`, `affects`,
`run`). Overseerr currently has no `MediaActuator` at all — this is a new implementation.

| Task | Endpoint | Destructive | User-facing description |
|---|---|---|---|
| Approve request | `POST /request/{id}/approve` | No | "Approve this pending request." |
| Decline request | `POST /request/{id}/decline` | No | "Decline this pending request." |
| Retry failed request | `POST /request/{id}/retry` | No | "Resend a failed request to Sonarr/Radarr." |
| Delete request | `DELETE /request/{id}` | Yes | "Permanently remove this request." |
| Update request | `PUT /request/{id}` | No | "Change season selection, quality profile, or routing on an existing request." Parameterized — needs a task-parameter UI (per map's UI-ticket guidance), not a single-click action. |
| Resolve issue | `POST /issue/{id}/resolved` | No | "Mark this issue as resolved." |
| Reopen issue | `POST /issue/{id}/open` | No | "Reopen a previously resolved issue." |
| Delete issue | `DELETE /issue/{id}` | Yes | "Permanently remove this issue." |
| Add issue comment | `POST /issue/{id}/comment` | No | "Add a comment to this issue." Parameterized (free-text message). |
| Override media availability status | `POST /media/{id}/{status}` | No (admin-only manual override) | "Manually set this title's availability status." Parameterized (status + optional `is4k`). Mutates `MediaInfo.status` — a different enum than `seerrRequestStatus`, disambiguate in UI copy. |

**Dropped from this pass:** Delete issue comment (`DELETE /issueComment/{id}`) — requires a specific
comment ID, and no comment records are surfaced anywhere (`seerrHasComments` is presence-only).
Revisit only if/when comment records get a real listing.

## Known limitations (accepted, not built this pass)

- **4K/non-4K request duality**: a title can carry both a 4K and non-4K `MediaRequest` simultaneously.
  `seerrFieldProvider.visit`'s tmdbId-keyed collapsing keeps only the last-seen request, silently
  dropping the other side's status. Stays as-is; documented as a known gap. Fixing it needs a compound
  key (tmdbId+is4k) or a second parallel field pair — a structural schema change, out of scope here.
- **Issue-type breakdown is single-valued**: `seerrIssueType` represents one issue's type per
  title, not simultaneous multiple types (e.g. a title with both a video issue and a subtitle issue
  open at once). True multi-type support needs a structural schema change.
- **`seerrHasComments` is presence-only**: no per-comment records (author, message, id) are
  surfaced. Full comment listing needs a new child table — deferred.
- **`seerrRequestScope` is coarse**: `"all"` vs `"partial"`, not which specific seasons were
  requested. Full per-season detail needs a new child table (season detail lives on child
  `SeasonRequest` objects, inherently multi-valued per request) — deferred.
- **`OverseerrRequest.type` field mismatch**: the codebase's local interface declares a `type: string`
  field that does not appear in the current official `MediaRequest` OpenAPI schema. Not spec'd or
  wired until verified against a live instance — may be stale/vestigial, or upstream may have changed
  the schema since the interface was written.

## Out of scope

- **User-management endpoints** (`/user/*`, permissions, quotas, watchlist import) — user
  administration, not a media-item field/filter/task.
- **Notification-config endpoints** (`/settings/notifications/*`) — Overseerr's own outbound
  notification config, not media data.
- Both excluded per the standing rule: an API surface that doesn't map to a collection of media items
  is not a task for this product.

## Naming-collision notes (for the final precedence ticket — not resolved here)

- **`status`** is heavily overloaded: `seerrRequestStatus` (request approval state, 1/2/3),
  `MediaInfo.status` (media availability, 1-6 — not yet wired, would need its own prefixed name e.g.
  `seerrMediaStatus` if the "override media availability" task's read side is ever surfaced as a
  filter), `seerrIssueStatus` (open/resolved, new in this spec), and `tmdbStatus` (TMDB's release
  state — already live). Four semantically distinct "status" fields; UI copy must disambiguate,
  especially since a UI filter literally labeled "Status" is a plausible target for any of them.
- **`seerrRequestedBy`** — generic enough in spirit to later collide with Plex's `added`/
  `plexAddedAt` (downloaded-to-library timestamp) or a future arr-stack "added by" field, if
  per-user attribution is ever wired elsewhere. Flag only, no current literal name collision.
- **`seerrRequestId`** — pure join/task-target key, not filterable, but should be reconciled with
  TMDB's `tmdbId` as the canonical identity field if request-level identity is ever surfaced directly.

## Filter type mapping

`seerrRequestStatus` and `seerrHasIssue` are already wired (see baseline table above) and are
not revisited here. Mapping below covers only the new fields from this spec that are meant to be
independently filterable; fields already noted above as audit-only, task-target-only, or config-surface
(`seerrModifiedBy`, `seerrRequestId`, `seerrServerId`/`seerrProfileId`/
`seerrRootFolder`/`seerrLanguageProfileId`, `seerrIssueCreatedBy`/
`seerrIssueModifiedBy`) are excluded, not mapped to a dataType.

| Domain field | Filter key | dataType | Notes |
|---|---|---|---|
| `seerrRequestedAt` | `seerrRequestedDaysAgo` | `range` | Date-shaped; follows the `addedDaysAgo`/`plexAddedDaysAgo` days-ago convention, not a raw date picker. Directly enables the spec's stated "pending longer than N days" use case. |
| `seerrRequestedBy` | `seerrRequestedBy` | `string` | Spec explicitly calls for "requested by user X" — single-value match against the stored user identifier/display name. |
| `seerrIssueType` | `seerrIssueType` | `csv-strings` | Small fixed value set (video/audio/subtitle/other); multi-select ("video OR subtitle issues") is a natural fit, same shape as `certification`/`genres`. |
| `seerrIssueStatus` | `seerrIssueStatus` | `number` | Mirrors the already-wired `seerrRequestStatus` rule exactly — small numeric enum (1=open, 2=resolved) modeled as single-value numeric-equality, per that existing precedent. |
| `seerrHasComments` | `seerrHasComments` | `boolean` | Presence-only, same shape as the already-wired `seerrHasIssue` boolean rule. |
| `seerrRequestScope` | `seerrRequestScope` | `string` | Coarse two-value scalar (`"all"` / `"partial"`); spec gives no multi-select ("all OR partial") use case, so single-value exact-match rather than `csv-strings`. |

Fields intentionally not mapped (no dataType — not independently filterable): `seerrModifiedBy`,
`seerrRequestId`, `seerrServerId`, `seerrProfileId`, `seerrRootFolder`,
`seerrLanguageProfileId`, `seerrIssueCreatedBy`, `seerrIssueModifiedBy` — per the spec's own
notes above, these are audit-only, task-target-only, or config-surface display fields.

### Tasks (automation options)

| Task | Parameter shape |
|---|---|
| Approve request | none |
| Decline request | none |
| Retry failed request | none |
| Delete request | none |
| Update request | multi-field (season selection, quality profile, routing) |
| Resolve issue | none |
| Reopen issue | none |
| Delete issue | none |
| Add issue comment | free-text |
| Override media availability status | multi-field (status + optional `is4k`) |

## UI decisions

Biggest UI pass in the map so far — six new filter fields to resolve, plus three tasks whose
parameter shapes don't fit anything `AutomationBuilder` or `useProviderTasks.ts` has seen. No field
below needed a `/prototype` session: every filterable field maps onto the four generic `RuleControl`
renderers already established across Plex/Jellyfin/Radarr/Sonarr/Tautulli's passes (`range` →
`NumberRangeFilter`, `csv-strings` → `MultiSelectFilter`, `boolean` → `OptionFilter`,
`string`/`number` → `OptionFilter` with a fixed `ENUM_OPTIONS` entry). The three complex task
parameters are **not** prototyped here — characterized and deferred to
[`11-automation-task-parameters`](../tickets/11-automation-task-parameters.md) per that ticket's own
scope.

### `seerrRequestedAt` — confirmed as `range` (`seerrRequestedDaysAgo`)

Straightforward, no correction needed. Same days-ago convention as `addedDaysAgo`/
`plexAddedDaysAgo`/Radarr's three release-date fields — renders via `NumberRangeFilter`, no new
control, no lookup.

### `seerrRequestedBy` — reclassified from `string` to `csv-strings`, new dedicated lookup route

The mapping table's `string` classification does not survive scrutiny, for the same reason Radarr's
`folderName`/`path` and Sonarr's `path` didn't: `RuleControl`'s `string`/`number` branch is strictly
an `ENUM_OPTIONS`-keyed fixed-value picker (confirmed again by reading `ruleRendersControl` and
`ENUM_OPTIONS` at `ref:src/components/MediaFilterBar/index.tsx#L885`), and the set of people who've
requested media on a given Overseerr instance is not a fixed enum — it's an open, per-instance,
growing list of arbitrary usernames. `ENUM_OPTIONS[rule.key]` would need to be hand-maintained per
deployment, which is not what that table is for (it holds the provider's own fixed API vocabulary —
`seriesStatus`, `radarrStatus`, etc. — not runtime library data).

**This is not the same gap as `folderName`/`path`, though.** Those fields needed *substring match on
an unenumerable string* — no control in this codebase does that, full stop, confirmed a second time
by Sonarr's ticket. `seerrRequestedBy` is different in kind: it's exact-match against a **finite,
enumerable-at-query-time** set of values (however many distinct requesters an instance has), which is
exactly what `csv-strings` + a `Lookups`-sourced list already handles — the same shape as `network`
(`lookups.networks: string[]`, a flat fetched string array, no id/label pair needed since there's no
separate "requester id" to preserve). So the fix isn't "defer, no control exists" — it's "the
mapping table chose the wrong dataType for a field that already has a fitting one."

**Decision: `seerrRequestedBy` is `csv-strings`**, filter key unchanged
(`seerrRequestedBy`), rendering via `MultiSelectFilter`/`csvStringOptions`. Needs a new
dedicated lookup: `Lookups` gains `seerrRequesters: string[]`, `csvStringOptions` gets a new
branch (`if (rule.key === 'seerrRequestedBy') return lookups.seerrRequesters;`), and
`useMediaLookups.ts` gets a new `/api/media/seerr-requesters` route returning the distinct set of
`MediaRequest.requestedBy` display names/identifiers seen on the instance, following the
`listGenres`/`listNetworks` dedupe-and-sort pattern. This is a genuinely new field/route, not
semantic reuse — checked all five closed specs' "UI decisions" sections and none has a
requester/user-identity field; Overseerr's request/issue-attribution domain is unrelated to the
media-metadata fields (genres, studios, codecs, etc.) the first five providers cover.

**Correction to the "Filter type mapping" table above**: `seerrRequestedBy`'s dataType is
`csv-strings`, not `string`, and it gets its own lookup route rather than rendering nothing.

**On the "third `string`-mismatch occurrence" question**: this is *not* that third occurrence. The
mismatch class Radarr and Sonarr flagged is specifically "open value set with no fitting control at
all" (substring/free-text match on paths). `seerrRequestedBy` turns out to have a fitting
control once correctly classified (`csv-strings` + lookup) — the mapping table's error was choosing
`string` instead of `csv-strings`, not a case where no renderer exists. The free-text/substring gap
count stays at **two** (`folderName`/`path`, Sonarr's `path`) after this ticket. Nothing in this
Overseerr pass adds to it — worth stating explicitly since the ticket asked to watch for a third.

### `seerrIssueType` — `csv-strings`, options sourced from a hardcoded fixed array, not `Lookups`

Confirmed the mechanism question by reading `csvStringOptions` directly
(`ref:src/components/MediaFilterBar/index.tsx#L953`): it's a plain function, `(rule, scope, lookups)
=> string[] | null`, dispatching on `rule.key` with an `if` chain — nothing about `csv-strings` as a
`dataType` structurally requires the options come from `lookups`/a fetched route. `lookups` is just
one parameter available to reach for; a branch can return a literal array and ignore it entirely,
exactly the way `ENUM_OPTIONS` is a hardcoded table for `string`/`number` rules. Checked whether any
existing `csv-strings` field already does this (a precedent to point to) — it doesn't:
`certification` is the one `csv-strings` rule in the registry with no options source at all today
(still an open, cross-provider-flagged gap per Plex's and Jellyfin's specs, not fixed), and every
*live* `csv-strings` field (`genres`, `network`, and now `seerrRequestedBy` above) routes through
`lookups`. So this is the first genuinely fixed-and-small `csv-strings` value set in the map — no
precedent to reuse, but nothing blocks the mechanism either.

**Decision: `seerrIssueType` gets a hardcoded fixed-array branch in `csvStringOptions`**, not a
new lookup route:

```
if (rule.key === 'seerrIssueType') return ['video', 'audio', 'subtitle', 'other'];
```

Reasoning: Overseerr's `Issue.issueType` enum is fixed API vocabulary (four values, not runtime
library data that grows per-instance) — the same category of thing `ENUM_OPTIONS` exists for, just
needed as a multi-select rather than single-value. Routing it through a `/api/media/*` fetch would
be pure overhead: a network round-trip to return four values that never change and aren't specific
to any instance's data, unlike `seerrRequestedBy`'s genuinely per-instance requester list above.
`MultiSelectFilter`/`csvStringOptions`'s signature already accommodates this with zero
changes to the renderer — only `csvStringOptions`'s body gets a new `if` arm, same footprint as
`ENUM_OPTIONS` gaining an entry. No new `Lookups` field, no new route, no `useMediaLookups.ts` change.

### `seerrIssueStatus` — confirmed as `number`, mirrors `seerrRequestStatus`

Clean win as flagged. Add to `ENUM_OPTIONS` (`ref:src/components/MediaFilterBar/index.tsx#L885`):

```
seerrIssueStatus: [
  { value: '1', label: 'Open' },
  { value: '2', label: 'Resolved' },
]
```

Same shape as the already-wired `seerrRequestStatus` entry directly above it in the table —
numeric-equality `OptionFilter`, no new control. Given the naming-collision note in this spec's own
"Naming-collision notes" section (four distinct `status` fields), the segment label should read
"Issue status," not bare "Status" — add `seerrIssueStatus: 'Issue status'` to
`SEGMENT_LABEL_OVERRIDES` (`ref:src/components/MediaFilterBar/index.tsx#L870`) rather than leaving it
to default to the registry label, so the filter UI disambiguates from `seerrRequestStatus`
(already overridden to plain `'Status'`) and any future `seerrMediaStatus`.

### `seerrHasComments` — confirmed as `boolean`, add a `BOOLEAN_VALUE_LABELS` entry

Same shape as `seerrHasIssue`. Add to `BOOLEAN_VALUE_LABELS`
(`ref:src/components/MediaFilterBar/index.tsx#L850`), matching `seerrHasIssue`'s existing
`['Has Issue', 'No Issue']` pattern rather than falling back to the generic `Yes`/`No` pair:

```
seerrHasComments: ['Has Comments', 'No Comments'],
```

### `seerrRequestScope` — confirmed as `string`/`ENUM_OPTIONS`, genuine closed set

Unlike `seerrRequestedBy`, this one is legitimately a fixed two-value enum — `"all"`/`"partial"`
is Overseerr's own derived vocabulary (from `MediaRequest.seasons`), not open per-instance data,
same category as `seriesStatus`/`radarrStatus`. Add to `ENUM_OPTIONS`:

```
seerrRequestScope: [
  { value: 'all', label: 'All seasons' },
  { value: 'partial', label: 'Some seasons' },
]
```

### Summary of corrections to the "Filter type mapping" table above

| Domain field | Table said | Actual | Why |
|---|---|---|---|
| `seerrRequestedBy` | `string` | `csv-strings` + new `seerrRequesters` lookup route | Open per-instance value set, not a fixed enum — but *is* enumerable at query time, unlike `folderName`/`path`'s unenumerable substring-match gap. |

All other rows in the mapping table are confirmed as-is (`seerrRequestedAt`, `seerrIssueType`,
`seerrIssueStatus`, `seerrHasComments`, `seerrRequestScope`) — no other correction needed.

### Task parameter shapes deferred to ticket 11

`Update request`, `Add issue comment`, and `Override media availability status` all need
parameter-collection UI `AutomationBuilder` doesn't have today. Per this ticket's scope, the actual
input UI is **not** designed here — each task's distinct shape is appended to
[`11-automation-task-parameters`](../tickets/11-automation-task-parameters.md)'s "Parameter shapes
recorded by deferring tickets" section instead, since none of the three fit the "single-select from a
fetched list" shape every prior entry there has used. See that ticket for the recorded shapes.

`Approve request` / `Decline request` / `Retry failed request` / `Delete request` / `Resolve issue` /
`Reopen issue` / `Delete issue` need no parameter — plain id/label radio entries, already fit
`AutomationBuilder`'s existing (if currently non-functional-for-parameterized-tasks) list UI.
