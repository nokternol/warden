# Overseerr — API surface audit

Source: Overseerr's official OpenAPI spec (`overseerr-api.yml`, `sct/overseerr` `develop` branch,
mirrored at https://api-docs.overseerr.dev). Codebase audit as of this ticket: `git rev-parse HEAD`
at time of writing = `855d514` (post EAV-enrichment refactor).

Codebase entry points read: `server/modules/providers/connections/overseerrProvider.ts`,
`server/modules/media/mediaFieldProvider.ts` (`overseerrFieldProvider`, L117-147),
`server/modules/media/enrichment/enricherAdapters.ts` (`overseerrEnricher`, L46-64),
`server/modules/media/ruleRegistry.ts` (L447-468), `server/modules/providers/providerFactory.ts`,
`server/modules/media/activeFieldSet.ts` (L19), `src/lib/provider-registry.ts` (L57-65).

## Wired today

Overseerr's connection class (`OverseerrProvider`, `overseerrProvider.ts`) only calls three
read-only endpoints: `GET /api/v1/request`, `GET /api/v1/issue`, `GET /api/v1/search`. Of those,
only `getRequests()` + `getIssues()` feed the enrichment pipeline; `search()` is used for media
lookup, not field enrichment.

| Field (API) | Codebase name | Wired at |
|---|---|---|
| `MediaRequest.status` (number, 1=PENDING/2=APPROVED/3=DECLINED) | `overseerrRequestStatus` | `overseerrProvider.ts:16` (`OverseerrRequest.status`) → `mediaFieldProvider.ts:139,144` (`overseerrFieldProvider`) → `enricherAdapters.ts:59` → `ruleRegistry.ts:447-458` (filter `key: 'overseerrRequestStatus'`, numeric-equality predicate) → `activeFieldSet.ts:19` |
| Issue existence (any issue on a title) | `overseerrHasIssue` (boolean, presence-only — collapses count/type) | `overseerrProvider.ts:35` (`OverseerrIssue.status` is fetched but never read) → `mediaFieldProvider.ts:140,145` → same enrichment/filter/activeFieldSet chain as above (`ruleRegistry.ts:460-468`, boolean predicate) |
| `MediaRequest.media.tmdbId` | join key only | `overseerrProvider.ts:19` (`OverseerrMedia.tmdbId`), used as the map key in `overseerrFieldProvider.visit`, never surfaced as its own field |
| `search` (`GET /api/v1/search`) — `id`, `mediaType`, `title`/`name`, `overview`, `mediaInfo` | not enrichment; used by `media.search.procedures.ts` (`searchProvider()`) for interactive search, separate from the field/filter/enrichment pipeline | `overseerrProvider.ts:74-83` |

No `MediaActuator` implementation exists for Overseerr (confirmed: `tasks()` appears only in
`radarrProvider.ts`, `sonarrProvider.ts`, `plexProvider.ts`, `jellyfinProvider.ts`,
`tautulliProvider.ts` — Overseerr is absent from that list). `providerFactory.ts` instantiates
`OverseerrProvider` (L65-66) but never registers it as an actuator alongside the arr providers
(`providerFactory.ts:83` only special-cases it for the non-actuator provider set). `provider-registry.ts`
lists a single `filterCapabilities: ['Request queue']` (L64) with no task/automation capability tag.

## Not wired — request fields (`MediaRequest` schema)

- `id` — request's own numeric ID. Not surfaced (only used internally for actuator target IDs, if
  actuator existed). Layer if added: provider field + possibly UI (a "request ID" filter/column is
  low value; likely task-target only).
