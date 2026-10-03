# Realtime, event-driven cache & UI feedback

**Status:** INTENT (future state, partially built). The domain event bus itself is shipped —
`docs/architecture/domain-event-bus.md` — and run results already carry honest item counts. Basic Run
Now feedback (trigger confirmation + polling-based list revalidation) has since shipped too, but
through a simpler, non-bus mechanism — see `docs/architecture/system-vs-user-automations.md`'s "Run
Now feedback" section. That closes the "no feedback at all" gap without touching what this document
still covers: a cached enrichment layer reacting to the bus, a genuine live "still running" signal for
slow jobs, and the hardening the bus needs before any real consumer (cache or SSE) can depend on it.

## The problem

Two standing needs in the product both reduce to the same shape: *something inside the scheduler/
executor happens, and something outside it needs to react.* Today neither reaction is bus-driven:

- **Run feedback stops at "triggered."** A user now sees their click was received and gets an
  eventual, polled `lastRun` update — but there is still no live "still running" state for a job's
  actual duration, and no way to distinguish a slow cross-system job from a hung one. A push-based
  signal (the bus was built for exactly this) remains unbuilt.
- **The enrichment cache doesn't exist.** `mergeEnrichment` issues two DB queries (identity + enrichment)
  on *every* request, with no cache in front of it — the old `watchedTitlesCache` that used to soften this
  was removed and never replaced. Every movie/series list pays that cost regardless of whether the
  underlying data changed.

The domain event bus (`media:changed`, `run:started`, `run:completed`) exists precisely to drive both of
these, but currently emits into the void — no consumer subscribes to either for this purpose yet (a
`provider:changed` consumer exists elsewhere, unrelated to runs or enrichment).

## Why it needs solving

- Polling papers over the worst of "no feedback at all," but a job that outruns the poll window (18s)
  still reads as silent, and there's no way to tell "still working" from "stuck" for anything
  longer-running than that. Cross-system jobs (Radarr/Sonarr/Plex) can take real time; a silent UI
  during that window reads as broken, not busy.
- The enrichment query cost is paid on every list request today, unconditionally — it's standing,
  measurable perf debt with a known fix shape (cache the lookup maps, invalidate on change) that just
  hasn't been wired up.
- The bus was deliberately built ahead of its consumers (event-first, not consumer-first), so the
  architecture is ready; the gap is entirely on the consuming side plus making the bus itself safe to
  depend on.

## The shape of the fix

- **Cache the enrichment lookup maps, not the merged result**, keyed separately from provider list
  caches — they have different invalidation lifetimes. A user unmonitoring an item must not evict
  enrichment data (playcount is unaffected by the monitored flag); an enrichment write must not touch the
  provider-list cache. `media:changed` evicts the enrichment cache; a short absolute TTL is the backstop
  for a missed emit, deliberately absolute rather than sliding so a hot, continuously-read cache can still
  self-heal.
- **Two SSE streams, one for run status and one for data changes**, reusing the same
  `EventSource`-in-hook + resync-on-connect pattern for both. The two families are never shown on the
  same screen — the Automations/System screens want run status, the media grid wants data-changed — so
  there's no client-side filtering to build. The one non-negotiable behaviour either stream needs:
  authoritative push is a correctness bug on its own, because a client that mounts mid-run or reconnects
  after a blip never learns what it missed. A single revalidation on connect (and on reconnect) seeds a
  correct baseline; live events patch locally after that. The run-status stream's job has narrowed since
  trigger confirmation shipped without it: it's no longer needed for "did the click register," only for
  a live in-progress/duration signal for jobs that outlast a page's polling window.
- **A visual pass on top, once the live state exists to design against**: honest verb naming (Run Now /
  Disable / Archive, none of which claims to control an in-flight process — "Pause" was considered and
  rejected as a lie for cross-system jobs), a designed "running…" affordance, and specialised columns for
  the System → Tasks screen now that run-duration data exists to show.

## Blockers / friction

- **The bus isn't safe for real consumers yet.** `EventEmitter.emit` is synchronous and re-throws a
  listener's exception into the caller — a throwing cache/SSE consumer today would get mis-recorded as an
  execution failure, or abort a run before the provider is even called. This has to be fixed (listener
  isolation) before any consumer attaches, not after.
- **No teardown contract.** The bus is a singleton; per-connection SSE consumers will `bus.on()` per
  request. Nothing manages listener lifecycle or caps (`maxListeners` defaults to 10), so a consumer that
  forgets to unsubscribe on disconnect leaks permanently, and concurrent streams will hit the warning
  ceiling.
- **Ordering and replay are both currently accidental.** Events happen to fire
  `run:started → run:completed → media:changed` today, but nothing guarantees it, and there's no
  replay/buffer — an event emitted before a consumer attaches (e.g. at startup, before the scheduler's
  first tick) is simply dropped. Any consumer built against an assumed order or assumed delivery will be
  quietly wrong under load or at boot.
- **The event payload is deliberately underspecified** (`media:changed` carries no discriminator between
  movie/series). This was a considered decision, not an oversight — the enrichment cache is whole-scope, so
  a discriminator has no consumer to honour yet. Re-introducing one is only worth doing once a consumer
  actually segments its cache and needs it, expressed in that consumer's own vocabulary — not the
  provider/source axis the identity model happens to expose today.
- **Observability is missing.** `EventEmitter.emit` reports whether any listener fired; nothing surfaces
  that today. For a cache-invalidation system, "an event fired and nobody consumed it" is exactly the
  failure mode worth being able to see.
- **Segmented/targeted eviction is an explicit non-goal until thrash is observed.** Whole-scope eviction
  plus a short debounce is deliberately simple; the trigger to build anything more precise is measured UX
  pain under heavy overlapping-task load, not anticipation of it.
</content>
