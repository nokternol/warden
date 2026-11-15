# Source read cache: one read of the library

Warden's library is what Radarr and Sonarr hold, including titles not yet downloaded. Every feature
that needs to know what the library holds asks one object for it:
[`SourceReadCache`](ref:path:server/modules/media/sourceReadCache.ts), a singleton in the media
module (registered in [`media.registrations.ts`](ref:path:server/modules/media/media.registrations.ts)).
It is the cache of the latest read of each active Radarr/Sonarr instance: that instance's rows, or
why it could not be read.

## Why one read

Every feature that reads the library reads it here, so a change to how the library is read is made in
one place, and the same filters on the same read match the same titles, whichever feature asks. An
automation that acts later, on a library that has changed since, can still count differently from an
earlier page or preview. That is expected and is never a fault.

## What it holds and what it hands out

- **Raw rows, per instance.** Each instance's read is kept under its own key in a private
  [`MediaCache`](ref:path:server/kernel/cache.ts). It is held for 60 seconds, concurrent asks share one
  upstream fetch, and a fetch that an invalidation overtook is not stored. The cache owns this data:
  nothing else holds it, and nothing else fetches Radarr/Sonarr lists for features.
- **Errors, too.** A failed read is cached like a successful one, so requests during an outage don't
  each wait out a dead upstream's timeout. The error carries the provider id and the instance name,
  and its message ("Couldn't be reached: …") is worded once, here.
- **Never items.** Callers bind each instance's read into a source for every evaluation with
  `rowsSourceFor(contentType, read)`
  ([`sourceAdapters.ts`](ref:path:server/modules/media/sourceAdapters.ts)), the one place a read's
  rows are told apart by content type. It hands them to the over-rows binders
  `radarrRowsSource`/`sonarrRowsSource`, which the Media page's browse also calls directly on its
  per-instance sublists. Every read builds new objects, so enrichment merged into one evaluation's items never reaches the cached rows or another
  evaluation.
- **Instances are chosen elsewhere.** `MediaSourceFactory.activeInstances`
  ([`mediaSourceFactory.ts`](ref:path:server/modules/media/mediaSourceFactory.ts)) stays the one place
  the active instances of a content type are chosen. The cache reads through it.

## Three reads, each with its failure rule

| Read | Answers | Fails when | Asked by |
|---|---|---|---|
| `readEach(contentType)` | every active instance's rows, plus an error per instance that could not be read | never; no active instance is an empty answer | the Media page's browse and its lookups computed from library rows ([`media.procedures.ts`](ref:path:server/modules/media/media.procedures.ts)), which name failed instances beside the results |
| `readAll(contentType)` | every active instance's rows | any instance failed, naming each one | query previews ([`mediaQueries.procedures.ts`](ref:path:server/modules/mediaQueries/mediaQueries.procedures.ts)); automations on Plex, Jellyfin or Tautulli |
| `readOne(providerId)` | that one instance's rows, read without touching its siblings | that instance failed, or it is not an active provider | automations on Radarr or Sonarr, which plan only on their own instance and are never delayed or failed by a sibling |

The executor ([`automationExecutor.ts`](ref:path:server/modules/automations/automationExecutor.ts))
requires the cache: it has no fallback read path.

## Read as it stands, refresh before acting

Without options, a read is **as it stands**: each instance's latest read, kept for the TTL. The Media
page, query previews, automation previews and the readiness read when an automation row appears all
read this way.

With `{ refresh: true }`, a read drops the instances it covers and reads them now, and that read is
the one it returns. A feature about to act asks this way and acts on what it got back, so "act on
the read your refresh returned" is how the method works, not a rule callers have to remember:

- **A run** refreshes right before it plans, after its status and blocking checks, and plans on that
  read. A title added to Radarr just before a run of a Radarr automation is among its targets. A
  Radarr or Sonarr automation refreshes only its own instance.
- **Run Now's count.** Opening the confirmation and pressing Retry call readiness with `fresh: true`
  (an optional field on `automations.readiness`, [`contract/automations.ts`](ref:path:contract/automations.ts)).
  The automation row ([`AutomationRow`](ref:path:src/components/AutomationRow/index.tsx)) writes the
  answer into the row's existing readiness entry without refetching, so `fresh` never becomes part of a
  client cache key. The count a user confirms comes from the read their confirmation started.

## What clears it

The cache subscribes to the event bus itself ([`eventBus.ts`](ref:path:server/kernel/eventBus.ts)):
`media:changed` (Warden changed upstream library data) and `provider:changed` (an instance joined,
changed or left) clear every instance's read. A media reset does not clear it: a reset changes what
Warden has stored, not what Radarr and Sonarr hold, so browse shows the reset without re-reading
upstream ([`media.cache.enrichmentFresh.integration.test.ts`](ref:path:server/__tests__/integration/media.cache.enrichmentFresh.integration.test.ts)).

`clear()` is also public, for test isolation. A test file that builds one container for several tests
and changes Radarr/Sonarr responses between them clears the cache between tests. Otherwise a test can
read an earlier test's library and pass without testing what it should.

## What reads Radarr/Sonarr without it

- The identity resolution job reads its own instances. It lives in `providers`, which may not import
  `media`.
- Task code that re-reads a list to update one record.
- The provider-metadata route for a connection that is not saved yet.

Every other cache in the media procedures, including the lookups computed from library rows and the
Plex/Jellyfin item caches, stays in the procedures and clears on the same two events.
