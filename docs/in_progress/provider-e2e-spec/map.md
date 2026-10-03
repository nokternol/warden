---
type: wayfinder-map
label: wayfinder:map
status: closed
---

# Provider E2E Spec — Map

## Destination

A full end-to-end handoff spec, **one markdown file per provider**, under
`docs/in_progress/provider-e2e-spec/specs/<provider>.md`. Each file covers everything needed to
implement that provider completely: database/config surface, provider fields (mapped to domain
field names, with naming-collision notes), UI filters, query-engine wiring, enrichment wiring,
tasks (`MediaActuator` actions), and the automation options those tasks expose. A final
cross-provider doc (`specs/_precedence.md`) resolves field-name collisions across providers (e.g.
Plex's `added` = downloadedAt-to-library vs Radarr's `added` = addedAt-to-source) before anything
merges into `contestedFieldPrecedence`. This map's tickets produce **the spec only** — implementing
against it is a separate, later effort (`/tdd` or `/plan-and-go`).

## Notes

- **Domain:** media provider integrations. In scope — all 10 `MetadataProviderType` enum values
  (`server/database/schema.ts`): Plex, Jellyfin, Radarr, Sonarr, Tautulli, Overseerr, Seerr, TMDB,
  OMDB, TVMaze. ("Available" = currently configurable per the schema enum, whether or not a
  `metadata_provider` row exists yet — this is why Seerr and TVMaze are included even though
  `PROVIDER_REGISTRY` in `src/lib/provider-registry.ts` only lists 8 of the 10.)
- **Tasks = automations.** A provider's `MediaActuator` actions (exposed via its own API) are the
  building blocks the Automations UI offers as options — not a separate track. Spec "tasks" and
  "automation" together in the same ticket.
- **Schema is a blocker, not a decision.** If a provider's spec needs a *structural* schema change
  (new column, new table — not just a new config value stored in the existing `settings` JSON
  blob), flag it and raise it to the user. Do not decide the shape in-ticket.
