# Warden — Core Model

**Read before any feature work.** Warden is a media-library *warden*: automate what happens to media based on its metadata. The whole product is one loop.

```
Providers (configured by user)
  → unlock metadata capabilities
  → metadata maps to filter predicates
  → predicates combine into queries
  → a query selects a set of media
  → tasks run against that set (scheduled or one-off)
  → that is an automation
```

**Example:** "Unmonitor items added by automatic lists, >90 days old, not watched."
Providers: Radarr (`addedBy`, `addedDate`) + Tautulli/Plex (watch history). Predicates: `addedBy=list`, `addedDaysAgo>90`, `watched=false`. Task: unmonitor in Radarr.

## Provider centrality
Provider configuration **defines the entire capability surface**: which filter controls render in the UI, which enrichment is fetchable, which query options exist, and which tasks an automation can run. That is why [`ProviderSettingsService`](ref:label:ProviderSettingsService) is the god node — not edge count, but that everything downstream is gated by what providers are configured. Each provider added unlocks more metadata → more predicates → more queries → more automations. Current: Radarr, Sonarr, Plex, Jellyfin, TMDB, OMDB, Overseerr, Tautulli, TvMaze. All extend [`BaseProviderConnection`](ref:label:BaseProviderConnection) (an HTTP-client + config base — *not* a role contract), discriminated by [`MetadataProviderType`](ref:label:MetadataProviderType); the capability roles a system holds are declared by the role interfaces it `implements` ([`server/modules/providers/roles.ts`](ref:path:server/modules/providers/roles.ts)), never by extending the base. Invariant: **one active provider per type** (Phase 0).

## A configured system plays up to three roles
A "provider" is really a configured external *system* (just connection config), and a system plays **up to three independent capability roles**: **MediaSource** (owns catalog rows + a canonical id), **MediaEnricher** (contributes metadata about media it does *not* own, joined by logical key), **MediaActuator** (exposes actions/tasks). One system commonly holds several — Radarr is Source + Actuator (its tags/quality/genres are Source fields, *not* enrichment); TMDB is enricher-only. Roles are **declared per system, never assumed**: a system has a role only when it qualifies, so a system that lacks identifiers simply isn't a source, and a system with no write API simply has no tasks. This is the holistic model that per-task work must not contradict — collapsing the roles into one all-capable "provider" is the recurring source of design drift. Source/enricher tiering: [`docs/architecture/provider-roles-and-identity.md`](ref:path:docs/architecture/provider-roles-and-identity.md).

## Ubiquitous Language
The canonical name for each crystallized concept lives in
[`docs/architecture/VOCABULARY.md`](ref:path:docs/architecture/VOCABULARY.md) — one table of settled
names, meanings, and code bindings, plus the deprecated names to stop writing. **The TypeScript type is
the binding source of truth**; the vocabulary doc is the discoverable index into it.

**Canonical names, abridged.** The query type is `MediaQuery`, its source-less core `MediaQuerySpec`, its persisted form `MediaQueryRecord` — "saved" is a state of a database entity, not a name, so there is no `SavedMediaQuery` concept. The service is `MediaQueryService` (cradle key `mediaQueryService`), the tables `media_queries` / `media_query_filter_values`, the provider base `BaseProviderConnection` (an HTTP/config base, not a role contract). The `/api/saved-queries` alias is gone — deleted in North Star Phase 0, the client speaks only the canonical `/api/media-queries`.

## Filtering — single engine, fed by enrichment data
One predicate registry ([`server/modules/media/filterRegistry.ts`](ref:path:server/modules/media/filterRegistry.ts)) backs both the automation executor and the media browse handler. Predicates apply to `Normalized*` domain shapes ([`server/modules/media/normalizeMedia.ts`](ref:path:server/modules/media/normalizeMedia.ts)).

