# Realtime, event-driven cache & UI feedback

**Status:** INTENT (future state, partially built). The domain event bus itself is shipped —
`docs/architecture/domain-event-bus.md` — and run results already carry honest item counts. Basic Run
Now feedback (trigger confirmation + polling-based list revalidation) has since shipped too, but
through a simpler, non-bus mechanism — see `docs/architecture/system-vs-user-automations.md`'s "Run
Now feedback" section. That closes the "no feedback at all" gap without touching what this document
still covers: a genuine live "still running" signal for slow jobs, live data-changed updates on screen,
and the hardening the bus needs before per-connection SSE consumers can depend on it. The library cache
(`docs/architecture/library-cache.md`) already serves the copy, facts included, from memory and reloads
on `media:changed`.

## The problem

Two standing needs in the product both reduce to the same shape: *something inside the scheduler/
executor happens, and something outside it needs to react.* Today neither reaction is bus-driven:

- **Run feedback stops at "triggered."** A user now sees their click was received and gets an
  eventual, polled `lastRun` update — but there is still no live "still running" state for a job's
  actual duration, and no way to distinguish a slow cross-system job from a hung one. A push-based
  signal (the bus was built for exactly this) remains unbuilt.
- **Screens don't learn that the copy changed.** The library cache reloads on `media:changed`, but an
  open page only sees the new copy when it next fetches.

The domain event bus (`media:changed`, `run:started`, `run:completed`) exists to drive both. Nothing
consumes the run lifecycle events yet.

## Why it needs solving

- Polling papers over the worst of "no feedback at all," but a job that outruns the poll window (18s)
  still reads as silent, and there's no way to tell "still working" from "stuck" for anything
  longer-running than that. Cross-system jobs (Radarr/Sonarr/Plex) can take real time; a silent UI
  during that window reads as broken, not busy.
- The bus was deliberately built ahead of its consumers (event-first, not consumer-first), so the
  architecture is ready; the gap is entirely on the consuming side plus making the bus itself safe to
  depend on.

## The shape of the fix

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
  Disable / Enable / Delete, none of which claims to control an in-flight process — "Pause" was considered and
  rejected as a lie for cross-system jobs), a designed "running…" affordance, and specialised columns for
  the System page now that run-duration data exists to show.

## Blockers / friction

- **The bus doesn't isolate listeners.** `EventEmitter.emit` is synchronous and re-throws a listener's
  exception into the sender. In-process listeners follow the convention of catching their own errors
  (the library cache's listener only drops its loaded copy), but per-connection SSE consumers are many and transient, so bus-level
  isolation is still needed before they attach — a throwing stream would otherwise be mis-recorded as an
  execution failure.
- **No teardown contract for SSE.** In-process listeners subscribe once, or unsubscribe with `off` when
  built per test. Per-connection SSE consumers will `bus.on()` per request, and nothing manages their
  lifecycle or caps (`maxListeners` defaults to 10), so a stream that forgets to unsubscribe on
  disconnect leaks permanently, and concurrent streams will hit the warning ceiling.
- **Ordering and replay are both currently accidental.** Events happen to fire
  `run:started → run:completed → media:changed` today, but nothing guarantees it, and there's no
  replay/buffer — an event emitted before a consumer attaches (e.g. at startup, before the scheduler's
  first tick) is simply dropped. Any consumer built against an assumed order or assumed delivery will be
  quietly wrong under load or at boot.
- **The event payload is deliberately underspecified** (`media:changed` carries no discriminator between
  movie/series). This was a considered decision, not an oversight — the library cache reloads the whole
  copy, so a discriminator has no consumer to honour yet. Re-introducing one is only worth doing once a consumer
  actually segments its cache and needs it, expressed in that consumer's own vocabulary — not the
  provider/source axis the identity model happens to expose today.
- **Observability is missing.** `EventEmitter.emit` reports whether any listener fired; nothing surfaces
  that today. For a cache-invalidation system, "an event fired and nobody consumed it" is exactly the
  failure mode worth being able to see.
- **Segmented/targeted eviction is an explicit non-goal until thrash is observed.** Whole-scope eviction
  plus a short debounce is deliberately simple; the trigger to build anything more precise is measured UX
  pain under heavy overlapping-task load, not anticipation of it.
</content>
