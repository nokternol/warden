# Per-consumer watchlist enrichment

**Status:** INTENT (future state, not built). Recorded from a design conversation scoping one target
`MediaQuery`: movies added to the media player (downloaded) over 90 days ago, tagged with one of a set of
Radarr tags, that are not on the watchlist of any of a chosen set of Plex-server consumers. Two of the
three predicates already exist (Radarr `tagIds`, `docs/architecture/media-query-engine.md`'s `role: 'exclude'`
source mechanism for the "not on any" shape); this doc covers the remaining one — the third predicate,
"downloaded X days ago" via Plex's own `addedAt`, is staged at `docs/in_progress/plex-added-date.md`.

## Per-consumer watchlist, not a flattened boolean

The original ask was explicitly **not** "is this on a watchlist somewhere" (`INVENTORY.md`'s
`mediaInfo.watchlists` framing) — it's "not on the watchlist of any of a chosen set of *my* consumers, where
choosing all consumers is just selecting all of them." That shape already exists in the engine: `tagIds`
(`ruleRegistry.ts`) is `instance-ids`, "item's tag list intersects the selected ids," and the `MediaQueryClause`
`role: 'exclude'` (`mediaQueryEngine.ts`) already handles "exclude if any selected value matches." A
`watchlistUserIds: number[]` field consumed by the same `instance-ids` shape needs no new engine mechanism — only
the data.

### Why not go directly to Plex

Investigated three token sources for "who has this on their watchlist," in order:

1. **Plex Home user-switch** (`plex.tv/api/home/users/{id}/switch`, the mechanism `python-plexapi`'s
   `switchHomeUser()` uses) — mints a token from the admin's own token, but only for Home/managed members of
   the *same* Plex account. Doesn't cover shared "Friend" users, and Overseerr's own proven
   watchlist-sync implementation (`server/lib/watchlistsync.ts` in `sct/overseerr`) never uses this path —
   evidence it doesn't reach the account-level Discover/watchlist feature reliably.
2. **`plex.tv/api/servers/{machineId}/shared_servers`'s per-share `accessToken`** — lists every consumer with
   access to the linked server (Home and Friend alike) and looks like it hands back a token per user with no
   login required. Unverified whether that server-scoped share token is honored by
   `discover.provider.plex.tv`'s watchlist endpoint (an account-level Discover feature, not a local-PMS one).
   Rejected on the same evidence as (1): Overseerr doesn't use it either, and Overseerr would be the first to
   reach for it if it worked, since it solves exactly Overseerr's own problem.
3. **Each consumer's own plex.tv OAuth token, captured at their own login** — confirmed as the *only*
   mechanism Overseerr's `watchlistsync.ts` actually uses (`userRepository...where("user.plexToken != ''")`,
   skip/return if absent, per-user try/catch that logs and continues rather than aborting the batch). This is
   real, in-production, and it's the sole reason Overseerr *can* do watchlist-driven auto-requests at all.

Point 3 is the actual blocker for this application: **Warden has no login surface for library consumers** —
it's a server-owner media management tool, not a consumer-facing request app like Overseerr. There is no flow
by which chrismitchell117 (a real consumer on the reference server, confirmed sharing his watchlist) would
ever authenticate into Warden and hand it his own token. Building a parallel OAuth-capture flow just to
duplicate what Overseerr already does would be building a second consumer-facing surface this application is
explicitly not meant to have.

### Resolution: read Overseerr's already-captured tokens, not Plex directly

Overseerr already collects consumer Plex tokens as a side effect of being the consumer-facing app in this
deployment (chrismitchell117 has one because he uses Overseerr to request things, not because of anything
Warden did). Reading through Overseerr isn't a claim that Overseerr *owns* the watchlist — Plex does — it's
that Overseerr is the only component in the stack with consumer credentials, for a structural reason (it has
a login surface, Warden doesn't) rather than a data-ownership one. Confirmed endpoint shape
(`sct/overseerr`'s `server/routes/user/index.ts`):

```
GET /api/v1/user                 (admin X-Api-Key) — enumerate Overseerr users, paginated (take/skip)
GET /api/v1/user/:id/watchlist   (admin X-Api-Key satisfies MANAGE_REQUESTS/WATCHLIST_VIEW) — paginated
  → { page, totalPages, totalResults,
      results: [{ ratingKey, title, mediaType: 'tv'|'movie', tmdbId }] }
```

Already defensive server-side — no client-side skip/catch needed for "consumer never used Overseerr":
`user/index.ts` returns `{ results: [] }` directly when `user.plexToken` is unset, rather than erroring. A
consumer who's never touched Overseerr is indistinguishable from one with an empty watchlist, which is fine
for this predicate either way.

### Shape when built

1. `OverseerrProvider.getUsers()` → `GET /api/v1/user`, paginated.
2. `OverseerrProvider.getWatchlist(userId)` → `GET /api/v1/user/:id/watchlist`, paginated.
3. `overseerrWatchlistEnricher` (new, or an extension of `overseerrEnricher` in `enricherAdapters.ts`) —
   per user, aggregate `tmdbId → userId[]` into `watchlistUserIds`.
4. `EnrichmentFields.watchlistUserIds: number[]` — Overseerr user ids (the natural identity for the
   exclude-source multi-select in the UI — these are the ids a consumer picker would show).
5. `mediaEnrichment` schema: new `watchlistUserIds` column (JSON-encoded array — no existing array-column
   precedent in `schema.ts`, first one), migration.
6. `enrichmentMerge.ts`: copy-through with JSON parse.
7. `ruleRegistry.ts`: new `watchlistUserIds` rule, `instance-ids`, same predicate shape as `tagIds`.

### Open questions for whoever picks this up

- Whether `watchlistUserIds` needs its own `EnrichmentJobFactoryDeps`-level plumbing or can ride entirely on
  the existing `overseerrEnricher`'s provider instance.
- Whether the consumer picker in the UI needs Overseerr `displayName`s surfaced somewhere (a small read
  endpoint), or whether that's a separate follow-up once the predicate itself lands.
- Pagination/rate-limit behavior for servers with many Overseerr users — `getWatchlist` is one call per user
  per enrichment pass; no caching layer exists on our side the way Overseerr's own etag cache does internally.

These are unresolved enough to warrant a wayfinder pass (grilling + prototype on the array-column/enricher
shape) before this gets a phase plan — see the sibling assessment that split this doc from
`docs/in_progress/plex-added-date.md`.
