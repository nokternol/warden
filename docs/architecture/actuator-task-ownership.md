# MediaActuator task ownership

Server-side spec: why the actuator half of the system-roles model is shaped the
way the code is. Detailed spec of the **MediaActuator** role, one of three roles a configured system can
play; its sibling for the MediaEnricher role is `docs/architecture/media-enricher-role.md`. The
surrounding source/identity model (MediaSource) is `docs/architecture/provider-roles-and-identity.md`.

## The role owns its tasks

A **MediaActuator** is a configured system that exposes actions on media it can address. It is the **sole
authority for what actuator tasks exist**: a configured instance declares its own tasks, each carrying a
runner bound to that instance. A system without the role has no tasks, by construction — which is why a
non-actuator can never be offered one.

```ts
// server/modules/providers/roles.ts
type ActuatorTargetId = number | string;
interface ActuatorTaskParameter { label: string; }
interface ActuatorTaskDescriptor {
  id: string; label: string; destructive: boolean; affects?: 'media';
  parameter?: ActuatorTaskParameter;
}
interface ActuatorTask extends ActuatorTaskDescriptor {
  run(ids: ActuatorTargetId[], parameterValue?: string): Promise<void>;
}
interface MediaActuator { readonly actuatorType: MetadataProviderType; tasks(): ActuatorTask[]; }
```

A task has two shapes, one extending the other, so projecting the transport shape from the execution shape
is lossless rather than "the full shape with `run` silently dropped by serialization":

- **`ActuatorTaskDescriptor`** — pure data; the transport and discovery shape; serializes complete.
- **`ActuatorTask`** — the descriptor plus a runner **bound to the concrete instance** (`run: (ids) =>
  this.unmonitorMovies(ids.map(Number))`). The execution shape; no cast.

`run`'s ids are always in the actuator's **own addressing space** — source-native numeric ids for
Radarr/Sonarr, `plexRatingKey` strings for Plex-addressed systems (Plex, Tautulli), `jellyfinItemId`
strings for Jellyfin. The executor guarantees the space by construction (see "Non-source execution"
below), so a task never receives an id it cannot address.

Discovery reads the descriptor off the task; the executor reads the runner. Both are derived from the role
instance, so the question "what tasks does this system have" has exactly one answer and one source.

## The vocabulary is realised; only item-addressed tasks belong in it

Every declared task executes against its provider's real API, with one exception noted below. The
vocabulary was pruned to what the domain and the APIs can actually address before being realised:

- **Radarr** — `unmonitorMovie`, `triggerSearch`, `deleteMovieWithFiles`, `changeQualityProfile`,
  `addTag`, `removeTag` (the last three via `PUT movie/editor`).
- **Sonarr** — the series-side mirror of Radarr's set (`PUT series/editor` for the parameterized three).
- **Plex** — `deleteFromLibrary` (`DELETE /library/metadata/{ratingKey}`), `refreshMetadata`
  (`PUT …/refresh`), `markPlayed`/`markUnplayed` (`/:/scrobble`, `/:/unscrobble`). A `moveToTrash` task
  was pruned as unrealisable: Plex's "trash" is a scanner state for items whose files went missing, not
  an action — no per-item endpoint exists.