- `type` (codebase's `OverseerrRequest.type: string`) — **not present in the current official
  OpenAPI `MediaRequest` schema at all**; the schema has `mediaType` living on `MediaInfo`/request
  bodies, not as a `MediaRequest` response field. This looks like a mismatch between the codebase's
  local `OverseerrRequest` interface (which declares `type: string`, `overseerrProvider.ts:17`) and
  the current upstream schema. Flag: **verify against a live Overseerr instance** — either the type
  is stale/vestigial in the codebase, or upstream added/removed it since the interface was written.
  Not a spec item until resolved; flagging as a data-integrity gap, not deciding it here.
- `createdAt` / `updatedAt` (timestamps) — not wired. Layer: provider field + enrichment (a
  "requested at" filter, e.g. "requests older than N days pending"). `createdAt` exists in the local
  interface already (`overseerrProvider.ts:20`) but is discarded in `overseerrFieldProvider.visit`.
- `requestedBy` (full `User` object: id, email, username, plexUsername, permissions, avatar,
  requestCount) — codebase declares `OverseerrRequestedBy` (id/displayName/email,
  `overseerrProvider.ts:3-7`) but never reads it in `overseerrFieldProvider`. Not wired to
  enrichment/filter. Layer: provider field + UI filter ("requested by user X") + possibly a new
  lookup table if per-user request stats are wanted (structural — see below).
- `modifiedBy` (User | string, nullable) — who approved/declined. Not wired. Layer: provider field +
  enrichment + UI filter/audit column.
- `is4k` (boolean) — whether the request targets the 4K profile. Not wired at all (not even declared
  in the local `OverseerrRequest` interface). Layer: provider field + UI filter (e.g. "has 4K
  request"). Since a title can have both a non-4K and a 4K request as *separate* `MediaRequest`
  rows, the current `byTmdbId` collapsing in `overseerrFieldProvider.visit` (last-request-wins per
  tmdbId, no `is4k` split) is a **structural gap**: representing "has pending 4K request" alongside
  "has pending non-4K request" for the same title needs either a compound key (`tmdbId`+`is4k`) or a
  second field pair, not just a new column.
- `seasons` (present on request/update request bodies as array of season numbers or `"all"`, not
  directly on the `MediaRequest` read schema — season detail lives on child `SeasonRequest`
  objects per-request, not modeled in the codebase's flat `OverseerrRequest`) — **not wired,
  structural gap**: the EAV enrichment shape (per migration 0018) stores one value per field per
  media item; "which seasons were requested" is inherently multi-valued per request and doesn't fit
  a scalar field without a new child table or JSON column. Flag for schema review.
- `serverId` / `profileId` / `rootFolder` / `languageProfileId` — Sonarr/Radarr routing config on
  the request. Config surface, not really a filterable/enrichable field. Layer: db/config only, low
  priority.

## Not wired — issue fields (`Issue` / `IssueComment` schemas)

- `issueType` (number: enum of video/audio/subtitles/other per `/issue/count`'s response shape) —
  codebase's local `OverseerrIssue` interface doesn't even declare this field (only `id`, `status`,
  `media.tmdbId`, `overseerrProvider.ts:33-37`). Not wired. Layer: provider field + UI filter
  ("issue type = subtitles") + enrichment (currently `overseerrHasIssue` collapses all issue types
  into one boolean — a real gap since a title could have e.g. only a "video" issue vs. only a
  "subtitle" issue and callers can't distinguish).
- `status` on `Issue` — the official schema's `Issue` object (as fetched) does **not** list `status`
  as a documented property (only `id`, `issueType`, `media`, `createdBy`, `modifiedBy`, `comments`),
  but the `/issue/{issueId}/{status}` action endpoint's path param takes `open`/`resolved`, and the
  codebase's local `OverseerrIssue.status: number` field (`overseerrProvider.ts:35`) is read from
  the live API response despite not appearing in the published schema doc. This is an
  **undocumented-but-live field** — treat the codebase's runtime behavior as more trustworthy than
  the schema doc here, but flag the discrepancy. Currently only used as a presence signal
  (`hasIssue = true` for any status, `mediaFieldProvider.ts:140`) — the actual open/resolved
  distinction is discarded. Not wired: "issue currently open" vs. "resolved" as separate filterable
  states.
- `createdBy` (`User`) — who filed the issue. Not wired. Layer: provider field + UI filter.
- `modifiedBy` (`User`) — who last touched the issue (e.g. resolver). Not wired. Layer: provider
  field + UI filter/audit.
- `comments` (array of `IssueComment`: id, user, message) — not wired at all. Layer: this is
  genuinely structural — comments are an unbounded per-issue collection, not a scalar field; would
  need a child table, not a `settings`-blob config value or a single EAV row. Flag for schema
  review if a "view/add issue comments" UI is ever wanted.

## Not wired — actions / tasks (candidate `MediaActuator.tasks()` entries)

No Overseerr actuator exists today (see "Wired today" above). Candidate tasks from the API surface,
modeled after the existing `RadarrProvider.tasks()` pattern (`id`, `label`, `destructive`,
`affects`, `run`):

| Candidate task | Endpoint | Notes |
|---|---|---|
| Approve request | `POST /request/{requestId}/approve` (`/request/{requestId}/{status}` with `status=approve`) | non-destructive; `affects: 'media'` |
| Decline request | `POST /request/{requestId}/decline` (same path, `status=decline`) | non-destructive but blocks acquisition; arguably `destructive: false` per the Radarr precedent (destructive there means data loss, not "changes access") |
| Retry failed request | `POST /request/{requestId}/retry` | resends to Sonarr/Radarr; non-destructive |
| Delete request | `DELETE /request/{requestId}` | destructive: true (removes the request record) |
| Update request (season/profile/etc.) | `PUT /request/{requestId}` | parameterized task, needs a task-parameter UI (per map's UI-ticket guidance) |
| Resolve issue | `POST /issue/{issueId}/resolved` (`/issue/{issueId}/{status}`) | non-destructive |
| Reopen issue | `POST /issue/{issueId}/open` (same path) | non-destructive |
| Delete issue | `DELETE /issue/{issueId}` | destructive: true |
| Add issue comment | `POST /issue/{issueId}/comment` | parameterized task (free-text message param) — same structural comment-table gap as above if comments are to be displayed, but *adding* one doesn't require it |
| Delete issue comment | `DELETE /issueComment/{commentId}` | destructive: true; requires knowing a comment ID, which isn't surfaced anywhere today (see comments gap above) |
| Override media availability status | `POST /media/{mediaId}/{status}` (`available/partial/processing/pending/unknown/deleted`) | admin-only manual override; parameterized (status + optional `is4k`); distinct from request approve/decline — this mutates `MediaInfo.status`, a different enum than `MediaRequest.status` (see naming-collision section) |

## Not wired — user-management endpoints

`GET/POST /user`, `GET/PUT/DELETE /user/{userId}`, `/user/{userId}/settings/*`,
`/user/{userId}/permissions`, `/user/import-from-plex`, `/user/{userId}/quota`,
`/user/{userId}/watchlist` — a whole user-admin surface exists. None of it is wired anywhere in
this codebase (no references outside the OpenAPI doc). This is out of shape for "media field/filter/
enrichment/task" — it's user administration, not media data — but flagging per the ticket's
instruction to check for it. Likely out of scope for this map's per-media spec entirely; worth a
note to the decision ticket rather than modeling as a media task.

## Not wired — notification-config endpoints

`/settings/notifications/{email,discord,lunasea,pushbullet,pushover,gotify,slack,telegram,webpush,webhook}`
(and their `/test` variants) — a large notification-channel config surface. Not wired anywhere in
this codebase. Same as user-management: this is Overseerr's *own* outbound notification config, not
a field/filter/task on media items this app tracks. Flag for the decision ticket as likely
out-of-scope (config-only, no media-level filter/enrichment/task shape fits it) rather than modeling
it as a spec item here.

## Naming-collision risks (flagged, not resolved)

- **`status`** is the single most overloaded field name across this provider's own API, let alone
  cross-provider: `MediaRequest.status` (1/2/3 = pending/approved/declined), `MediaInfo.status`
  (1-6 = unknown/pending/processing/partially_available/available/deleted — a **different** numeric
  enum with different cardinality), and the issue-status path param (open/resolved, string not
  number). The codebase already disambiguates the first as `overseerrRequestStatus`, but if
  `MediaInfo.status` (media availability) or issue open/resolved status get wired later, they need
  their own prefixed names too (e.g. `overseerrMediaStatus`, `overseerrIssueStatus`) — collision
  risk is with each other *and* with `tmdbStatus` (`mediaFieldProvider.ts:22`,
  `ruleRegistry.ts:439`), which is TMDB's own release-status enum (Rumored/Planned/In
  Production/Post Production/Released/Canceled) — a third, semantically distinct "status" already
  live in this codebase. All three "status"-shaped fields (request approval state, media
  availability state, TMDB release state) are plausible candidates for a UI filter literally
  labeled "Status" — flag for the precedence ticket to make sure UI copy disambiguates them.
- **`requestedBy`** — Overseerr's `MediaRequest.requestedBy` (a full `User`) is unrelated to any
  other provider's fields today, but the *name* is generic enough ("who requested/added this") that
  it could collide in spirit with Plex's `added`/`plexAddedAt` (downloaded-to-library timestamp) or
  a future Radarr/Sonarr "added by" field if arr-stack per-user attribution is ever wired. Flag only.
- **`type`** — the codebase's local `OverseerrRequest.type: string` (undocumented in the current
  official schema, see above) would collide by name with any other provider's generic "type" field
  (e.g. media type movie/tv) if wired without an `overseerr`-prefix, same pattern as the rest of
  this provider's fields already follow.
- **`media.tmdbId`** — used purely as a join key today, not a filterable field, but if ever exposed
  directly it would need to be reconciled with TMDB's own `tmdbId` as the *canonical* identity field
  (see `docs/architecture/provider-roles-and-identity.md`, not re-verified in this ticket) rather
  than a second independent "tmdbId-shaped" field.

## Structural schema-change gaps (flagged, not designed)

1. **4K vs non-4K request duality** — a title can have two live `MediaRequest` rows (4K + non-4K)
   simultaneously; today's `overseerrFieldProvider.visit` collapses to one `overseerrRequestStatus`
   value per tmdbId (last request wins), silently dropping one side. Needs either a compound
   EAV key or two parallel fields to represent both.
2. **Per-season request detail** — `seasons` requested (array or `"all"`) is inherently multi-valued
   per request; doesn't fit a scalar EAV value without a child table or JSON column.
3. **Issue comments** — an unbounded per-issue collection (`IssueComment[]`), not expressible as a
   single field value; needs a child table if "view/add comments" becomes an actual task/filter
   need.
4. **Issue type breakdown** — currently collapsed to a single boolean (`overseerrHasIssue`); a
   title could have multiple issues of different types (video + subtitle) simultaneously, same
   multi-valued-per-media problem as (1) and (2) if per-type distinction is wanted rather than a
   single flag.

## Not-yet-wired field/task count

24 distinct not-wired items catalogued above: 8 request fields, 4 issue/comment fields, 11
candidate actuator tasks, plus the user-management and notification-config endpoint groups noted
as likely out-of-scope-but-flagged (not counted individually — they're endpoint groups, not
discrete media fields/tasks).