- **Starting references** (partial gap analysis already exists for some providers — verify and
  extend, don't take as complete): `docs/architecture/media-providers.md`,
  `docs/architecture/media-field-provider-role.md`, `docs/architecture/provider-roles-and-identity.md`,
  `server/modules/media/filterRegistry.ts` (`contestedFieldPrecedence`, `sourceProviders`),
  `src/lib/provider-registry.ts` (`PROVIDER_REGISTRY`), `server/database/schema.ts`
  (`MetadataProviderType`).
- **Skills per ticket type:** research tickets — `WebSearch`/`WebFetch` against the provider's
  official API docs, plus a codebase audit; no other skill mandated. Decision tickets — `/grilling`
  and `/domain-modeling`. UI tickets — `/prototype` first (for any field/task with real UI
  complexity: parameters, filter widget shape), then an `impeccable` pass on the resulting filter UI
  (per field) and automation UI (per task).
- **Ticket sequence per provider:** research → decision → UI pass. UI is blocked on decision;
  decision is blocked on research. The final precedence ticket is blocked on all 10 providers' UI
  tickets.

## Decisions so far

- [Plex — research](tickets/01-plex-research.md) — audited full API surface; 7 naming collisions and
  7 structural-schema gaps flagged (collections/playlists/multi-user/webhooks/sessions), confirmed
  `plexAddedAt` stays distinct from Radarr/Sonarr's `added`.
- [Plex — decision](tickets/01-plex-decision.md) — shared-field strategy (genres/certification/studio/
  runtime/file-tech-metadata), no new tasks, structural gaps deferred; ratings later moved to the
  `media-ratings-provider` intent doc.
- [Jellyfin — research](tickets/02-jellyfin-research.md) — wired only as actuator + identity bridge (5
  tasks), no `MediaSource`/`_sourceIds.jellyfin`; broad enrichment surface unwired.
- [Jellyfin — decision](tickets/02-jellyfin-decision.md) — becomes a real `MediaEnricher` for the first
  time (needs `_sourceIds.jellyfin`), shares Plex's field strategy, adds `isFavorite` and
  `removeFromCollection`.
- [Radarr — research](tickets/03-radarr-research.md) — most flat movie fields already wired; flagged the
  `monitored` show-only filter bug and other unwired path/statistics fields.
- [Radarr — decision](tickets/03-radarr-decision.md) — two bug fixes (`monitored` extended to movies,
  stale `PLEX` `sourceProviders` entry removed), broad field wiring accepted, `collection` flattened to
  a scalar pair, queue/history endpoints deferred as structural.
- [Sonarr — research](tickets/04-sonarr-research.md) — wired as `MediaSource` + `MediaActuator` but no
  `MediaEnricher`; only `tags` reaches `EnrichmentFields`.
- [Sonarr — decision](tickets/04-sonarr-decision.md) — `hasFile` bug fixed via a per-series equivalent,
  `imdbId`/`tvMazeId` wired as identity fields (not enrichment), language-profile track built in full.
- [Tautulli — research](tickets/05-tautulli-research.md) — corrected the ticket's premise: Tautulli
  already implements `MediaActuator` (`deleteWatchHistory`); most remaining surface is library/session
  scoped.
- [Tautulli — decision](tickets/05-tautulli-decision.md) — per-item-only scoping premise excludes most
  of the audited surface; `get_recently_added` wired with an explicit precedence call (Plex wins over
  Tautulli); dead stats code removed.
- [Overseerr — research](tickets/06-overseerr-research.md) — only request-status and issue-presence
  wired today; most request/issue detail and routing config unwired.
- [Overseerr — decision](tickets/06-overseerr-decision.md) — Overseerr is the real build target; broad
  request/issue field and task set accepted; 4K duality and full issue-comment records deferred as
  structural; `status` flagged as a four-way naming collision.
- [TMDB — research](tickets/07-tmdb-research.md) — confirmed narrow wiring: only `tmdbStatus` reaches
  `EnrichmentFields`; rich detail/ratings/watch-provider data unused.
- [TMDB — decision](tickets/07-tmdb-decision.md) — stale `filterRegistry` listing resolved by wiring for
  real; new system-wide `region` setting flagged as structural; `external_ids` wired as an identity
  crosswalk; established the "never filtered on → on-demand metadata" principle.
- [OMDB — research](tickets/08-omdb-research.md) — confirmed zero OMDB fields reach the media-item
  pipeline today; only consumed via an ad hoc ratings route.
- [OMDB — decision](tickets/08-omdb-decision.md) — switches to ID-based lookup via `_sourceIds.imdb`;
  certification/genres/runtime/country join the shared fields; narrative text fields moved to
  on-demand metadata.
- [Seerr — research](tickets/09-seerr-research.md) — confirmed nothing wired; `seerrProvider.ts` is a
  bare re-export with no `SEERR` case in `ProviderFactory`.
- [Seerr — decision](tickets/09-seerr-decision.md) — shares Overseerr's implementation rather than
  parallel wiring; `SEERR` is the go-forward type but doesn't replace `OVERSEERR` in the enum; live
  compatibility verification deferred to the user's eventual upgrade.
- [TVMaze — research](tickets/10-tvmaze-research.md) — confirmed a buildable headline gap (`network`
  already in `filterRegistry.ts`/`NormalizedSeries`) but no enricher exists yet to populate it.
- [TVMaze — decision](tickets/10-tvmaze-decision.md) — corrected the "keyless" premise (TVMaze needs a
  real API key, currently lost); `network`/`webChannel` merged; ratings deferred pending the new
  `media-ratings-provider` intent doc, which consolidates every provider's ratings fields.
- [Plex — UI pass](tickets/01-plex-ui.md) — crowding blocker resolved with a real `FilterPicker`
  add-filter component; all 13 fields map onto the two existing generic controls (no bespoke widget
  needed); the 6 new `csv-strings` fields get one options route each, following `listNetworks`'s
  precedent, each shipping with its lookup wired (unlike `certification`'s existing silent gap).
- [Jellyfin — UI pass](tickets/02-jellyfin-ui.md) — same generic controls, no `/prototype` needed;
  contributes zero *new* lookup routes since all its csv-strings fields were already named by
  Plex's UI pass (Jellyfin just joins as an additional producer); first genuinely new boolean rule
  in the map (`jellyfinIsFavorite`) gets a `BOOLEAN_VALUE_LABELS` copy entry, not a new widget;
  `removeFromCollection`'s parameter deferred to the new Automation task parameters — decision
  ticket.
- [Radarr — UI pass](tickets/03-radarr-ui.md) — no new widget shapes; confirmed `string`/`number`
  dataType is a fixed-enum picker, not free text, so `folderName`/`path` (substring match) stays
  display-only rather than inventing a new control unilaterally; `movieFileCount` reclassified
  `number`→`range`; `collectionName` gets a new lookup route, `collectionTmdbId` stays unfiltered;
  `moveMovie`'s root-folder parameter appended to the Automation task parameters ticket.
- [Sonarr — UI pass](tickets/04-sonarr-ui.md) — no new widget shapes; `path` again left display-only
  (2nd provider to hit the missing-free-text-control gap — not yet building it unilaterally, but
  flagged as close to justifying a shared decision); `seasonCount` reclassified `number`→`range`;
  new `languageProfileId` csv-ids lookup (not a `qualityProfiles`-pair reuse — Sonarr-only); resolved
  `nextAiring`'s naming mismatch to `nextAiringInDays` rather than leaving it flagged;
  `moveSeries`/`changeLanguageProfile` parameters appended to the Automation task parameters ticket.
- [Tautulli — UI pass](tickets/05-tautulli-ui.md) — narrowest pass yet, matching its narrow decision
  scope: every file-tech field joins Plex's/Jellyfin's already-named routes as a third producer;
  `fileBitrate` is genuinely new but needs no lookup (plain range); `tautulliRecentlyAdded` joins the
  existing `plexAddedDaysAgo` rule; no tasks to defer. Remaining UI-distinct providers: Overseerr,
  TMDB, OMDB, TVMaze (Seerr shares Overseerr's implementation).
- [Overseerr — UI pass](tickets/06-overseerr-ui.md) — biggest UI pass yet. `overseerrRequestedBy`
  reclassified `string`→`csv-strings` with a new `overseerrRequesters` lookup (an enumerable
  per-instance set, distinct from the "no free-text control exists" gap Radarr/Sonarr hit — still
  only 2 occurrences of that). `overseerrIssueType` established a new precedent: a hardcoded
  fixed-array `csv-strings` branch (no `Lookups` route) for small, provider-fixed vocabularies. Three
  tasks (`Update request`, `Add issue comment`, `Override media availability status`) need
  parameter shapes beyond simple single-select — appended to the Automation task parameters ticket
  as multi-field/free-text/multi-field, the first non-scalar entries there.
- [TMDB — UI pass](tickets/07-tmdb-ui.md) — no tasks, nothing appended to the Automation task
  parameters ticket. `originCountry`/`spokenLanguages` resolved as hardcoded fixed-array
  `csv-strings` (closed ISO vocabularies, following `overseerrIssueType`'s precedent even at ~250
  values); `keywords` got a new dedicated `tmdbKeywords` lookup route (open per-item tags, following
  `plexLabels`/`Tags`'s precedent). All 8 streaming-service booleans plus `hasTrailer` got
  `BOOLEAN_VALUE_LABELS` entries. Flagged for OMDB: its single-valued `Country` field joins
  `originCountry` as an additional producer and needs one-element-array wrapping at the query-engine
  layer.
- [OMDB — UI pass](tickets/08-omdb-ui.md) — smallest ticket yet: `certification`/`genres`/`runtime`/
  `originCountry` all join existing shared rules, no new key/route/widget; confirmed the `Country`→
  `originCountry` array-wrapping is a query-engine concern, not a widget one; `awardWinner`/
  `oscarWinner` are the only new fields, each with distinct `BOOLEAN_VALUE_LABELS` copy. No tasks.
- [TVMaze — UI pass](tickets/10-tvmaze-ui.md) — `tvmazeType` and `language` both scrutinized as
  possible free-text-gap cases but resolved as closed enums (TVMaze's own FAQ documents both as
  bounded vocabularies), each getting a new `ENUM_OPTIONS` entry — free-text-gap count stays at 2,
  no shared control built. No tasks. Caught that `99-precedence` is *not* yet unblocked — Seerr has
  its own separate, still-open UI ticket (`09-seerr-ui`), not folded into Overseerr's as the map's
  provider-count note briefly implied.
- [Seerr — UI pass](tickets/09-seerr-ui.md) — nothing to design; Seerr shares Overseerr's exact
  implementation and field set, `specs/seerr.md` now points to `specs/overseerr.md`'s "UI decisions"
  as source of truth. Last per-provider UI ticket — all 10 are now closed, `99-precedence` is
  unblocked.
- [Automation task parameters — decision](tickets/11-automation-task-parameters.md) —
  `ActuatorTaskParameter` grows a discriminated `type: 'select' | 'text' | 'fields'`; four new
  all-instances-keyed options routes (`quality-profiles`/`root-folders`/`collections`/
  `language-profiles`) follow the existing `getTasks` convention; `taskParameter`'s existing TEXT
  column takes a JSON object for `fields`, no schema change; `CreateAutomationInput` gains
  `taskParameter?: string`, currently missing despite the DB column existing. Surfaced a real,
  previously-dismissed gap: per-item dynamic parameter values (Overseerr's `Update request` season
  selection can only mean "all" as a static value) — captured in
  `docs/intent/dynamic-per-item-automation-parameters.md` rather than designed here.
- [Cross-provider precedence pass](tickets/99-precedence.md) — arr-stack-wins default (Radarr/Sonarr
  > TMDB/OMDB > Plex/Jellyfin > Tautulli) applied to genres/studio/file-tech/playCount, with two
  richness-based exceptions (`certification`: TMDB leads, it's the only region-aware producer;
  `network`: Sonarr still leads over TVMaze). New `primaryMediaServer` setting (default Plex) joins
  `region` in the system-wide settings table to break every Plex-vs-Jellyfin tie. `releaseDate`
  merges Plex/Jellyfin as one field, stays separate from Radarr's milestone dates. `status`
  (`NormalizedSeries`) renamed `seriesStatus` to finish disambiguating the four-way "status" overload
  alongside `overseerrRequestStatus`/`overseerrIssueStatus`/`radarrStatus`/`tmdbStatus`. Written as
  `specs/_precedence.md` — last ticket on the map, destination reached.

## Not yet specified

_(none — the per-provider pattern is fully specified and repeatable, and the cross-provider
precedence pass is closed; nothing left in fog)_

## Out of scope

- Implementing the spec (writing enrichers, actuators, UI code, migrations) — this map produces the
  handoff spec only.