**The enrichment job is the join between "providers configured" and "filters that match something."** Provider config says *what enrichment is possible*; the [`EnrichmentJob`](ref:path:server/modules/media/enrichmentJob.ts) (`server/modules/media/enrichmentJob.ts`) materializes it into `media_enrichment`; `enrichmentMerge.ts` reads it onto the normalized items the predicates run over. Writer and reader never reference each other directly — both instead depend on the shared [`EnrichmentQueries`](ref:path:server/modules/media/enrichment/enrichment.queries.ts) DAL seam ([the EAV rewrite](ref:path:docs/architecture/media-enrichment-eav-model.md)), which is visible to the AST graph as a shared dependency even though the two never call one another. Concretely: enriched predicates (overseerr/tmdb/watched) exclude on missing data rather than keeping all, so they return 0 until the job has populated the table.

## Tasks & execution
[`AutomationExecutor`](ref:label:AutomationExecutor) runs a task against the ids a query matches. **The `MediaActuator` role owns its tasks** ([`server/modules/providers/roles.ts`](ref:path:server/modules/providers/roles.ts)): `tasks(): ActuatorTask[]` declares them on the configured instance, each an `ActuatorTaskDescriptor { id, label, destructive, affects? }` plus a `run(ids)` **bound to that instance — no cast**. The executor binds the provider by `automation.provider.id` and dispatches via `source.tasks().find(t => t.id === taskId)`; `system` automations dispatch to [`SystemTaskRunner`](ref:label:SystemTaskRunner) (identity/enrichment jobs), kept separate because they are internal jobs, not actuator tasks. Scheduling via `croner`. Tasks are the surface of the role, not a property of every provider — an enricher-only type (TMDB) declares the role and so contributes none. **Enablement is per instance** (`settings.enabledTasks`, default off, via `readEnabledTaskIds`): `automationService.create` and the executor both refuse a task not enabled on *that instance*, so an un-enabled task can neither persist nor run. `GET /api/providers/tasks` serves **instance-keyed** availability (`{ providerId, type, tasks: [{…descriptor, enabled}] }`), non-actuators absent. There is no type-keyed task table — the role on the instance is the only declaration anywhere: the client derives via [`useProviderTasks`](ref:path:src/hooks/useProviderTasks.ts) and holds no catalogue (the old `src/lib/tasks.ts` is deleted; healed in Phase 3). Role-owned model: [`docs/architecture/actuator-task-ownership.md`](ref:path:docs/architecture/actuator-task-ownership.md).

**On-demand execution (Run Now).** `POST /api/automations/:id/run` runs an automation outside its schedule. It calls `executor.execute(id)` directly — **not** `scheduler.trigger`, which only fires automations currently in the scheduler's jobs map (so a paused/disabled automation could not be run). The endpoint validates the id exists (404 otherwise), kicks the run off in the background (`void execute().catch(log)`), and returns **202** immediately — enrichment/identity runs take minutes, so the request never blocks on completion. Because this bypasses croner's `{ protect: true }`, the executor holds an **in-flight guard** (a `Set<number>` of running ids): a second `execute(id)` while one is in flight is a silent no-op, cleared in `finally`, so a manual run cannot overlap a scheduled run of the same automation.

**System vs user controls.** System automations are invariants that must keep firing: they are **Run-Now-only** — `updateStatus` (disable/enable) and `delete` both reject `kind='system'` (`assertMutable`). User automations support Run Now + disable + delete. `AutomationRow` derives control visibility from `automation.kind`. The UI verb model is Run Now / Disable / Enable / Delete — never Play/Pause, which would imply runtime control over an executing process. Full system-vs-user breakdown: `docs/architecture/system-vs-user-automations.md`.

## Doc/graph conventions
`QUERIES_*` and `docs/in_progress/` are planning artifacts — read as intent, not built fact; deleted/moved when a phase ships (see root `CLAUDE.md`). The graphify graph is the searchable single source of truth for *what code exists and how it connects*; this file carries the *why* the graph can't derive from the AST.