- **Jellyfin** — `deleteItem`, `refreshMetadata`, `markPlayed`/`markUnplayed` (per configured `userId`),
  `addToCollection`/`removeFromCollection` (both parameterized: which collection; the latter is
  `addToCollection`'s natural counterpart, same external-collection-id shape).
- **Tautulli** — `deleteWatchHistory` only. Each Plex rating key is looked up both directly
  (`rating_key`: movies, episodes) and as a series (`grandparent_rating_key` — Tautulli logs history per
  played item, so a show's history lives on its episodes), then all matched rows are deleted in one
  `delete_history` call. `terminateStream` (addresses a live playback *session*, no stable item
  identity) and `sendNotification` (no media target at all) were pruned — neither is an action on the
  media collection this system automates.

An action declared but not yet wired is a **modelled task**: a first-class task in the right shape whose
`run` throws via the shared `modelledRun(taskId)`. `deleteMovieKeepFiles`/`deleteSeriesKeepFiles` are the
remaining modelled tasks. Honesty is kept by the explicit throw and by enablement defaulting off, so a
modelled task is never reached by accident.

## Parameterized tasks carry exactly one value

Some tasks need a target beyond the item ids — *which* quality profile, tag, or collection. Every such
task fits one narrow contract, confirmed against each provider's API: **one parameter, a single-select
provider-native id, transported as a string** (numeric for Radarr/Sonarr profile/tag ids, a GUID for
Jellyfin collection ids — each provider parses its own).

- The descriptor declares it (`parameter: { label }`), so discovery surfaces know a value must be
  captured with the task.
- The automation stores the value (`automations.taskParameter`, nullable) and the executor threads it
  into `run` alongside the ids.
- A parameterized task invoked without its value rejects loudly via `requireParameter` — a missing value
  is a wiring bug, never a case to act on a default.

## Availability is per configured instance, gated by per-instance enablement

Discovery and enforcement are **instance-keyed**, not type-keyed, because two instances of one type can
legitimately differ — a 4K Radarr may enable `deleteMovieWithFiles` while a 1080p Radarr withholds it.

- **Enablement is per instance**, held in `provider.settings.enabledTasks` and read by the single pure
  authority `readEnabledTaskIds(settings)` ([`server/modules/providers/taskEnablement.ts`](ref:path:server/modules/providers/taskEnablement.ts)).
- **Default disabled.** A newly configured instance enables no tasks until chosen.
- **Enforced at two boundaries, not the UI:** `automationService.create` rejects a `taskId` not enabled on
  *that instance*; `AutomationExecutor` refuses (before any provider HTTP call) a task not enabled on the
  instance at run time. Disabled ⇒ neither creatable nor executable.

One shape serves both consumers: the settings surface lists all of an instance's tasks with their `enabled`
state to toggle; the builder offers the enabled subset.

## Discovery: `GET /api/providers/tasks` is instance-keyed

The `providers.tasks` contract procedure, implemented in
[`server/modules/providers/providers.procedures.ts`](ref:path:server/modules/providers/providers.procedures.ts), returns, per configured provider instance that plays
`MediaActuator`:

```ts
Array<{ providerId: number; type: MetadataProviderType; tasks: Array<ActuatorTaskDescriptor & { enabled: boolean }> }>
```

It lists configured providers, constructs each via `ProviderFactory`, keeps those for which
`isMediaActuator(instance)` holds, and projects each instance's `tasks()` to descriptors tagged `enabled`.
Non-actuators and non-constructable types emit nothing — the surface advertises only what some configured
instance can actually do.

## The executor dispatches through the instance

`AutomationExecutor` binds the specific provider instance by `automation.provider.id`, resolves the task by
`provider.tasks().find(t => t.id === taskId)`, enforces enablement via
`readEnabledTaskIds(providerSettings.settings)`, evaluates the query, and calls
`task.run(ids, automation.taskParameter)` — the runner already bound to the instance. `task.affects`
drives the `media:changed` event. `SYSTEM_TASKS` (`system:enrichment`, `system:identity-resolution`) are
separate: internal jobs run via `SystemTaskRunner`, not actuator tasks, and absent from the discovery
surface.

## Non-source execution: id translation through the identity graph

Earlier phases derived target ids by evaluating the automation's query against the provider instance **as
a `MediaSource`** — valid only while the actuator is also a catalog owner. That conflation is resolved:
the executor branches on `isMediaSourceType(providerSettings.type)`
([`server/modules/automations/automationExecutor.ts`](ref:path:server/modules/automations/automationExecutor.ts)).

- **Source actuator (Radarr/Sonarr):** unchanged — the query evaluates against the instance's own
  catalog and its native ids (`mediaSource.idOf`) feed the task directly.
- **Non-source actuator (Plex/Jellyfin/Tautulli):** it owns no catalog, so the query evaluates against
  the content type's owning source instances (pooled via `MediaSourceFactory.sourcesFor`), and matched
  items are translated into the actuator's addressing space by `resolveActuatorIds`
  ([`server/modules/media/actuatorIdResolver.ts`](ref:path:server/modules/media/actuatorIdResolver.ts)):
  each item's `(providerId, externalId)` coordinate joins through `media_item` to its `media_identity`
  group, whose `plexRatingKey`/`jellyfinItemId` column carries the actuator-native id. Identities the
  resolution job has not stamped drop out (there is no id to address), and multiple instance copies of
  one identity collapse to a single id — the recorded `itemCount` is the number of ids actually acted
  on, not the number matched.

Translation is keyed by **addressing space, not provider**: Tautulli has no id space of its own — it
reports entirely against Plex rating keys — so it shares Plex's `plexRatingKey` column. The spaces are
populated by the identity job's stamping passes (`runForPlex`, `runForJellyfin`,
[`server/modules/providers/identityResolutionJob.ts`](ref:path:server/modules/providers/identityResolutionJob.ts)).

## How it is wired

- [`server/modules/providers/roles.ts`](ref:path:server/modules/providers/roles.ts) — `MediaActuator` / `ActuatorTask` / `ActuatorTaskDescriptor` contracts,
  `ActuatorTargetId`, `modelledRun`, `requireParameter`, `isMediaActuator`.
- `RadarrProvider`, `SonarrProvider` — `tasks()` bound to real API calls (bulk editor endpoints for the
  parameterized three); `deleteMovieKeepFiles`/`deleteSeriesKeepFiles` modelled.
- `PlexProvider`, `JellyfinProvider`, `TautulliProvider` — `implements MediaActuator`, every task bound
  to its provider's real API.
- [`server/modules/media/actuatorIdResolver.ts`](ref:path:server/modules/media/actuatorIdResolver.ts) — non-source id translation through the identity graph.
- [`server/modules/providers/taskEnablement.ts`](ref:path:server/modules/providers/taskEnablement.ts) — `readEnabledTaskIds`, the one authority both create and the
  executor consult.
- [`server/modules/providers/providerFactory.ts`](ref:path:server/modules/providers/providerFactory.ts) — constructs every configured type so discovery can ask any
  instance for its role.
- [`server/modules/automations/automationService.ts`](ref:path:server/modules/automations/automationService.ts), [`automationExecutor.ts`](ref:path:server/modules/automations/automationExecutor.ts) — create-time and run-time enablement.
- [`server/modules/providers/providers.procedures.ts`](ref:path:server/modules/providers/providers.procedures.ts) — instance-keyed discovery.

## The client derives, holds no catalogue

The client reads the instance-keyed `GET /api/providers/tasks` and holds no task catalogue of its own.
`useProviderTasks` ([`src/hooks/useProviderTasks.ts`](ref:path:src/hooks/useProviderTasks.ts)) fetches the instance-keyed availability; the builder
([`src/components/AutomationBuilder`](ref:path:src/components/AutomationBuilder/index.tsx)) offers each configured instance's **enabled** tasks, joining the
instance name from settings; [`ProviderCard`](ref:path:src/components/ProviderCard/index.tsx) lists an instance's tasks with their server `enabled` state to
toggle (default off — the old client default-on heuristic is gone). The hand-maintained catalogue is
retired: `src/lib/tasks.ts` is deleted and the `tasks` surface removed from [`src/lib/provider-registry.ts`](ref:path:src/lib/provider-registry.ts),
so nothing client-side declares what tasks exist. The JSON-honest descriptor carries no `description`, so
the UI does not show one.
