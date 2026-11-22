# System design: the target for the cleanup slices

**Status: approved by the owner, 2026-11-15.** Produced by the system design pass (#251). Once merged, this is
the design source for the cleanup slices (#243–#250, #252). It is architecture, measured against
the north star (`docs/north-star/purpose.md`); each section names the beliefs it serves. Where this
design and the north star disagree, the north star wins and this document is wrong.

The graded map of the current code that this design answers is posted on #251.

## 1. One copy of the library (beliefs 3, 4, 6, 8) — built (#252)

- **The database holds the services' data.** What Radarr and Sonarr say about each copy, which
  copies are one title and the title's id in every other service, and the facts the other services
  report, all live in Warden's database.
- **The scheduled refresh is the only reader of the services.** It reads each service, writes what
  it read into the database, and records for each service when it last refreshed and whether that
  refresh failed. It runs as system automations on the owner's schedule, the same mechanism as any
  other automation. No feature reads a service live.
- **One cache over the database.** It holds the copy in memory for quick answers. It is loaded from
  the database and replaced when a refresh lands. It is the only thing features read.
- **Staleness is shown, not fought.** Every view that shows library data says when the copy was
  last refreshed, and which services failed their last refresh.
- **Warden believes what a service answers** (north-star belief 6). A successful answer, even an
  empty one, is the service's truth. An error or no answer is a failure: the refresh keeps the last
  good data for that service and records the failure.
- **Condition (owner):** the Media page must stay fast. The measurement runs on the built read path,
  once the cache serves browse and before the slice is finished; if the cache cannot keep it fast, that
  goes back to the owner. Measured on a generated library of 10,000 movies and 3,000 series: cold load
  about 0.9 s, warm browse page about 220 ms (`docs/architecture/library-cache.md`).

**Removes:** the 60-second live copy as something features read (it becomes the refresh's way of
reading, or goes); the Media page's own title grouping; runs writing copies into the database;
the "excluded title not resolved yet" skip; live Plex/Jellyfin reads for filter choices; the
per-lookup caches in the media procedures.

## 2. Same title (beliefs 2, 3) — built (#252)

- The refresh decides which copies are one title, with one rule, and records it in the copy.
- Every feature that needs titles reads that grouping: the Media page, counts, exclude protection,
  and translating a title into a service's id for a task.
- A title is every edition of it everywhere (#247): each condition, included or excluded, is judged
  on the title as a whole, and the acting service acts on every copy of the title it holds. A
  Radarr or Sonarr run acts on its own copy of a title selected through any instance's copy.

## 3. Facts (beliefs 2, 8, 9) — built (#246)

- **Each service declares once which facts it supplies.** The fact list, the refresh's write, the
  rules that read a fact and the services a rule depends on all follow from that one declaration.
- **Filter choices come from the stored facts,** read from the cache, never from a live service.
- **Facts are stored per provider,** as each provider reported them (built, #252). Where more than one provider
  supplies a fact (play count; studio and file details when Plex and Jellyfin are both active),
  precedence picks one value when the cache loads.

## 4. Providers (beliefs 2, 8, 9)

- **What a provider can do is declared by that provider:** supply the library, supply facts, run
  tasks, list choices for a task's parameter, test its connection. Callers ask for a
  capability, never for a provider type, and never cast.
- **Every connection is built in one place,** and carries its own address (any web-proxy path and URL
  base included), credentials and timeout. Testing a connection uses that connection.
- **The owner enters where a service is reached — the machine, the port and any web-proxy path — never
  the service's API path; Warden adds it.** The owner also enters the service's own URL base, if it
  has one.
- **Adding a service** is that service's connection and declarations, and nothing outside it.

## 5. Automations (beliefs 1, 6, 7, 8)

- **One answer to "may this task run here":** offered, declared by the instance and enabled on it.
  Configuration, saving and running ask the same question.
- **System jobs declared once.**
- **One writer for an automation's last-run summary.**
- **The automation's owner moves its schedule** (create, enable, disable, delete, startup). The
  HTTP layer only calls it.
- **A run acts on the copy as it stands.** No gate at save, no fresh count before Run Now, no
  demand for fresh data.
- **One step to see what an automation would act on now:** its includes minus its excludes, from
  the copy, whenever the owner chooses. Viewing it is never required.
- **A destructive run does not act when a service it depends on failed its last refresh,** or has
  never been read. A fact another connected service still supplies does not depend on the one that
  failed: the run needs one refreshed supplier per fact it filters on (north-star belief 7). Nothing
  skips a run because of how much it would affect (north-star belief 7): an automation whose
  destructive action would affect a large share of the library is flagged for review instead.
- **Run history** records what each run targeted, with title and year, and outlives the copy.

## 6. Reading the catalog (beliefs 3, 8) — built (#247)

- **One evaluation.** The Media page, query counts, the automation-matches view and runs all ask
  the same thing of the cache: which titles do these conditions select. One evaluation answers it.
- **One way to show an empty or failed source:** the copy's own refresh record.

## 7. Media page (beliefs 7, 8)

- **Save saves the filters behind the results on screen.**
- **One source of truth for each piece of state:** filters and sort in the address bar, library data
  from the server, nothing duplicated between them.

## 8. Left to the slices

Engineering choices that no belief decides, made inside each slice within this design and recorded
in `docs/architecture/`: how the runner is split into pieces, component boundaries on the Media
page, the client mutation pattern, per-row fetching, and the refresh's write performance.

## 9. Slices, re-scoped

| Slice | New scope | Depends on |
|---|---|---|
| #252 The library record (renamed: **One copy of the library**) | Section 1 and 2: the refresh stores the services' data and records each service's refresh; one cache over the database; every feature reads it; the Media page measured on the built read path before the slice is finished. Absorbs from #247 the read side, the per-lookup caches and the fan-outs. | this design |
| #244 Provider types | Section 4. | this design |
| #246 Enrichment | Section 3. | #244, #252 |
| #247 Reading the catalog | Section 6: one evaluation for the Media page, counts, the matches view and runs. | #252 |
| #248 Automation running | Section 5. | #247 |
| #249 Media page | Section 7, and the page's structure. | #247 |
| #243 Small fixes | One container convention, one time helper, the scope declaration read one way, stale docs and narrating comments, unused code. | this design |
| #250 Remaining duplication | Whatever duplicates are left after the slices above. | all above |

The shared 60-second read was a second copy of the library under belief 4. The fracture ledger
records it as "Library copies — a live 60-second read beside the database", healed by #252.
