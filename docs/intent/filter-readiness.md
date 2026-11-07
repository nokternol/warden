# Filter readiness — one source for "what's wrong with these filters?"

**Status:** DRAFT — INTENT, not yet built and not yet signed off. Delete this file when it ships
(step 7).

## The problem

Four pieces of code answer the same underlying question — *what's wrong with these filters right
now?* — and each answers a different part of it, with its own rules and its own wording. The checks are
not the problem. Having four sources of them is: they contradict each other.

| Source | Where | The question it is asked | Facts it reads |
|---|---|---|---|
| Saved-query health | `computeHealth`, `server/modules/mediaQueries/mediaQueryService.ts:71` | "Is this saved query usable, and if not, why?" | active provider types and ids; each filter's rule and its providers; instance qualifications; optionally an automation's provider |
| Media page warnings | `noDataErrors`, `server/modules/media/media.procedures.ts:146` | "Why might these results be empty?" | whether an enrichment-only rule's field holds any value for the content type |
| Automation pre-run check | `blockingProblems`, `missingEnrichment`, `enrichmentIsComplete`, `server/modules/automations/automationExecutor.ts:308-375` | "Can this automation run safely now?" | everything health reads (by calling it), plus whether an enrichment-only rule has an active producer, the latest enrichment run's status, and whether values exist |
| Query list reasons | `healthReasons`, `src/components/QueryRow/index.tsx:27` | "How do I say what health found?" | the health payload, from which it re-derives "a filter is supplied when any one of its providers is active" |

Each also words its findings separately: `describeMissingProvider` / `describeQualificationIssue`
(`automationExecutor.ts:117-135`), the browse warning string (`media.procedures.ts:159`), the
executor's two enrichment strings, and the client's `ISSUE_REASONS`.

### What the contradictions look like

- A saved query shows healthy in the query list while the Media page warns that one of its filters
  matches nothing.
- An automation is skipped because a filter's "data has not finished loading", a reason no other screen
  shows.
- The Media page's warning travels as a `MediaError` whose `provider` field holds a rule label
  (`media.procedures.ts:158`). The client treats it as a provider failure: it dedupes by that field
  (`src/hooks/usePaginatedMedia.ts:115`) and shows it in the red "a source failed" box
  (`src/pages/media/index.page.tsx:476`).

### Dead and duplicated pieces around the checks

- **The `required` flag is set to `false` on all 51 rules** (`server/modules/media/ruleRegistry.ts`). So
  saved-query health can never report `unavailable`, the query list's **Unavailable** badge can never
  appear, and the executor's "required provider is not configured" branch (`automationExecutor.ts:326`)
  can never fire. The flag suggests a distinction the code never makes. It is also carried in the API
  contract's `ProviderStatusSchema` (`contract/schemas.ts:78`).
- **The executor loads each targeted query three times** before running it: `getById` in
  `blockingProblems`, again inside `getHealthForAutomation` (which also recomputes health,
  `mediaQueryService.ts:315-326`), and again in `missingEnrichment`. `planRun` loads it a fourth time.
- **The enrichment checks switch off silently** when the executor is built without `enrichmentQueries`
  (`automationExecutor.ts:349`).
- **The Media page runs one `hasValues` query per enrichment-only filter** per page.
- **The enrichment task's id is spelled three times**: `ensureSystemJobs.ts:12`,
  `systemTaskRunner.ts:43`, and the executor's `ENRICHMENT_TASK_ID` (`automationExecutor.ts:65`).
  (`SYSTEM_TASKS` in the executor is a fourth.)

## The decision

**One mechanism computes every finding, from one set of facts, with one wording. Each screen keeps
exactly one rule about what to do with the findings.** Nothing new is checked: the findings are the
union of what the four sources compute today.

| Finding | Raised when | Computed today by |
|---|---|---|
| `no-provider` | No active, offered provider can supply the filter's rule. A rule is supplied when **any one** of its providers is active. | health (every rule); the executor (enrichment-only rules) |
| `inactive-instance` | A filter value is qualified to a provider instance that is not active | health; the executor, via health |
| `other-instance` | Given an automation's provider: a filter value is qualified to a different instance | health with automation context; the executor |
| `no-data` | An enrichment-only rule's field holds no value for this content type | the Media page; the executor |
| `data-incomplete` | An enrichment-only rule's latest enrichment run did not succeed | the executor only |

Each finding carries the filter's rule key, its kind, and the one sentence every screen shows.

| Screen | Its one rule |
|---|---|
| Query list | shows every finding, under a single **Can't run automations** badge |
| Media page | shows every finding in its own warning-styled notice beside the results; the red "a source failed" alert keeps only provider failures |
| Automation pre-run check (when a run fires) | skips the run while there is any finding, recording each finding's message as the reason |

**There is no severity and no `required` flag.** Every finding stops an automation, so a level that
changes nothing would only be another thing to misread. A catalog filter (year, monitored, tags) can only
lack a provider when the content type's library source itself is missing, so there is nothing for any
filter to match either way.

**Nothing here looks at match counts.** A query that matches nothing today, with every source configured
and the data loaded, is a fact about the library, not a fault.

### Why it lives in the media module

The Media page's server code is in `media`, and the enforced dependency direction
(`.dependency-cruiser.cjs:29-37`) lets `mediaQueries` and `automations` import `media`, never the
reverse. The mechanism takes `(filters, contentType)` because the Media page browses with URL filters
and has no saved query.

### Facts are read once, then judged in memory

The facts are the same for every filter list in a request: the active providers, the latest enrichment
run's status, and which enrichment fields hold values. They are read once, and each filter list is then
judged against them without further reads. This keeps the query list at one set of reads however many
queries it holds, and makes the rules testable without a database.

```ts
// server/modules/media/filterReadiness.ts
interface FilterReadiness {
  facts(): Promise<ReadinessFacts>; // active providers, latest enrichment run, fields with values
}
interface ReadinessFacts {
  findings(
    filters: Filter[],
    contentType: ContentType,
    automationProvider?: { id: number; type: MetadataProviderType }
  ): ReadinessFinding[];
}
interface ReadinessFinding {
  ruleKey: string;
  kind: 'no-provider' | 'inactive-instance' | 'other-instance' | 'no-data' | 'data-incomplete';
  message: string;
}
```

### `media` learns the enrichment run's outcome from events, and owns its own copy

Whether the latest enrichment run succeeded is recorded in `automation_runs`, which `automations` owns.
No module queries across another's boundary, and no other module reads that table. Instead, cross-module
facts travel the way cross-module changes already do (the media caches clear on `media:changed` and
`provider:changed`): the owner publishes, and each module that needs the fact keeps its own
representative state.

- **Live:** every run already ends with `run:completed`, carrying its `taskId` and `status`
  (`automationExecutor.ts:549`). `media` subscribes and keeps the latest status of the enrichment task.
- **At startup:** the bus has no replay, so after a restart `media` would not know the last outcome until
  the next enrichment run (up to six hours). The owner announces it instead. A new event,
  `run:latest` (`{ taskId, status }`), is sent by `automations` for each system task's most recent run,
  once at startup, from the same place that seeds the scheduler before the server takes requests
  (`server/index.ts:50-57`). `media` handles it exactly like `run:completed`.
- **Until anything is heard**, the enrichment outcome is unknown, and an enrichment-only rule raises
  `data-incomplete`, the same as a run that hasn't succeeded.
- **The listener follows the bus conventions:** it subscribes once, catches its own errors, and does
  nothing but assign a field.
- **The task id is shared, not re-spelled.** `media` must recognise the enrichment task, and it can
  import neither `system` nor `automations`. The system task ids move to `contract/` (already imported
  by every module and the client, the way `contract/scope.ts` shares the deferred-surface declaration);
  `ensureSystemJobs`, `systemTaskRunner`, the executor and `media` all import them.

Rejected: a shared state owner in the kernel (a generic status store that modules write to and read
from). It works, but it would be a new kind of shared, mutable place, and later cross-module facts would
drift into it. Rejected too: the enrichment job recording its completion in a media-owned table, which
would duplicate a fact the run history already holds.

## Guidance on each screen

- **Decided: an automation's readiness is checked only when a run fires.** Nothing triggers a check
  before then, so no screen predicts whether a run will be refused. When a run fires (scheduled or Run
  Now) and its queries have findings, it is skipped. The attempt is recorded in the run history as a
  skipped run carrying one reason line per finding (`recordSkip`); the automation's stored last-run
  summary is left alone. The automation row's **Last run** reads the newest run in the history, so it
  shows the skipped attempt as **Invalid** with its reasons, and so does the Runs page. That is today's
  behaviour, now fed by the shared findings.
- **Decided: Run Now stays available on every automation.** Pressing it is the trigger: it fires a run,
  the run checks readiness, and a run with findings is skipped at once, the skipped attempt showing as
  the latest run with its reasons.
  Disabling the button would need a check that nothing triggers, and once disabled there would be no way
  to trigger the re-check that shows the problem has been fixed.
- **Decided: checks are enforced when a run fires, never when an automation is saved.** Saving records
  what the user intends; it doesn't change whether a run can proceed. Save is always allowed.
- **Not changed:** the automation preview still counts targets; the builder and the automation list
  show no readiness information.
- **The destructive-count confirmation is a separate concern**, covered by
  `docs/intent/destructive-tasks-manual-only.md`.
- **Later, not here:** notifying the automation's owner that a run was skipped. The skip record is what
  that notification will read.

## Scope

### In scope

1. System task ids shared from `contract/`; `media` keeps the latest enrichment outcome from
   `run:completed`, and `automations` announces each system task's latest outcome at startup with
   `run:latest`.
2. `FilterReadiness` in `media`: facts, findings, wording.
3. Saved-query health from it: `computeHealth`, `getHealthForAutomation` and the `required` flag go;
   the `QueryHealth` contract becomes `{ findings }`.
4. The Media page from it: `noDataErrors` goes; browse returns `findings` beside `errors`, so
   `MediaError.provider` is always a provider.
5. The automation pre-run check from it: the executor's own checks and wording go; each query is
   loaded once per run.
6. The client: the query list shows the server's findings; `healthReasons` and `ISSUE_REASONS` go.
7. Docs, a fracture-ledger Healed entry, and this file deleted.

### Out of scope, with the reason

- **Destructive tasks and the count confirmation:** `docs/intent/destructive-tasks-manual-only.md`.
- **Match counts or a "matches nothing" warning.** Not a fault, and costly to compute per query.
- **A system-job registry.** The ids become shared, but a system job is still declared in three tables
  (`SYSTEM_JOBS`, the runner's dispatch, `SYSTEM_TASKS`); one registry for them is its own finding.
- **One owner for what a query matches** (browse, preview and the executor count matches differently).
  Readiness says whether filters *can* match; the catalog says what they *do* match.
- **A `media_enrichment` index for field lookups.** An efficiency finding; one batched lookup per request
  is enough here.
- **Making every optional dependency required.** Only the readiness path stops depending on an optional
  `enrichmentQueries`.

## Steps

Each step leaves `yarn ci:fast` green; steps 1 and 5 also run `yarn depcruise:ci`. UI steps follow the
repo rule: Ladle story first, then in place.

### 1. The enrichment run's outcome, by event

- `contract/` exports the system task ids; `ensureSystemJobs`, `systemTaskRunner` and the executor use
  them in place of their literals.
- `kernel/eventBus.ts`: add `run:latest` (`{ taskId, status }`), documented with its sender and
  listeners like the other events.
- `automations` gains `announceLatestRuns()`: for each system task, its latest run's status from its
  own run history, sent as `run:latest`. `server/index.ts` calls it beside the scheduler seeding.
- `media`: a small `EnrichmentOutcome` holder, registered as a singleton, that listens to
  `run:completed` and `run:latest` for the enrichment task and keeps the latest status.
- Tests: the holder starts unknown, takes the status from either event, ignores other tasks; startup
  announces each system task's latest outcome, and nothing for a task that has never run.

### 2. `FilterReadiness`

`server/modules/media/filterReadiness.ts`, registered in `media.registrations.ts`, exported from
`media/index.ts`. `facts()` reads the active providers, the enrichment outcome held by `media`, and
which enrichment-only rules' fields hold values for each content type (one query for all of them). `findings` is pure.

Tests, against hand-built facts (no database):

- no filters → no findings;
- a rule supplied by any one active provider raises nothing; none active → `no-provider`;
- a provider type the scope declaration defers is never reported missing;
- `inactive-instance`; `other-instance` only when an automation provider is given;
- `no-data` and `data-incomplete` for enrichment-only rules with an active producer; neither when the
  producer is missing (that's `no-provider`);
- each kind's message.

One integration test: `facts()` against an in-memory database.

### 3. Saved-query health

- `MediaQueryService` takes `filterReadiness`; `list()` reads facts once for all queries.
- `computeHealth`, `getHealthForAutomation`, `ProviderStatus`, `QualificationIssue` and the rule
  `required` flag go; `QueryHealthSchema` becomes `{ findings: ReadinessFinding[] }`.
- Client fixtures and stories that build `QueryHealth` move to the new shape.
- Tests: `mediaQueryService.test.ts` restated as findings; a query on an enrichment-only rule before any
  enrichment run has a `data-incomplete` finding.

### 4. The Media page

- Browse output gains `findings`; `noDataErrors` goes; `errors` holds only provider failures.
- `usePaginatedMedia` exposes the findings; a notice beside `SourceErrors` shows them. Story first.
- `EnrichmentQueries.hasValues` goes if nothing else calls it.
- Tests: an enrichment-only filter with no data returns a finding, not an error; the page shows findings
  and source failures in their own places.

### 5. Automations

- `execute` loads each targeting query once and passes it to the pre-run check and `planRun`.
- The pre-run check reads facts once and gets findings per query with the automation's provider;
  problems are "this automation's provider is not active" (an automation fact, kept in the executor)
  plus each finding's message.
- `missingEnrichment`, `enrichmentIsComplete`, `describeMissingProvider`, `describeQualificationIssue`
  and `ENRICHMENT_TASK_ID` go; `filterReadiness` is a required executor dependency.
- Tests: the skip cases restated through findings; a run loads each query once.

### 6. The client

- Query list: one **Can't run automations** badge and the findings' messages; `healthReasons` and
  `ISSUE_REASONS` go.
- Story first; `QueryRow` tests assert the server's messages.

### 7. Docs and close

Per `docs-lifecycle`:

- New `docs/architecture/filter-readiness.md`: the findings, the one rule per screen, why it lives in
  `media`, the facts read once, and how `media` learns the enrichment outcome by event.
- `VOCABULARY.md`: "Query health" derives from filter readiness; add **FilterReadiness** and
  **Readiness finding**.
- `provider-roles-and-identity.md:240`: `computeHealth` becomes the `inactive-instance` /
  `other-instance` findings.
- `fracture-ledger.md`: a Healed entry, "Filter readiness — four sources for one answer".
- Grep and triage `computeHealth|getHealthForAutomation|noDataErrors|missingEnrichment|
  enrichmentIsComplete|qualificationIssues|providerStatus|hasValues|required` across `docs/`, `server/`
  and `src/`.
- `graphify update .`, then `link_doc_to_code.py --apply` on each edited architecture doc.
- Delete this file.

## Closure check

| Finding in the reviews | Closed by |
|---|---|
| "Is there data to match?" answered by several sources that disagree | Steps 2–6: one mechanism, every screen reads it |
| Different severity models and messages | No severity; one message per finding |
| A query can look healthy while the Media page warns | Steps 3–4 read the same findings |
| An automation can refuse for a reason no other screen shows | Steps 3 and 6: the query list shows every finding that stops a run, worded as the skip records it |
| The Media page checks no provider configuration or enrichment run | Step 4 |
| One `hasValues` query per filter | Step 2: one lookup per request |
| Health computed twice for an automation | Step 3 removes `getHealthForAutomation` |
| Each query loaded three or four times per run | Step 5 |
| `'system:enrichment'` inside the executor's check | Steps 1 and 5 |
| The check switches off without `enrichmentQueries` | Step 5 |
| `MediaError.provider` holding a rule label | Step 4 |
| The client re-deriving the supply rule | Step 6 |

## Decisions taken in review

1. **Decided:** the Media page shows findings in their own warning-styled notice, separate from the red
   source-failure alert.
2. **Decided:** `media` learns the enrichment run's outcome by event and keeps its own copy (see "`media`
   learns the enrichment run's outcome from events").

---

## Hazards report

A review of this plan against the code as it stands. Each hazard gives the code fact, what goes
wrong, and what the plan would need to say. They are ordered by harm: the first group can make a
destructive automation act on the wrong titles, or stop automations that should run.

### Critical: safety regressions and wrong refusals

**H1. A filter whose only producer is deferred stops raising anything, so an automation runs on a
filter that matches nothing.**
`tmdbStatus` is produced only by TMDB, and `scope.ts` defers TMDB. Today the executor's
`missingEnrichment` builds `producers` from `providerStatus`, which already leaves deferred types out.
So `producers` is empty and the run is skipped ("has no connected provider to supply its data"). The
plan's test list says "a provider type the scope declaration defers is never reported missing", and
"`no-data` / `data-incomplete` … neither when the producer is missing (that's `no-provider`)". Taken
together, a deferred-only rule raises **no finding at all**. A query can still hold such a rule:
`MediaQueryService.create` validates with `getRule`, which does not check `isOfferedRule`. Only the
rules *listing* (`media.rules.procedures.ts:34`) filters deferred rules. As an exclude clause, that
filter protects nothing, and a destructive task acts on titles the user meant to keep.
*Needed:* a rule with no offered producer is a finding (`no-provider`, or a separate kind for a
deferred rule), and saving a query rejects deferred rule keys. Add the case to step 2's tests.

**H2. `other-instance` as defined refuses every non-source actuator whose query names an instance.**
The engine's gate (`mediaQueryEngine.ts:62-63`) compares a filter's `providerId` with the
*item's source instance* (`item._sourceIds.providerId`). It does not compare it with the automation's
provider. For a Plex, Jellyfin or Tautulli actuator (all declare tasks), the query is evaluated against
pooled Radarr/Sonarr catalogs. A tag qualified to Radarr instance 3 is valid there and matches that
instance's titles. But `computeHealth` raises `wrong_automation_provider` whenever
`providerId !== automationProviderId`, and the plan carries that over unchanged as `other-instance`. Such
an automation is skipped on every run. The finding is only meaningful for a catalog-owning actuator.
*Needed:* say which actuators the finding applies to (source-type automation providers only), and
test that a non-source actuator with an instance-qualified filter has no `other-instance` finding.
Check whether this is a live bug today before step 5. The plan inherits it either way.

**H3. The startup `run:latest` announcement is lost, because the listener does not exist yet.**
Awilix `.singleton()` registrations are built lazily, on first resolve. `ActiveFieldSetCache`
subscribes in its constructor (`activeFieldSet.ts:107`). The media procedures subscribe inside
`createMediaProcedures`, which `server/index.ts` calls only *after* the scheduler is seeded. An
`EnrichmentOutcome` singleton "registered like the others" would not be built when
`announceLatestRuns()` emits from "beside the scheduler seeding", so the event reaches no one. The
holder then stays unknown, every enrichment-only filter raises `data-incomplete`, and every automation
using one is skipped for up to six hours after each restart. That is exactly the failure the event was
added to prevent. Tests built from `buildContainer` without the announce call hit the same state.
*Needed:* step 1 states the order: the holder is resolved (subscribed) before the announce, and a
test boots the real container, restarts, and asserts the holder's status. Better still, have the
holder pull its seed itself, which the boundary rule forbids, so this ordering is the price of the
event design. Say so in the doc.

**H4. One failed enricher halts every enrichment-based automation, including ones it doesn't feed.**
`EnrichmentJob.run` gathers all enrichers with `Promise.all`. One unreachable provider (say Seerr)
rejects the whole run, so `run:completed` carries `error` for the one enrichment task. The plan keeps a
single status per task. So when Seerr is down, a query on Plex `playCount` raises `data-incomplete`,
and every automation using any enrichment-only rule is skipped. This also exists in today's executor.
The plan makes it more visible (the Media page and the query list now show it) and adds nothing to
narrow it.
*Needed:* at least an explicit decision that this coupling is accepted. Otherwise, per-producer
outcomes (the enrichment job reports which enrichers succeeded) so that `data-incomplete` follows the
rule's own producers.

### High: findings that say "ready" when the data isn't there

**H5. "The latest enrichment run succeeded" does not mean "this filter's data is loaded".**
- `EnrichmentJob.run` re-enriches only identities whose `enrichedAt` is more than 24 hours old.
  Activate a new producer (such as Tautulli) right after a successful run: the status stays `success`,
  and the new producer's values do not arrive for up to 24 hours plus the 6-hour schedule. If any other
  producer already holds values for that field, `no-data` is false too, so readiness reports nothing.
  Nothing resets `enrichedAt` or the held outcome on `provider:changed`.
- A run that is in progress (or killed partway) leaves the previous `success` in place while titles
  are being rewritten one by one. System runs never write a `running` row
  (`recordResult` → `createRun` at the end), so `closeInterruptedRuns` cannot record the interruption.
- Enrichment works on `media_identity` rows. A title added since the last identity-resolution run
  (hourly) has no identity, so it has no enrichment, and every enrichment filter treats its value as
  unknown. The facts model does not include identity resolution at all.

*Needed:* either name these limits in the architecture doc, or define the fact as "the latest run
that covered the current producers succeeded". For example, the holder drops back to unknown on
`provider:changed` for enrichment producer types. This is the main gap between what the findings
promise and what they check.

**H6. `no-data` is a match-count heuristic, which contradicts "Nothing here looks at match counts".**
`hasValues` asks whether *any* title of the content type holds a value. A library where no title has
ever been requested in Seerr, or none carries a Plex label, is a legitimate state that raises `no-data`
permanently. Any automation that uses such a filter, even only as a protective exclude, is skipped
forever, with no way for the user to say "that's correct". Today this only blocks the executor. The
plan also puts it on the Media page and the query list badge.
*Needed:* decide which fields can legitimately be empty, or drop `no-data` when `data-incomplete` is
clear and the producer is active. Make the decision explicitly, and test it.

**H7. "Supplied by any one provider" is not scoped to the content type.**
`monitored` lists `[RADARR, SONARR]` for both movies and series. A movie query on `monitored` with only
Sonarr active is "supplied", so it raises no finding while there is no movie library at all. The
plan's claim that "a catalog filter can only lack a provider when the content type's library source
itself is missing" does not hold under its own supply rule. And a query with **no filters** gets no
finding even when the library source is missing ("no filters → no findings").
*Needed:* a content-type-level finding ("no library source for movies") that does not depend on
filters, or a supply rule limited to the providers that serve the query's content type.

### Medium: claims in the plan the design doesn't meet

**H8. The query list cannot show every finding that stops a run.** The closure check says step 6
makes "the query list show every finding that stops a run, worded as the skip records it". But
`list()` has no automation context, so `other-instance` never appears there. "This automation's
provider is not active" stays an executor-only problem. `excessiveReach` and `planRun`'s thrown errors
(task not enabled, task not implemented) also stop runs, and appear only in the run history. The
contradiction "an automation refuses for a reason no other screen shows" is narrowed, not closed.
That closure row should say so.

**H9. The "Can't run automations" badge goes on queries no automation uses.** Every saved query
with a finding gets the badge, whether or not an automation targets it. A query saved only for
browsing then reads as broken, and the wording claims more than the list knows (see H8).

**H10. Facts must be read after the provider-turn wait, and the plan's step 5 wording invites
the opposite.** `execute` re-reads the automation *inside* `takeProviderTurn`, because the wait can
be long. "`execute` loads each targeting query once" could easily be built before the turn, judging
the run against queries and facts that are minutes old. Step 5 should say: queries and facts are
loaded inside the turn, once.

**H11. Duplicate and noisy findings.** Two filters on the same rule (for example, two tag
filters) produce duplicate findings. With no Radarr configured, every filter on the Media page
produces its own `no-provider` line for the same cause. The plan says nothing about deduplication or
grouping, and the old client `healthReasons` grouped by provider type.

**H12. Ordering between `run:latest` and `run:completed`.** The holder "handles `run:latest`
exactly like `run:completed`". If the scheduler (seeded first) fires an enrichment run that completes
before the announce, the stale `run:latest` overwrites the newer outcome. The window is unlikely but
real. Either announce before seeding the scheduler, or ignore `run:latest` once a `run:completed` has
been heard.

**H13. Findings go stale on the client.** Findings now depend on enrichment state, which changes
every six hours with no client event. The query list and browse responses are cached by the client's
data layer. Nothing in the plan refetches them when an enrichment run completes, so the badge and the
Media notice keep showing an outcome that no longer holds until the next refetch.

### Technical debt the plan touches but leaves in place

- **The executor still builds `EnrichmentQueries` and `MediaQueryEngine` itself** when they are not
  injected (`automationExecutor.ts:159-166`), and `createMediaProcedures` constructs its own
  `EnrichmentQueries` from `cradle.db`. The plan makes `filterReadiness` a required dependency but
  leaves these DI bypasses, so some paths stay "optional unless db". Step 5's test-construction churn
  (every executor test building a `FilterReadiness`) is not mentioned.
- **`SYSTEM_TASKS` is a fourth spelling of the ids.** Step 1 lists only `ensureSystemJobs`,
  `systemTaskRunner` and the executor's constant. `SYSTEM_TASKS`' keys should use the shared ids too,
  or the fourth spelling survives the step meant to remove it.
- **The skip reason is one `'; '`-joined string** (`recordSkip(…, problems.join('; '))`). "One
  reason line per finding" is presentation over a flat `error` column. The run history stores no
  structured findings, which the "later" owner notification will need. Recording `ruleKey`/`kind` now
  costs little; parsing English strings later costs a lot.
- **Server-built English messages are frozen into run history.** Rewording a finding does not
  update past skips, and the client loses the provider-type labels it used to look up
  (`useProviderTypes`). The plan should say the server owns provider labels in messages.
- **`latestStatusOfTask` stays on `AutomationRunService`** with no remaining caller once step 5
  removes `enrichmentIsComplete`, unless `announceLatestRuns` reuses it. Say which.
- **`MediaQueryService.create` does not validate deferred rules** (see H1). The plan rewrites the
  health that `create` returns but leaves its validation as it is.

### Missing from scope, likely to cause trouble later

- **A migration story for the contract change.** `QueryHealthSchema` is `.strict()`. Any client
  build or cached response holding the old `{ status, providerStatus, qualificationIssues }` shape fails
  to parse. Fine if server and client always ship together (same Next process), but step 3 should say
  that this is relied on.
- **Fixtures beyond `QueryRow`.** `AutomationQueryList`, `AutomationBuilder` (stories and tests),
  `DashboardContent` stories, `useMediaQueries` tests and `media.page.browseEncoding.test.tsx` all
  build the old health or `MediaError` shapes. Step 3 names only "client fixtures and stories". Step 4
  also changes the browse output those tests decode.
- **What happens to queries holding rule keys that are no longer registered.** `getRule` returns
  `undefined`, and both `computeHealth` and the executor skip the filter silently. The plan has no
  finding for an unknown rule, though such a filter is unjudgeable and, in an exclude, unsafe.
- **Identity resolution as a readiness fact** (see H5). Enrichment depends on it, and its run
  outcome is already in the same run history the plan reads.
- **A doc decision on accepted limits.** H4, H5 and H6 may each be accepted rather than fixed, but
  then the architecture doc in step 7 must state them as limits. Otherwise the new single source
  carries the old blind spots under a name that suggests completeness.

---

## Complexity review

This review weighs complexity against value, in both the plan and the existing code it touches. It
does not cover correctness; see the hazards report above for that. The diagnosis is right: four
sources contradict each other. In several places the cure is heavier than the disease. Findings are
ranked by how much needless complexity each removes or prevents.

### C1. An event, a replay, a holder and shared ids, to carry one yes/no fact

*Where:* "`media` learns the enrichment run's outcome from events", and step 1.

- **Complexity:** the plan adds:
  - a new `run:latest` event;
  - `announceLatestRuns()` in `automations`;
  - an `EnrichmentOutcome` singleton in `media`;
  - the system task ids moved into `contract/`;
  - a startup ordering constraint the plan does not state, and which is fragile (H3, H12);
  - a new "unknown" state that raises `data-incomplete` after every restart until the next enrichment
    run.
- **Value:** `media` no longer reads `automation_runs`. The only fact this machinery carries is "did
  the latest enrichment run succeed".
- **At odds:** today this is one call, `automationRunService.latestStatusOfTask('system:enrichment')`,
  made inside the executor, which already owns the run history.
- **Simpler alternative A (recommended):** the executor reads the status as it does today and passes
  it into the judging function as an argument. No event, no holder, no move of the ids, no startup
  ordering. `media` never needs to recognise the enrichment task.
- **Simpler alternative B:** derive the fact from `media`'s own data. `EnrichmentJob.run`
  (`enrichmentJob.ts:63-109`) awaits every enricher before it writes anything, so a title's
  `media_identity.enrichedAt` is written only by a run in which every enricher answered. This
  alternative has two flaws:
  - A title added since the last run has a null `enrichedAt`. "Any title not yet enriched" would
    therefore block every enrichment-based automation whenever a new title arrives, until the next
    run.
  - A fresh timestamp says nothing about a producer activated after it was written (H5).

  B is workable only with a threshold, such as "most titles fresh", which is a heuristic of its own.
- **Gives up (A):** the Media page and the query list cannot show `data-incomplete` (see C2).

### C2. `data-incomplete` on screens that have nothing to protect

*Where:* the finding table, and the Media page and query list rules.

- **Complexity:** the Media page has no automation and no run history, yet it takes on the "last
  run failed" machinery. The query list shows a state that changes every six hours with no refresh
  signal (H13).
- **Value:** only an automation run needs this check, because it acts, possibly destructively, on
  data that may be unknown.
- **Simpler alternative:** `data-incomplete` is a precondition only the executor checks, fed by the
  status it already reads (C1, alternative A). The shared mechanism covers the static findings:
  `no-provider`, the instance findings and `no-data`.
- **Gives up:** strict "one list of findings everywhere". An automation can be skipped for one reason
  the query list does not show. The list already cannot show every skip reason (H8).

### C3. The two-stage `facts()` → `findings()` interface

*Where:* "Facts are read once, then judged in memory", and step 2.

- **Complexity:** `FilterReadiness.facts()` returns a `ReadinessFacts` object, which has
  `findings()`. That is two interfaces, an object closing over data, and an implicit call order.
- **Value:** facts are read once per request, and the rules are testable without a database.
- **At odds:** both benefits come from a plain `readReadinessFacts()` plus a pure
  `findingsFor(facts, filters, contentType, automationProvider?)`. Facts as plain data are easier to
  build in tests than an object with behaviour.
- **Gives up:** nothing material.

### C4. Five kinds, each with a sentence the server writes

*Where:* the finding table, and `ReadinessFinding.message`.

- **Complexity:** five kinds, and English sentences composed on the server. Those sentences are
  frozen into run history (`recordSkip` stores one `'; '`-joined string), and the client loses the
  provider-type labels it used to look up.
- **Value:** one wording on every screen, and no re-derivation on the client.
- **Simpler alternative:**
  - Merge `inactive-instance` and `other-instance` into one `wrong-instance` finding that carries
    the instance id.
  - Drop `data-incomplete` from the shared set (C2).
  - Make the sentence a pure function of `{ kind, ruleKey, providerId? }` in `contract/`, shared by
    server and client.
  - Store findings structured in the skip record. The "notify the owner" feature then gets
    structured input for free.
- **Gives up:** a little precision in the messages. The client imports the formatter.

### C5. A hard contract break, with the client six steps away

*Where:* steps 3 and 6.

- **Complexity:** `QueryHealthSchema` is `.strict()`, and step 3 replaces its shape with
  `{ findings }`. The `QueryRow` client that reads it only moves in step 6. Fixtures in at least five
  client areas are rewritten. Step 5 makes every executor test build a `FilterReadiness`.
- **Value:** a clean end state.
- **Simpler alternative:** add `findings` alongside the old shape first. Compute `status` from the
  findings and leave the always-empty `providerStatus` in place. Move the client, then delete the old
  fields. Steps 3 and 6 stop being coupled, and fixtures change once.
- **Gives up:** a short period with two shapes in the contract.

### C6. Existing design: the `required` flag and the `degraded` / `unavailable` statuses

*Where:* `ruleRegistry.ts` (false on all 51 rules), `contract/schemas.ts:78`, and
`automationExecutor.ts:326,357`.

Dead code in three layers: a flag nothing sets, a badge that never shows, and branches that never
run. The plan is right to delete them. This is the cheapest and safest win in the plan, and it needs
none of the new design. Ship it alone, first, to shrink every later diff.

### C7. Existing design: the executor reloads each query and builds its own dependencies

*Where:* `automationExecutor.ts:309-375`.

- **Reloads:** `blockingProblems`, `getHealthForAutomation`, `missingEnrichment` and `planRun` each
  call `getById`.
- **Self-built dependencies:** the executor constructs `EnrichmentQueries` and `MediaQueryEngine`
  when they are not injected (`:159-166`), and a missing `enrichmentQueries` silently disables the
  enrichment check.

This is real debt, but separate from readiness. Loading once is about ten lines: load inside the
provider turn, then pass the records along. The plan ties it to the new mechanism for no technical
reason. Do it first, independently.

### C8. A system job declared three ways

`SYSTEM_JOBS`, the runner's dispatch and `SYSTEM_TASKS` each declare system jobs. The plan moves the
ids into `contract/` only so that `media` can recognise the enrichment task. With C1's alternative
A, `media` never needs the id, and that move leaves this plan. The id sharing belongs to the
system-job registry work that is already out of scope.

### C9. The "Can't run automations" badge

The badge claims more than the list knows. The list has no automation context, so instance mismatches
and an inactive automation provider never appear there (H8). Many queries are not used by any
automation (H9). A neutral wording such as "Needs attention" makes no promise the system can't keep.
An alternative is to word the badge for automations only when an automation targets the query.

### C10. Worth keeping as planned

- **One batched lookup** for all enrichment-only fields per request, in place of a `hasValues` query
  per filter. It is cheap, and it removes N round trips.
- **Reusing the scope declaration** (`contract/scope.ts`). It is a one-line filter; the problem with
  it (H1) is correctness, not complexity.

### Where the plan makes matters worse

- **More coupling across modules.** `media` comes to depend on startup ordering in `server/index.ts`
  and on shared ids in `contract/`, to know one fact that is today one query in one class.
- **A new failure mode.** An "unknown" state after a restart blocks enrichment-based automations
  until the next enrichment run, which can be six hours away. Today's check reads the table, so a
  restart cannot lose it.
- **More code, in places, than the four sources it replaces.** The plan adds an event type, a
  holder, an announcer, moved ids, two interfaces, a new contract shape, and churn in every executor
  test.
- **A muddier mental model.** `data-incomplete` and `no-data` are close enough that users cannot
  tell them apart. `no-data` also quietly contradicts "nothing here looks at match counts" (H6).
- **A contract break** in step 3 that the client only catches up with in step 6.

### Where the complexity is justified

- One pure judging function over one set of facts. This removes the four-way contradiction directly,
  and it is easy to test.
- Placing it in `media`, as the dependency direction requires. The Media page judges URL filters
  with no saved query.
- Separating findings from provider failures on the Media page. `MediaError.provider` holding a rule
  label is a real bug.
- Deleting `required`, `degraded`, `unavailable`, `getHealthForAutomation` and the executor's
  duplicated wording.
- Batching the field-value lookup, and loading each query once per run.
- Rejecting a shared state store in the kernel.
- Keeping Run Now available, and enforcing checks only when a run fires.

### Suggested trim

1. Ship the dead-code removal (C6) and loading each query once (C7) on their own.
2. Build the pure judging function over the static findings, with the executor passing in the
   enrichment run's status.
3. Move the client to structured findings, using the additive contract (C5).

This drops step 1 and the move of the task ids, and with them the restart failure mode.

---

## Proof review and redraft

This section is added after the first draft, the hazards report and the complexity review, and
changes none of them. It does four things:

1. It proves or disproves each claim the plan rests on, saying how.
2. It names the tests that guard what the plan must not lose.
3. It restates the plan with the facts folded in.
4. It checks the result against the problem statement.

Where it contradicts the text above, it cites the line.

**Kinds of evidence.** Each fact below names its evidence:

- **test**: a test that runs green against the code as it stands;
- **experiment**: the code was changed temporarily, the test watched fail, and the code restored;
- **read**: established by reading the code only. Treat these as weaker.

The new tests are in `server/__tests__/modules/automations/filterReadiness.proofs.test.ts`,
cited below as *proofs*.

### Facts

| # | Fact | Evidence | Bears on |
|---|---|---|---|
| F1 | A query on a rule whose only producer is deferred (`tmdbStatus`, TMDB only) **can be saved**, and a run using it **is skipped today**, even when it sits only in an exclude. | test: proofs, "saves a query on a rule whose only producer…" and "stops a run whose filter only a deferred provider type could supply" | Hazard H1 holds. It contradicts the first draft's test list (lines 224 and 226-227): together those two lines would make the rule raise nothing. |
| F2 | A stored filter whose rule no longer exists: query health reports **healthy**, but the run is recorded **`error`** and never reaches the actuator, **even inside an exclude**. The only thing stopping it is the throw in `matchItems` (`server/modules/media/mediaQueryEngine.ts:59-60`). | test: proofs, "reports a query naming a rule that no longer exists as healthy" and "stops a run whose stored filter names a rule that no longer exists". experiment: with the throw replaced by `return true`, the run recorded `success` and the safety test failed; the file was restored with `git checkout`. | Contradicts the hazards report's "Missing from scope" (lines 473-475). The run does not skip the filter silently, and the filter is not unsafe in an exclude. It *is* invisible to readiness, which is the real gap. |
| F3 | For a non-source actuator (Plex), a tag filter qualified to an **active** Radarr instance is matched by the engine on the pooled catalog (2 of 2 titles). The run is still **skipped** as "not this automation's provider". | test: proofs, "a non-source actuator whose query names a source instance" | Hazard H2 holds, and **it is a live bug today**. The comment on `getHealthForAutomation` (`mediaQueryService.ts:310-313`) says the `matchItems` gate makes such an entry match nothing. That is true only for a source-type actuator. |
| F4 | One enricher that throws fails the whole enrichment run. The enrichers that did answer have **nothing written**, and `enrichedAt` is unchanged. | test: proofs, "fails the whole run when one enricher fails…" | Hazard H4 holds. |
| F5 | Writing a title's enrichment fields **deletes every field not repeated** (`replaceFields` deletes, then inserts). | test: proofs, "drops a title's stored fields that a write does not repeat" | New. The obvious fix for F4 (`Promise.allSettled`, then write what answered) would **erase** the failed provider's earlier values on every outage. A fix for F4 has to merge per producer. |
| F6 | A title enriched within the last 24 hours is not re-read when a new provider is connected. The connection changes nothing on the title, and the next run queries no enricher. | test: proofs, "does not re-read titles enriched within a day…" | Hazard H5's first bullet holds for **Tautulli, Seerr and TMDB**. |
| F7 | When identity resolution links a title to a newly connected **Plex or Jellyfin** server, it clears that title's `enrichedAt`, so the next enrichment run reads it. | test: Plex in `identityResolutionJob.test.ts:733`; Jellyfin in proofs, "re-reads a title once identity resolution links it…" | Partly contradicts H5 (line 374, "Nothing resets `enrichedAt`"). Identity linking does reset it, but only for the two actuator-addressing providers, and only once the hourly identity run has passed. |
| F8 | With Seerr connected and the latest enrichment run a **success**, a run of an automation using a Seerr filter (even only as an exclude) is skipped when it fires if the library holds no Seerr values. Nothing about a legitimately empty library changes between runs, so each later run of that automation finds the same condition and is skipped again. The recorded reason reads "Seerr request status filter's data has not finished loading", which is false. | test: proofs, "skips a run using a Seerr filter while the library holds no Seerr data…" | Hazard H6 holds. Today's wording also misstates the cause. |
| F9 | A movie query on `monitored` with only Sonarr configured reports **healthy**. So does a movie query with no filters and no provider at all. | test: proofs, the two "reports … as healthy" pins | Hazard H7 holds. Contradicts the first draft's lines 74-76: a catalog filter *can* lack a provider for its content type while some provider supplies the rule. |
| F10 | A module's singleton subscribes to the event bus on its **first resolve**, not when the container is built. | test: proofs, "subscribes on first resolve, not when the container is built" | Hazard H3 holds. An `EnrichmentOutcome` registered like the others would miss a startup announcement sent before anything resolves it. |
| F11 | The scheduler is seeded before anything else at startup could send an announcement. | read: `server/index.ts:52-57` | Hazard H12 holds. |
| F12 | `required` is `false` on all 51 rules, and `true` on none. | read: `ruleRegistry.ts` (51 × `required: false`, 0 × `true`) | Confirms the first draft's line 36. |
| F13 | Each targeted query is loaded three times in the pre-run check and once more in `planRun`. | read: `automationExecutor.ts:319,320` (`getHealthForAutomation` calls `getById` again), `:349`, `:404` | Confirms line 41. |
| F14 | The enrichment task id is spelled four times. | read: `ensureSystemJobs.ts:12`, `systemTaskRunner.ts:43`, `automationExecutor.ts:65,568` | Confirms lines 47-49 and the hazards report's debt note. |
| F15 | Nothing outside tests listens to `run:completed` today. | read: grep for `.on(` across `server/` | The holder in step 1 would be the first server listener. |
| F16 | `AutomationRunService.latestStatusOfTask` has one caller, the executor's enrichment check. | read | Settles the hazards report's open question (line 458). |
| F17 | In production, the executor and the media procedures both receive `enrichmentQueries`, so the enrichment check is not switched off in practice. Only test construction leaves it out. | read: `automations.registrations.ts`, `media.procedures.ts:166` | Narrows line 44. The silent switch-off happens in tests, not in production. |

### Regression harness carried forward

These tests protect value the plan must keep. They must pass at every step. Where a step changes a
message, only the wording in the assertion changes; the status and "actuator never called"
assertions stay.

| Test | What it protects |
|---|---|
| `automationExecutorSkip.test.ts`: the skip record (`:103`, `:120`, `:133`, `:219`) | A skipped run is recorded as `skipped` with its reason. It leaves the last-run summary and run items alone, logs at warn, and is announced on the bus. |
| `automationExecutorSkip.test.ts`: the "hardening" enrichment cases (`:293`, `:313`, `:326`, `:362`) | Unloaded or unsuppliable play history stops the run, as an include and as an exclude. A source-supplied field does not need enrichment. |
| `automationExecutorSkip.test.ts`: `:206`, `:373`, `:407`, `:426`, `:445`, `:464` | Validity is re-derived on each run, inside the provider turn. The reach guard, the running row, interrupted runs and provider turns. |
| `automationExecutor.test.ts:1027-1083` | The enrichment-status gate: an error run skips, values for the other content type only skip, success with values runs. |
| proofs: the "safety pins" group | F1 and F2: an unjudgeable or unsuppliable filter never lets a run act. |
| `identityResolutionJob.test.ts:733` and the proofs' Jellyfin case | F7. |

**Existing tests the redraft is expected to fail, and what happens to each.** This applies the
rule that a test changes only when the new behaviour was meant to fail it:

- `automationExecutorSkip.test.ts:182`, `:248` and `:265` stub `getHealthForAutomation` with
  `required: true` states that no rule can produce. They test dead code (F12). They are
  **removed**, not rewritten.
- `automationExecutorSkip.test.ts:151` expects a skip for a *source* actuator naming another
  instance. That stays correct and **stays**, with its wording updated.
- `automationExecutor.test.ts:1064` and `automationExecutorSkip.test.ts:293` and `:313` match on
  wording. Their regexes are **rewritten** to the new messages; their status assertions stay.
- `mediaQueryService.test.ts:87-227` asserts the `{ status, providerStatus, qualificationIssues }`
  shape. It is **restated** as findings, case for case.
- The proofs' "known defects" group, and the non-source actuator case, are **expected to fail**
  at the step that fixes each defect, and are rewritten there to the fixed behaviour:
  - F2's healthy pin, and both F9 pins, flip at step R3.
  - F3 flips at step R5.
  - F8 flips at step R3, if the open question on empty fields goes the recommended way.
- Client tests that build the old health shape (`QueryRow`, `AutomationQueryList`,
  `AutomationBuilder`, `useMediaQueries`, `media.page.browseEncoding`) are rewritten at the step
  that moves the client (R6). Under R3's additive contract they keep passing until then.

### What changes from the first draft, and why

| First draft | Redraft | Because |
|---|---|---|
| A deferred-only rule is never reported missing (lines 224, 226-227) | A rule with no **offered** producer raises `no-provider`, and `MediaQueryService.create` rejects rules that `isOfferedRule` refuses | F1. The plan as drafted would let a protective exclude silently protect nothing. |
| No finding for a rule that no longer exists | New kind `unknown-rule`. The engine's throw stays as the backstop, pinned by the harness. | F2. The run is safe today only because the engine throws. Readiness should say so before a run tries. |
| `other-instance` whenever an automation provider is given (line 61) | `other-instance` only when the automation's provider is a **source** type. For any other actuator, a qualified instance needs only to be active (`inactive-instance`). | F3, a live bug. |
| "Supplied when any one of its providers is active" (line 59) | Supplied when an active provider **that serves the query's content type** supplies it. Plus a new kind `no-library`: no active source serves this content type, raised with or without filters. | F9. |
| A catalog filter can only lack a provider when the library source is missing (lines 74-76) | Withdrawn | F9 disproves it. `no-library` now carries that case explicitly. |
| `findings` keyed by filter, no deduplication | Deduplicated by `(kind, ruleKey, providerId)`, and `no-library` replaces every `no-provider` for the same cause | Hazard H11. |
| `facts()` returns an object with `findings()` (lines 95-111) | `readReadinessFacts()` returns plain data, and a pure `findingsFor(facts, filters, contentType, automationProvider?)` judges it | Complexity review C3. Nothing is given up. |
| Holder built "like the others"; announcement "beside the scheduler seeding" (lines 125-128, 207-210) | Startup order: **resolve the holder → announce → seed the scheduler**. The holder ignores `run:latest` once it has heard a `run:completed`. | F10 and F11. Decision 2 (lines 303-304) stands; this is what it costs. |
| `QueryHealth` becomes `{ findings }` in step 3 | Additive: `findings` is added beside the old fields in R3, and the old fields go in R6 | Complexity review C5. It uncouples steps 3 and 6. |
| Dead-code removal and single loading inside the plan's steps 3 and 5 | Shipped first, on their own (R0) | Complexity review C6 and C7. Neither depends on the new mechanism. |
| Step 5: "`execute` loads each targeting query once" | Queries **and facts** are loaded **inside** `takeProviderTurn`, once | Hazard H10. The harness test at `automationExecutorSkip.test.ts:373` pins it. |
| Step 1 replaces three spellings of the task id | `SYSTEM_TASKS`' keys use the shared ids too | F14. |
| `latestStatusOfTask` left unaddressed | `announceLatestRuns` reuses it | F16. |

### Open decisions, with a recommendation

These are left to you. The plan's steps are written assuming the recommendation in each case.

1. **What the `no-data` finding becomes.** As a check, "no title of this content type holds a value
   for this field" treats a legitimately empty field as broken, so every run of an automation that uses it is skipped when it fires (F8). What it actually
   approximates is "the producer has not been read since it was connected" (F6).
   *Recommendation:* drop `no-data`, and close F6 directly instead. `media` listens to
   `provider:changed`, and when the set of active enrichment producer types changes, it clears
   `enrichedAt` for every title, so the next run reads them all. The precedent is the
   `ActiveFieldSetCache` listener (`activeFieldSet.ts:107`). The holder also drops back to
   "unknown" at that moment, so `data-incomplete` covers the gap until the next run. *If kept:*
   its message must stop saying "not finished loading", and the limit goes in the architecture doc.
2. **Whether a run should be skipped because an enricher it does not use failed.** While the latest enrichment run is an error, any automation run that fires with an enrichment-only filter is skipped, even if its filter's own provider answered. That is F4, and
   its fix is constrained by F5.
   *Recommendation:* accept it in this plan as a stated limit in
   `docs/architecture/filter-readiness.md`. Per-producer outcomes need a per-producer merge write,
   which is its own intent doc.
3. **The query-list badge.** Hazards H8 and H9, and complexity review C9.
   *Recommendation:* **Needs attention**, with the findings' messages under it. Every finding
   shown there would stop a run, but the list cannot show every reason a run stops, and many
   queries have no automation.
4. **Storing findings structured in the skip record.**
   *Recommendation:* out of scope here. The `'; '`-joined `error` stays. Structured storage
   belongs to the owner-notification work, which will be the first reader of it.

### Redrafted steps

Each step leaves `yarn ci:fast` green and the harness above passing. R1 and R5 also run
`yarn depcruise:ci`. UI steps follow the repo rule: story first, then in place.

**R0. Dead code and single loading, with no new mechanism.**
- Remove `required`, `degraded`/`unavailable`, the executor's `required` branches, and the three
  tests that stub them.
- Each targeted query is loaded once, inside the provider turn, and the records are passed to the
  check and to `planRun`.
- Test: a run calls `getById` once per query.

**R1. Shared system task ids, and the enrichment outcome by event.**
- As in the first draft's step 1, plus the `SYSTEM_TASKS` keys.
- `server/index.ts` resolves the holder, then announces, then seeds the scheduler.
- The holder ignores `run:latest` after a `run:completed`, and drops to unknown when the set of
  active enrichment producer types changes (decision 1).
- Tests:
  - booting the real container announces, and the holder holds the status;
  - a `run:latest` after a `run:completed` is ignored;
  - a producer change resets the holder.

**R2. `readReadinessFacts` and `findingsFor` in `media`.**
- Kinds: `no-library`, `no-provider`, `unknown-rule`, `inactive-instance`, `other-instance`
  (source actuators only), `data-incomplete`.
- Supply is scoped to the content type. Findings are deduplicated. Messages come from one pure
  formatter in `contract/` over `{ kind, ruleKey, providerId?, contentType }`, and the server owns
  the provider labels.
- Pure tests, from hand-built facts:
  - every row of "What changes from the first draft" above;
  - F1 with no offered producer;
  - F9 with Sonarr only;
  - no filters with no library.
- One integration test of `readReadinessFacts` against an in-memory database.

**R3. Saved-query health from it, additively.**
- `findings` is added to `QueryHealth`; the old fields stay, derived for now.
- `create` rejects deferred rules.
- `list()` reads the facts once.
- The proofs' F2 and F9 pins flip here, and F8 flips under decision 1.

**R4. The Media page.**
- As in the first draft's step 4: `findings` beside `errors`, a warning-styled notice, and
  `hasValues` deleted if nothing else calls it.

**R5. Automations.**
- The pre-run check is "this automation's provider is not active" plus `findingsFor` with the
  automation's provider, over facts read inside the turn.
- `missingEnrichment`, `enrichmentIsComplete`, the `describe*` helpers and `ENRICHMENT_TASK_ID` go.
  `filterReadiness` is a required dependency.
- The proofs' F3 case flips here: a Plex actuator with a tag qualified to an active Radarr
  instance now runs.
- Executor test construction changes in every suite that builds an executor. That is expected
  churn.

**R6. The client.**
- The query list shows the **Needs attention** badge with the findings' messages.
- `healthReasons`, `ISSUE_REASONS` and the old `QueryHealth` fields go.
- Client fixtures are rewritten once, here.

**R7. Docs and close.**
- As in the first draft's step 7.
- The architecture doc also states the accepted limits: F4 (decision 2), F7's hourly lag, and
  that readiness says nothing about identity resolution.
- `getHealthForAutomation`'s comment goes with the function.
- Delete this file.

### Does it close the original problem?

The problem (lines 6-49): four sources answer "what's wrong with these filters?", each with its
own rules and wording, and they contradict each other.

| Stated symptom | Closed? |
|---|---|
| A query shows healthy in the list while the Media page warns (line 25) | **Closed.** Both read `findingsFor` over the same facts, with one wording. |
| An automation is skipped for "data has not finished loading", which no other screen shows (line 27) | **Closed for every filter-derived reason.** `data-incomplete` now appears on the list and the Media page. **Not closed for automation-level reasons**: the provider being inactive, `other-instance`, the reach guard, and task-not-enabled appear only in run history. That follows from the decision to check only when a run fires (line 145); the first draft's closure row (line 289) overclaims, as hazard H8 says. |
| `MediaError.provider` holds a rule label (line 29) | **Closed** (R4). |
| The dead `required` flag (line 36) | **Closed** (R0). |
| Queries loaded 3-4 times per run (line 41) | **Closed** (R0). |
| The enrichment check switches off without `enrichmentQueries` (line 44) | **Closed**, though it only ever happened in tests (F17). |
| One `hasValues` per filter (line 46) | **Closed** (R2). The batched lookup has no remaining reader if decision 1 drops `no-data`. |
| The task id spelled three or four times (line 47) | **Closed** (R1). |

**Verdict.** The redraft closes the problem as stated: one mechanism and one wording for every
reason a *filter list* cannot be trusted, read by every screen. Two things stop that being
complete:

1. **Wording.** "No screen shows a reason an automation is refused" is not met, and cannot be
   without a pre-run check the plan has rejected. The problem statement should be read as
   "filter-derived reasons". The architecture doc says so.
2. **What the single source still misses.** It judges filters correctly only within the limits it
   states: the enrichment outcome per task, not per producer (F4), and an identity lag of up to an
   hour (F7). A single source with stated limits closes the contradiction problem. It does not make
   the answer complete.

The first draft did not fully close the problem either: it would have created a new contradiction.
F1's deferred-only rule would be "ready" on every screen while matching nothing. F3's bug would
have carried over unchanged into the single source, so every screen would agree on a wrong answer.

### Decisions taken after the proof review

These replace the first draft's "There is no severity" paragraph (lines 73-76). They also replace
open decision 1, and settle open decision 2, in the proof review above.

1. **Two kinds of finding.**
   - **Broken** means a run relies on something that cannot work:
     - a provider it needs is inactive, unreachable or deleted;
     - a filter value names an instance that is inactive or gone;
     - it uses an enrichment-only filter and the latest enrichment run did not succeed (decision 2).
   - **Suspect** means the data looks missing: no title holds a value for an enrichment-only field
     the query uses. The system cannot tell a failed load from a legitimately empty field, so
     suspect is never treated as broken.
2. **An enrichment failure stops every run that uses an enrichment-only filter, until enrichment
   succeeds again.**
   - The enrichment job records one outcome for the whole run, and nothing finer. One enricher
     failing fails the run and writes nothing (proof review, F4). So the only safe reading of a
     failed run is that no enrichment data can be trusted.
   - This settles the proof review's open decision 2 by accepting the coupling.
   - Attributing a failure to one provider is a possible future enhancement. It is not tracked by
     this plan. If it is ever taken up: a write that skips a failed provider must keep that
     provider's earlier values, because a title's write deletes the fields it does not repeat
     (F5).
3. **Each screen's rule for each kind.** This replaces the first draft's "Screen | Its one rule"
   table (lines 67-71) and its Run Now guidance (lines 152-156).

   | Screen | Broken | Suspect |
   |---|---|---|
   | **Run Now** (the user is relying on the data now) | The run is skipped and the reason recorded, as today | Before running, ask: "There appears to be no data for *<part of the query>*. Proceed / Cancel." The user decides. The precedent is the destructive Run Now confirmation, which already previews before running (`src/components/AutomationRow/index.tsx:78`). |
   | **Media page** (results may be wrong, low stakes) | Warning notice beside the results | Warning notice beside the results |
   | **Scheduled run** (acts unattended) | Skipped, reason recorded | Blocked until a user signs off on the suspect finding (decision 4). |
   | **Query list** | Shown | Shown |

   This adjusts the first draft's "an automation's readiness is checked only when a run fires"
   (line 145). Pressing Run Now is still the trigger. The check now runs at the press, so that the
   suspect question can be asked before the run.

4. **Sign-off is in scope of this plan.** It replaces the first draft's "Not changed: … the builder and the automation
   list show no readiness information" (lines 159-160) for the automation list.
   - **A block is stored data.** It lives in a new table and belongs to one automation, with one
     row per blocking finding.
   - **A later check that no longer finds the issue clears its block.**
   - **A user can accept (sign off) each block individually.** An accepted block no longer stops
     the automation.
   - **An unaccepted block stops the schedule.** While an automation has any block not signed off,
     its schedule does not run its task. It behaves like a disabled automation.
   - **The automations screen** shows an automation's blocks and is where the user accepts them
     and lets the automation proceed.
   - **Every other screen that detects the issue** (the query list, the Media page) shows it as a
     warning. It says that if an automation relies on this query, the issue must be signed off
     there for that automation's schedule to run.
   - **Decided by default, change if wrong:**
     - Sign-off applies to *suspect* findings only. A *broken* finding (a provider gone or
       unreachable, an instance gone, enrichment not succeeding) still skips
       each run and records why. Signing it off would not make the run work.
     - A block is identified by automation, query, rule and kind. An accepted block that clears
       and later reappears is a new block, and needs a new sign-off.
5. **What re-checks a blocked automation.**
   - **The schedule keeps ticking.** While an automation has a block nobody has signed off, each
     scheduled tick runs the readiness check only, not the task. The check clears every block it
     no longer finds. If no block remains unaccepted, that tick runs the task. A sign-off
     therefore takes effect at the next scheduled tick.
   - **Run Now runs the same check.** It also asks Proceed / Cancel on a suspect finding (decision 3).
   - **Decided by default, change if wrong:** the skip is recorded when a block first appears, not
     at every tick, so the run history is not flooded while an automation waits for sign-off.
   - **Facts behind this, from reading the code (not tested):**
     - Automations have two statuses, `active` and `disabled` (`contract/schemas.ts:146`).
     - Run Now is shown for every automation whatever its status
       (`src/pages/automations/index.page.tsx:174`, `src/components/AutomationRow/index.tsx`).
     - The executor runs a disabled automation that Run Now starts. It stops a run only when the
       automation was active at the trigger and stopped being active while the run waited for its
       turn (`automationExecutor.ts:219`).
     - So Run Now is never hidden today. `docs/intent/automation-archive.md` would add an archived
       state; whether archived automations get Run Now is a question for that plan.
6. **Settled without a question, change if wrong:**
   - **Query-list badges.** **Broken** for a broken finding, **Check data** for a suspect one. Each
     is followed by its findings' messages. A suspect message adds that an automation relying on
     the query needs it signed off on the automations screen before its schedule runs. This
     replaces the proof review's open decision 3.
   - **Skip records.** A skip's `error` stays one `'; '`-joined string. The blocks table is the
     structured record, and it is what a future owner notification reads. This replaces the
     proof review's open decision 4.
   - **Proceed on Run Now applies to that run only.** It does not sign off the block for the
     schedule. Signing off is a separate action on the automation row (decision 4).

7. **One owner for the checks and their consequences.** Every finding the readiness module returns
   states, as data, what it means for each part of the system it supports:
   - `schedule`: whether a scheduled run proceeds;
   - `runNow`: whether Run Now runs, asks or stops;
   - `signOff`: whether a user can accept it;
   - `badge`: how the query list labels it;
   - `clears`: what makes it go away;
   - `mediaPage`: what the Media page does (warn, for every kind today).

   One verdict function combines an automation's findings with its sign-offs. Consumers read
   these properties and keep no rules of their own. As a result, every finding that stops a
   schedule becomes a block on the automation row, including the ones that cannot be accepted,
   such as an enrichment failure. This replaces "a broken finding still skips each run" in
   decision 4.

8. **Readiness is a state machine, tested through findings.**
   - **States.** Each block, keyed by automation, query, rule and kind, is `absent`, `open` or
     `accepted`.
   - **Transitions.** Each check produces the current findings. Then:

     | From | Event | To | Side effect |
     |---|---|---|---|
     | `absent` | the finding is present | `open` | the skip is recorded once |
     | `open` | the finding is present | `open` | none |
     | `accepted` | the finding is present | `accepted` | none |
     | `open` or `accepted` | the finding is gone | `absent` | none |
     | `open` | a user accepts | `accepted` | allowed only when the finding's `signOff` is `possible`, refused otherwise |

     A finding that clears and then reappears goes `absent → open`, so it needs a fresh sign-off.
   - **The verdict is a pure function of the blocks and the trigger.** A scheduled tick runs only
     when every block is `accepted`. Run Now runs, asks or stops by the blocks' `runNow`.
   - **The transition function is pure:** `reconcile(previousBlocks, findings) → { nextBlocks,
     skipsToRecord }`. The executor only loads, calls it and saves. The machine is tested
     exhaustively without a database: every row of the table above, plus each trigger against
     each mix of states.
   - **Findings are safely mockable.**
     - The seam between the checks and everything that consumes them is the list of findings.
       A consumer's test supplies findings directly, and stubs nothing inside the checks.
     - A test finding is built from its `kind` alone. Its effects (`schedule`, `runNow`, `signOff`,
       `badge`, `clears`, `mediaPage`) come from the same kind-to-effects table production uses,
       so a test cannot invent a finding the system would never produce. An example is an
       acceptable enrichment failure.
     - The reason is measured, not supposed. Three of today's skip tests stub the health check with
       `required: true` states that no rule can produce (`automationExecutorSkip.test.ts:182`,
       `:248`, `:265`), and they test code that can never run.
     - The kind-to-effects table has one test per kind. This is the only place the effects are
       asserted.

### Final steps

These replace "Redrafted steps" above. Each step leaves `yarn ci:fast` green and the regression
harness passing. S1 and S5 also run `yarn depcruise:ci`. UI steps follow the repo rule: story
first, then in place.

**The findings, and what each one means.** One module (`media`'s readiness) owns both the checks
and their consequences. Every finding states, as a property, what it requires of each part of the
system, so no consumer works out the rule for itself (decision 7).

| Kind | Raised when | `schedule` | `runNow` | `signOff` | `badge` | `clears` |
|---|---|---|---|---|---|---|
| `no-library` | No active source serves the query's content type, with or without filters | `stops` | `stops` | `not-possible` | `broken` | when a source for the content type is active |
| `no-provider` | No active, offered provider serving the content type can supply the rule; this includes a rule only a deferred type produces | `stops` | `stops` | `not-possible` | `broken` | when such a provider is active |
| `unknown-rule` | The filter names a rule that is not registered | `stops` | `stops` | `not-possible` | `broken` | when the filter is removed from the query |
| `inactive-instance` | A filter value names an instance that is not active | `stops` | `stops` | `not-possible` | `broken` | when the instance is active again, or the value changes |
| `other-instance` | A filter value names a source instance other than the automation's own; only for a source-type automation provider | `stops` | `stops` | `not-possible` | `broken` | when the value or the automation's provider changes |
| `data-incomplete` | Enrichment-only filter, and the latest enrichment run did not succeed or is not yet known | `stops` | `stops` | `not-possible` | `broken` | when an enrichment run next succeeds |
| `no-data` | Enrichment-only filter, and no title of the content type holds a value for its field | `stops-until-signed-off` | `asks` | `possible` | `check-data` | when a value appears, or on sign-off |

A sixth property, `mediaPage`, is `warns` for every kind. It is still carried, so the Media page
keeps no rule of its own either.

The executor adds one more broken problem of its own: the automation's own provider is not active.

**S0. Dead code and single loading.**
- Remove `required`, `degraded`/`unavailable`, their executor branches, and the three tests that
  stub them (`automationExecutorSkip.test.ts:182`, `:248`, `:265`).
- Each targeted query is loaded once, inside the provider turn.
- Test: one `getById` per query per run.

**S1. The enrichment outcome by event.**
- System task ids move to `contract/`, used by `ensureSystemJobs`, `systemTaskRunner`, the
  executor's check and the keys of `SYSTEM_TASKS`.
- `run:latest` goes on the bus, and `announceLatestRuns()` reuses `latestStatusOfTask`.
- The `EnrichmentOutcome` holder in `media` listens to both events, and ignores a `run:latest`
  that arrives after a `run:completed`.
- `server/index.ts` resolves the holder, then announces, then seeds the scheduler.
- Tests:
  - booting the real container leaves the holder holding the announced status;
  - the ordering rule;
  - other tasks are ignored.

**S2. The judging function.**
- `readReadinessFacts()` reads the active providers, the held enrichment outcome, and one batched
  lookup of which enrichment fields hold values.
- A pure `findingsFor(facts, filters, contentType, automationProvider?)` returns the table above,
  deduplicated by query, rule, kind and instance.
- Each finding carries its effects (`schedule`, `runNow`, `signOff`, `badge`, `clears`) as data,
  from one kind-to-effects table kept beside the checks.
- A pure `verdictFor(findings, acceptedKeys)` gives an automation's overall answer:
  `{ schedule: 'runs' | 'stopped', runNow: 'runs' | 'asks' | 'stops', findings }`. The executor
  and the automation row read this verdict and branch on nothing else.
  - The sign-offs live in `automations` and are passed in as `acceptedKeys`, so `media` never
    imports `automations`.
- Messages come from one pure formatter in `contract/`.
- Pure tests cover every kind and both classes, F1, F9 and the dedupe. One integration test runs
  against an in-memory database.
- A test-only `findingOf(kind, { queryId, ruleKey, providerId? })` builder reads the production
  kind-to-effects table (decision 8). Consumer tests use only this builder.

**S3. Saved-query health, additively.**
- `findings` is added beside the old `QueryHealth` fields. `list()` reads the facts once.
- `create` rejects a rule that the scope declaration defers.
- The proofs' F2 pin and both F9 pins flip here.

**S4. The Media page.**
- Browse returns `findings` beside `errors`, and `errors` holds only provider failures.
- A warning-styled notice shows both classes. A suspect line carries the sign-off note.
- `noDataErrors` and the per-filter `hasValues` go.

**S5. Blocks, and the executor.**
- **Data:** a new `automation_blocks` table (automation, query, rule key, kind, first seen, accepted
  at). A migration, plus a service in `automations`.
- **The check, at every trigger.** Facts and findings are read inside the provider turn. Then:
  - **every finding whose `schedule` is not `runs`** is reconciled into a block: new ones are
    inserted, ones no longer found are deleted, and each block keeps its finding's `signOff`;
  - the run proceeds only when `verdictFor` says so for this trigger.
- **On a scheduled tick**, a `stopped` verdict skips the task. The skip is recorded only when a
  block first appears.
- **Accepting** a block whose `signOff` is `not-possible` is refused by the server.
- **On Run Now**, the trigger carries the suspect findings the user chose to proceed past. Any
  suspect finding not in that list skips the run, so a stale prompt cannot run on new findings.
- **Removed:** `missingEnrichment`, `enrichmentIsComplete`, the `describe*` helpers and
  `ENRICHMENT_TASK_ID`. `filterReadiness` becomes a required dependency.
- **Flips:**
  - the proofs' F3 case: a Plex actuator with a tag naming an active Radarr instance now runs;
  - the F8 case: with Seerr connected and no Seerr data, a scheduled run is skipped once as
    blocked, and the reason no longer claims the data is still loading.
- `reconcile(previousBlocks, findings)` is pure, and covers every transition in decision 8.
- **Tests:**
  - the transition table, exhaustively, with no database;
  - the executor, fed findings through `findingOf`, with nothing inside the checks stubbed;
  - a block is created and cleared;
  - an accepted block lets the next tick run;
  - Run Now with and without consent;
  - a broken block cannot be accepted, and clears by itself when the next check no longer finds it.

**S6. The automations screen.**
- **Run Now** asks for a preview before running. The existing automation preview gains
  `findings`, and the destructive-count confirmation (`AutomationRow/index.tsx:78`) and the
  suspect "Proceed / Cancel" share one dialog.
- **The automation row** shows its blocks in place of the next run time. Each block shows its
  message, plus "Accept" where `signOff` is `possible`, or its `clears` text where it is not.
- Story first. Tests cover the dialog and accepting a block.

**S7. The query list.**
- The badge comes from each finding's `badge` (**Broken** or **Check data**), followed by the
  findings' messages.
- `healthReasons`, `ISSUE_REASONS` and the old `QueryHealth` fields go, and client fixtures are
  rewritten once.

**S8. Docs and close.**
- As in the first draft's step 7.
- The architecture doc states the accepted limits:
  - one enrichment outcome for the whole run (decision 2);
  - a newly connected Tautulli, Seerr or TMDB is not read for up to 24 hours (F6);
  - Plex and Jellyfin wait for the hourly identity run (F7);
  - a suspect finding cannot tell a failed load from an empty field.
- Delete this file.

### Closure, restated for the final steps

The verdict in "Does it close the original problem?" above stands, with one change. The
symptom "an automation is skipped for a reason no other screen shows" is now closed for every
filter-derived reason:

- a broken finding shows on the query list and the Media page;
- a suspect finding shows there too, and as a block on the automation's own row.

Still visible only in run history: the automation's own provider being inactive, the reach guard,
and a task not being enabled. Each of these is a property of the automation, not of its filters.

---

## Over-engineering review of the redraft

Scope: `docs/intent/filter-readiness.md:663-1149`. I took the redraft's requirements and decisions as given. Evidence labels: **read** means I read the code; **test** means the test ran green. I ran `filterReadiness.proofs.test.ts` and `automationExecutorSkip.test.ts`: 34/34 pass (**test**). I changed nothing in the repo.

### 1. Sign-off is built as a stored state machine over every blocking finding (largest)

**Where:** decision 4 (lines 922-941), decision 7's "every finding that stops a schedule becomes a block" (979-983), decision 8 (985-1016), S5 (1089-1114), S6's block rendering (1120-1121).

**Complexity:**
- A new `automation_blocks` table plus migration and service.
- Every non-`runs` finding is stored as a row on every check, including broken ones that cannot be accepted and clear by themselves.
- A three-state machine (`absent`/`open`/`accepted`), a pure `reconcile` returning `{nextBlocks, skipsToRecord}`, and an exhaustive transition-table test suite.
- Insert/delete churn inside the provider turn.

**Value the spec requires:**
- A suspect finding stops the schedule until a user signs it off, per (automation, query, rule, kind).
- A finding that clears and comes back needs a fresh sign-off.
- The server refuses to accept a broken finding.
- The automation row shows its blocks.
- A skip is recorded once, not on every tick.

**Simpler design:** store only acceptances, and work out everything else.
- **Table:** `automation_signoffs(automation, query, rule_key, kind, accepted_at)`. It holds only what a user did, so it is the one thing that cannot be recomputed.
- **At each check** (the existing spot, `automationExecutor.ts:232-234`, **read**):
  - compute `findingsFor`;
  - delete sign-offs whose key is not among the current findings (this gives "clears then reappears needs a fresh sign-off");
  - run if no finding is left after removing signed-off suspect ones.
  - That is a set difference, the same idea as the delete-then-insert write in `replaceFields` (F5). It needs about three tests, not a transition table.
- **Skip once:** before writing a skip, read the automation's latest run with the existing `listRuns({ automationId, limit: 1 })` (`automationRunService.ts:213-232`, **read**). Skip the write if that run is already a `skipped` row with the same reason. This covers broken and suspect findings alike, and needs no stored "open" state.
- **Row display:**
  - Broken reasons already show on the row as the last run's reason (`AutomationRow/index.tsx:54`, **read**; `recordResult` writes skips into run history, `automationExecutor.ts:519-547`, **read**).
  - With skip-once, that skip stays the latest run, so the reason stays visible.
  - Suspect findings, with their Accept buttons, can be computed live for the automations list: read facts once and judge each automation, the same "facts once for a list" that S3 already builds for `list()` (line 1080).
- **Refusal:** the accept endpoint recomputes the finding and refuses if its class is not suspect.

**Gives up:**
- the `first seen` column;
- broken findings as rows. That partly gives up decision 7's "every finding that stops a schedule becomes a block": broken reasons still show on the row, but as the last skip's reason, not as block rows;
- decision 6's "the blocks table is what a future owner notification reads" (lines 964-966). That reader does not exist yet, and it could read the skip history plus the sign-offs.

Note: the automations list then makes one facts read per request. If that is unacceptable, a fallback is to store only *suspect* blocks (decision 4's own default before decision 7 overrode it). The machine still collapses to a set difference either way.

### 2. The enrichment outcome reaches `media` through an event, a replay, a holder and a startup order

**Where:**
- S1 (lines 1049-1059);
- the startup-order row of "What changes from the first draft" (line 753) and R1 (798-806);
- inherited from 114-141.

**Complexity:**
- a new `run:latest` event;
- `announceLatestRuns()`;
- an `EnrichmentOutcome` singleton;
- the rule "ignore `run:latest` after `run:completed`";
- a required order in `server/index.ts`: resolve the holder, then announce, then seed. The proofs show this order is fragile: F10, singletons subscribe only on first resolve; F11 (**test**/**read**);
- a test that boots the real container;
- an "unknown" window after any startup path that misses the announce.

**Value:** `media` knows whether the latest enrichment run succeeded without reading `automation_runs`, and without a shared kernel store.

**Simpler design:** a port that `media` owns and `automations` implements.
- `media` declares `interface EnrichmentOutcomeSource { latestEnrichmentStatus(): Promise<AutomationRunStatus | undefined> }`.
- `automations` registers an implementation in its cradle that calls `latestStatusOfTask` (`automationRunService.ts:193-202`, **read**). This is the same query the executor runs today (`automationExecutor.ts:372`, **read**).
- `readReadinessFacts()` calls it once per request.

The repo already uses this shape:
- `media` declares a narrow `ActiveTypesSource` slice of `ProviderSettingsService` (`activeFieldSet.ts:85-88,105`, **read**);
- `system` declares `EnrichmentJobFactoryLike` and `media` implements it (`systemTaskRunner.ts:13-23`, `enrichmentJobFactory.ts:4,25`, **read**), sanctioned in `server-architecture-north-star.md:62-70`.

Here the edge is even cleaner. The implementer (`automations`) imports a type from `media`, which is already an allowed direction (`.dependency-cruiser.cjs:29-37`, **read**), so no exception is needed.

**What goes:** the event, the announcer, the holder, the ordering rule, the boot test and the post-restart "unknown" state. The fact is read live, as it is today, so a restart cannot lose it.

**Gives up:**
- push delivery. Each request pays one indexed query, and the request paths already read facts.
- **It reverses recorded decision 2 (lines 303-304) on mechanism.** Its stated aims survive: no module reads another's table, and there is no kernel store. The rejection rationale at lines 138-141 does not address a port. That is your call.

Side effect: `media` no longer needs the enrichment task id. Moving the ids to `contract/` (line 1050) is still good cleanup (F14), but it becomes independent of this plan (as complexity review C8 said).

### 3. Six "effect" properties on every finding, a kind-to-effects table, and a test builder to keep them consistent

**Where:** decision 7 (lines 970-983), decision 8's "Findings are safely mockable" (1005-1016), the table at 1028-1039, S2 (1066-1077).

**Complexity:** each finding carries `schedule`, `runNow`, `signOff`, `badge`, `clears` and `mediaPage`, copied from a per-kind table. On top of that sit:
- a `findingOf` test builder;
- the rule "consumer tests use only this builder";
- one effects test per kind.

The spec's own table shows how little this encodes:
- the six broken kinds have identical values in every effect column;
- `no-data` is the only row that differs;
- `mediaPage` is `warns` for every kind (line 1038).

The table holds one bit of information, broken or suspect, which decision 1 (890-897) already defines.

**Value:** one owner for each finding's consequences, and tests that cannot invent a finding the system would never produce.

**Simpler design:** a finding is `{ kind, queryId, ruleKey, providerId? }`, and one exported `classOf(kind): 'broken' | 'suspect'` sits beside the checks.
- `verdictFor` stays the single owner of the schedule and Run Now consequences.
- The sign-off guard is `classOf(kind) === 'suspect'`.
- The badge label is a two-entry map in `contract/`.
- The `clears` text belongs in the existing message formatter (line 1073), which is already per kind.
- Drop `mediaPage`.

Because the class is derived from the kind and never stored, a test cannot build an inconsistent finding, so the builder and its usage rule are unnecessary. That is the same guarantee as the builder, with nothing to enforce.

**Gives up:** letting kinds within one class diverge on a single effect without a code change. No such divergence exists or is planned.

### 4. Server-side `runNow: 'asks'` in `verdictFor` (small)

**Where:** line 1069 and decision 3.

The server receives the list of suspect findings the user chose to proceed past (line 1099). From its side, Run Now is therefore only "runs" or "stops". "Asks" is a client decision taken from the preview's findings. The verdict can be `{ runs: boolean, findings }` for both triggers, with the consented findings counted as accepted for that run only. This is a small trim.

### Where the complexity is proportionate

- **S0, dead code and loading each query once:** removes code (F12, F13).
- **S3's additive contract:** this is itself a simplification. It stops steps S3 and S7 depending on each other.
- **`no-library`, content-type-scoped supply, `unknown-rule` and deduplication:** each closes a proven correctness gap (F2, F9; hazard H11). Keeping the engine's throw as a backstop costs nothing.
- **`create` rejecting deferred rules:** a single validation that closes F1.
- **Pure `findingsFor` over plain facts:** it is the core of the design, and it is easy to test.
- **The one batched field lookup:** replaces N `hasValues` round trips.
- **Run Now's consented-findings list:** a single list comparison that stops a stale prompt approving new findings.
- **Sharing one dialog with the destructive-count confirmation:** reuses `RunConfirmation` (`AutomationRow/index.tsx:79`, **read**) and the existing `preview` (`automationExecutor.ts:381`, **read**).
- **The message formatter in `contract/`:** one wording without building sentences on the server.
- **Skip-once itself:** cheap under either design. Only the mechanism in item 1 is heavy.

### Suggested simplifications

1. Store only sign-offs, not blocks. Prune them with a set difference at each check, dedupe skips against `listRuns({automationId, limit: 1})`, and compute the row's findings live. Drop the state machine, `reconcile` and the transition-table tests.
2. Replace `run:latest`, `announceLatestRuns`, the `EnrichmentOutcome` holder and the startup ordering with a media-owned `EnrichmentOutcomeSource` port that `automations` implements over `latestStatusOfTask`. This reopens decision 2's mechanism, but not its aims.
3. Replace the six per-finding effect properties and the `findingOf` builder with `classOf(kind)`. Fold `clears` into the formatter and drop `mediaPage`.
4. Make `verdictFor` return `{ runs, findings }` and keep "asks" on the client.
5. Ship moving the task ids to `contract/` as independent cleanup, not as a dependency of readiness.

---

## Hazard review of the redraft

Scope: `docs/intent/filter-readiness.md` lines 663–1149. Wherever the redraft changes direction, I reviewed the last decision it reached: decisions 1–8 (lines 885–1016) and the Final steps S0–S8 (lines 1018–1137).

### Parts that cannot be built as decided

1. **"Unreachable" providers as a broken finding.** Decision 1 (line 892) and decision 4 (line 938) count a provider that is "unreachable" as broken. Nothing in the system records whether a provider can be reached: a provider row holds only `isActive` (`server/database/schema.ts`, the `MetadataProvider` type). S2's facts (lines 1062–1063) do not include reachability, and no kind in the table at lines 1028–1036 covers it. As written, that part gets dropped without anyone noticing (hazard 6).
2. **A preview-first Run Now that carries findings and sign-offs (S6, lines 1117–1119; decision 3, line 913).** The existing preview takes a draft (`providerId`, `taskId`, `queries`), not an automation id (`contract/automations.ts`, `AutomationPreviewInputSchema`). So it cannot look up an automation's sign-offs for `verdictFor`. It also throws in exactly the broken cases, before any finding could be returned (hazard 2).
3. **Several `clears` conditions describe actions that do not exist.** "When the filter is removed from the query" and "when the value changes" (lines 1032–1034) are impossible: queries and automations have no update route (`contract/mediaQueries.ts` has list, create, delete and preview; `contract/automations.ts` has create, updateStatus, delete, preview and run). The only way to make a filter go away is to delete the query, and that is hazard 1.

### Hazards, most harmful first

**1. The only remedy the spec offers for a broken exclude silently removes the exclude, and the automation then acts on what it protected.**
- *Code:* `automation_queries.queryId` is declared `onDelete: 'cascade'` (`server/database/schema.ts:200-202`). No query update route exists (`contract/mediaQueries.ts`). The client does not guard deleting a query that an automation uses (`src/components/QueryRow/index.tsx`). **test:** an automation included all movies and excluded those tagged 1. A run acted on 1 title. I deleted the exclude query; the automation's queries became `['include']`, and the next run acted on 2 titles, including the one the exclude protected.
- *What goes wrong:* `unknown-rule`, `inactive-instance` and `other-instance` tell the user to fix the filter (lines 1032–1034), and S6 shows that text on the automation row (line 1121). The only way to do that is to delete the query. The block then clears by itself, because the check "no longer finds the issue" (line 926; table line 995). The next scheduled tick runs a possibly destructive task with no exclude.
- *Spec needs:* a query used by an automation cannot be deleted, or deleting one an automation excludes disables that automation. Each kind's `clears` text must name an action that actually exists (for example, "delete and recreate the query, then rebuild the automation"). Otherwise S0–S7 must add query editing.

**2. A preview-first Run Now becomes impossible to press exactly when something is broken.**
- *Code:* `executor.preview` runs `planRun` (`automationExecutor.ts:381-389`). That throws on an unknown rule (`mediaQueryEngine.ts:60-61`), on a task that is not enabled (`automationExecutor.ts:419-423`), on a task that is not implemented (`:417`), and whenever a source fetch fails. **test:** the preview rejected with "no longer exists" for an exclude holding a retired rule, and with "not enabled" for a task that is not enabled. When the preview fails, `RunConfirmation` disables the Run button (`src/components/AutomationRow/index.tsx:99,126`).
- *What goes wrong:* S6 puts every Run Now behind this preview. For an unknown rule, a task not enabled, or a source that cannot be reached, the user sees only "Couldn't count the affected items." and cannot start the run. So no skip is recorded and no finding is shown. The findings the preview "gains" are never returned, because the preview throws first. A draft preview also cannot tell which suspect blocks are already accepted.
- *Spec needs:* findings computed before and independently of `planRun`, returned even when the count fails. A preview (or a new procedure) keyed by automation id so sign-offs apply. And Run Now must still be possible, or must show the findings, when the count fails.

**3. "Record the skip only when a block first appears" makes Run Now a silent no-op, and the executor cannot tell Run Now from a tick.**
- *Code:* today every trigger records its own skip. **test:** two `execute` calls on an automation with a persistent broken filter left two `skipped` rows. The `run` procedure answers 202 before any check runs (`automations.procedures.ts:61-69`), and the row then shows "Run triggered" (`AutomationRow/index.tsx:169-177`). Cron and Run Now both call `execute(automationId)` with nothing else (`automationScheduler.ts:28-29`, `automations.procedures.ts:66`). **read.**
- *What goes wrong:* the transition table (lines 992–993) and S5 (lines 1096–1097) record a skip only on `absent → open`. A Run Now press against a block that is already open therefore records nothing, emits no `run:completed`, and reports success. The same happens to a Run Now whose consent list no longer matches (lines 1099–1100). This contradicts the run-history behaviour the closure relies on (lines 1145–1146). It also weakens the harness row "skip record … announced on the bus" (line 714): after the first skip, later runs announce nothing. The spec also never says that `execute`, the `automations.run` contract and the cron callback must start carrying a trigger and the consent list.
- *Spec needs:* Run Now always records its skip, and the deduplication applies to scheduled ticks only. State the new `execute(automationId, trigger)` signature and the `run` input change, and list every caller.

**4. For a non-source actuator, "the instance only needs to be active" lets an exclude that matches nothing pass.**
- *Code:* the engine's gate fails any item whose source instance differs from the one the filter names (`mediaQueryEngine.ts:62-63`). `create` never checks the type of instance a filter value names (`mediaQueryService.ts:214-239`). The pooled catalog contains only `SOURCE_OWNER[contentType]` instances (`mediaSourceFactory.ts:32-35`). **test:** a movie `tagIds` exclude named an *active Sonarr* instance. It saved without error, and `matchItems` returned `[]`. Today the Plex run is skipped. With the readiness answer the redraft would give simulated (stubbed clean health), `deleteFromLibrary` received both `rk-1` and `rk-2`.
- *What goes wrong:* line 748 and the table rows at 1033–1034 raise nothing for an active instance when the actuator is not a source. Fixing F3 therefore turns today's safe skip into a destructive run with no protection. Separately, today's wording names the wrong instance type ("Radarr instance 2" for a Sonarr id; test output), because it takes the type from `rule.providers[0]` (`automationExecutor.ts:131`).
- *Spec needs:* for every actuator, raise a broken finding when the named instance is not an active source of `SOURCE_OWNER[contentType]`. Add a test for this case beside F3's flip. The message formatter must take the instance's type from the instance itself.

**5. A block's identity does not match a finding's identity.**
- *Code:* a query may hold two filters on one rule that name two different instances. **test:** health reported two `not_active` issues, both under `tagIds`. **read:** `no-library` has no rule key (line 1030).
- *What goes wrong:* blocks are keyed by automation, query, rule and kind (lines 940, 986, 1090–1091). Findings are deduplicated by query, rule, kind *and instance* (line 1065). Two findings therefore map to one block, which means either a unique-key conflict or a collapsed block whose `clears` refers to only one instance. A `no-library` block would have a NULL rule key, and SQLite treats NULLs as distinct in a unique index. `findingOf` requires a `ruleKey` (line 1076). The table has no `signOff` column, although each block "keeps its finding's `signOff`" (line 1094).
- *Spec needs:* one key shared by findings and blocks that includes the instance, with a nullable rule key handled explicitly for `no-library`, and the table columns to match.

**6. "Unreachable" is claimed as broken but is never detected.**
- *Code:* a source that cannot be reached makes `planRun` throw, and the run is recorded as `error` (`automationExecutor.ts:262-275`), not as a skip or a block. **read.** An enricher that cannot be reached fails the whole enrichment run, so that case is covered by `data-incomplete` (F4).
- *What goes wrong:* the block list promised in decision 4 (line 938) never shows an unreachable source. The schedule keeps firing error runs.
- *Spec needs:* drop "unreachable" from decisions 1 and 4, or add a fact and a kind for it.

**7. "Behaves like a disabled automation" contradicts "the schedule keeps ticking".**
- *Code:* a disabled automation is unscheduled (`automations.procedures.ts:37-48`), and only active automations are seeded at start (`server/index.ts:53-56`). **read.**
- *What goes wrong:* built by analogy with disabling (line 930), a blocked automation never ticks, its blocks never clear, and a sign-off never takes effect. Decision 5 (lines 943–946) requires the opposite.
- *Spec needs:* remove the analogy at line 930.

**8. Saving after `reconcile` can lose a sign-off.**
- *Code:* turns are serialized per provider only (`automationExecutor.ts:286-294`); nothing serializes them with an API write. **read.**
- *What goes wrong:* "the executor only loads, calls it and saves" (lines 1001–1002). If the save writes `nextBlocks` wholesale, an accept that lands between load and save is reverted to `open`.
- *Spec needs:* save as row-level changes, and accept only a row that still exists and is `open`.

**9. "A provider serving the content type" is defined only for sources.**
- *Code:* `SOURCE_OWNER` maps only Radarr and Sonarr (`server/modules/providers/roles.ts:125-128`). `fieldsByProviderType` has no content type (`activeFieldSet.ts:14-49`). **read.**
- *What goes wrong:* read strictly, lines 749 and 1031 mean every enrichment-only rule raises `no-provider`.
- *Spec needs:* state that enrichers serve every content type, and that only source rules are scoped through `SOURCE_OWNER`.

**10. Smaller inaccuracies.**
- `automationExecutorSkip.test.ts:248` does not stub `required: true`. It stubs a `not_active` qualification issue on an unregistered key, and it is the only pin of how an unregistered key is named. Lines 724–726, 1012–1014 and 1045 are wrong about it; it should be rewritten under `unknown-rule` rather than removed. **read.**
- The status check cited at `automationExecutor.ts:219` (line 956) is at `:228`. **read.**
- `no-data`'s `clears` includes "or on sign-off" (line 1036), but a sign-off moves a block to `accepted`, not `absent` (line 996).

### Load-bearing claims checked and found true

- F2: the unknown-rule throw is at `mediaQueryEngine.ts:59-61`. **read**, and **test** (the preview rejects).
- F3: the engine gate is at `:62-63`, and the Plex actuator is skipped today. **test** (reproduced).
- Automation statuses are `active` and `disabled` (`contract/schemas.ts:146`). **read.**
- Run Now is offered on every row (`src/pages/automations/index.page.tsx:174`; the button is disabled only while loading or while the task list is unknown). **read.**
- The destructive confirmation previews before running (`AutomationRow/index.tsx:78-134`; `:165` treats a task the catalogue no longer describes as destructive). **read.**
- F11: the scheduler is seeded first at startup (`server/index.ts:52-57`). **read.**
- F15: nothing outside tests listens to `run:completed`. **read.**
- F16: `latestStatusOfTask` has one caller (`automationExecutor.ts:372`). **read.**
- Every system run goes through `recordResult`, which emits `run:completed` with its `taskId` (`automationExecutor.ts:201-202, 549-559`). `systemTaskRunner` is reached only through the executor. **read.**
- `media` may import `providers` (`.dependency-cruiser.cjs`, `ALLOWED_TARGETS`), so `SOURCE_OWNER` is reachable from the readiness module. **read.**
- F4/F5: the enrichment job waits on all enrichers with `Promise.all` and writes each title with `replaceFields` (`enrichmentJob.ts:75,106`). **read.**
- Today every trigger records its own skip. **test.**

The temporary test file `server/__tests__/zz-hazard-review.tmp.test.ts` ran green (6 of 6) and has been deleted. `git status` shows only the three untracked files that were there before. Nothing else was changed and nothing was committed.

---

## Decisions taken after the redraft reviews

These come after the over-engineering review and the hazard review of the redraft, both above.
Where they change the redraft's decisions or Final steps, they say which.

9. **Blocks stay stored, one row per blocking fact, and sign-off is a field on the block.** This
   rejects the over-engineering review's first simplification (store only acceptances).
   - A block is a database row, so it persists. A re-check finds blocks that no longer hold and
     deletes them.
   - There is one row per blocking fact. A user can accept one block as known risk and leave the
     others. The automation runs on schedule only once every block is accepted or fixed.
   - Sign-off is a field on the block: the user chose to accept the risk it represents.
   - **What sign-off is for.** Sign-off exists for "no matching data" (the `no-data` finding) where
     the user expects the data to be empty. An example: Seerr is connected before anyone has made a
     request, and an automation excludes requested titles. The intent is to keep future requests
     out, not to say that requests exist today. Only the user knows the difference, so only the
     user can accept it.
   - **Enrichment failure is not stored as a block.** It cannot be signed off. It is reported as a
     block that needs fixing, computed when the check runs, and it clears when enrichment next
     succeeds.
   - Consequences for the redraft:
     - Decision 7's "every finding that stops a schedule becomes a block" changes: findings that
       cannot be signed off are reported as blocks needing a fix, but get no row.
     - Decision 8's transitions apply to stored blocks. Saves are row-level, and an accept updates
       only a row that still exists. This addresses the hazard review's lost-sign-off race.
     - Since only `no-data` blocks are stored, a block's key is automation, query, rule and kind,
       and every stored finding has a rule. This addresses the hazard review's key mismatch.

10. **Fixes taken directly from the hazard review.** Each follows from decisions already made:
    - **Findings come before the count.** Findings are computed before `planRun` and returned
      even when counting fails. Run Now's preview is keyed by automation id, so the automation's
      blocks and sign-offs apply. A failed count no longer hides the findings or disables Run Now.
    - **Run Now always records its outcome.** Only scheduled ticks deduplicate their skip. The
      executor becomes `execute(automationId, { trigger: 'schedule' | 'runNow', consentedFindings? })`.
      The `automations.run` input carries the consent, and both callers change: the scheduler
      callback and the run procedure.
    - **A named instance must be an active source for the query's content type, for every
      actuator.** This is checked against the source owner for that content type, not merely
      "active". A filter naming an active Sonarr instance on a movie query is broken. The message
      takes the instance's type from the instance itself, not from the rule's first provider.
    - **Enrichment providers serve every content type.** Only rules whose providers are sources
      are scoped to the content type's source owner.
    - **"Behaves like a disabled automation" is withdrawn** (decision 4). A blocked automation
      stays scheduled, so its ticks can re-check (decision 5).
    - **"Unreachable" is narrowed.** An unreachable source makes the run fail with an error, which
      is recorded and shown as the last run. An unreachable enricher fails enrichment, which is a
      block needing a fix. No separate reachability fact is added.
    - **Corrections.**
      - `automationExecutorSkip.test.ts:248` pins how an unregistered rule key is named. It is
        rewritten under `unknown-rule`, not removed.
      - The status check is at `automationExecutor.ts:228`.
      - `no-data` clears when a value appears. A sign-off accepts it; it does not clear it.

11. **Only findings that can be signed off are stored, and each has a stable id.**
    - **Every finding that cannot be signed off is reported, never stored.** That is, every broken
      kind: `no-library`, `no-provider`, `unknown-rule`, `inactive-instance`, `other-instance`
      and `data-incomplete`. Each is computed at every check and shown as a block needing a fix.
      This extends decision 9's rule for enrichment failure to every broken kind. The blocks
      table holds only `no-data` rows.
    - **Each finding has a stable id.** It is a deterministic string the readiness module computes
      from the facts that make the finding: its kind, the query, the rule, and the provider ids
      involved. A stored block is keyed by automation and finding id.
    - **Clearing is a set difference.** A re-check produces the current findings. Any stored block
      whose finding id is not among them is fixed and is deleted. A current suspect finding with no
      stored block gets a new row, not yet signed off.
    - **Decided by default, change if wrong:** for `no-data`, the provider ids are the active
      producers of the field. Replacing the Seerr instance, for example, changes the id, so a
      sign-off given against the old instance does not carry over to the new one.

12. **Each consuming system gets one answer. Findings carry no consequences.** This replaces
    decision 7's per-finding effect properties, the "findings and what each one means" table's
    effect columns in Final steps, and decision 8's `findingOf` builder rule. It also supersedes
    the over-engineering review's third simplification and the effect-properties question raised
    after it.
    - **The answer is a fixed set of system states, split by consumer.** The readiness module
      returns the findings plus one property for each system that needs an answer. Each property
      takes one of a fixed set of states:

      | Consumer | Property | States |
      |---|---|---|
      | Scheduled run | `schedule` | `runs`, `blocked` |
      | Run Now | `runNow` | `runs`, `asks` (unaccepted suspect findings), `stops` |
      | Automation row | `blocks` | the findings split into `needsFix`, `awaitingSignOff` and `signedOff` |
      | Query list | `queryList` | `clear`, `checkData`, `broken` |
      | Media page | `mediaPage` | `clear`, `warns` |

    - **Two contexts, two answers.** A filter list on its own (a saved query, or the Media page's
      URL filters) is answered with `findings`, `queryList` and `mediaPage`. An automation, with
      its stored blocks and the trigger, is answered with `findings`, `schedule`, `runNow` and
      `blocks`.
    - **A finding is plain data:** stable id, kind, query, rule (when it has one), provider ids,
      message and what clears it. Whether a kind can be signed off is the readiness module's own
      rule, used to build the answers. No consumer reads it.
    - **Testing.** The functions that build the answers are pure, and are tested exhaustively
      against findings built by kind. A consumer's test supplies only its own property's state,
      for example a Run Now test given `runNow: 'asks'`. So no consumer test can depend on a rule
      it does not own.

13. **The enrichment result reaches `media` through an interface it declares.** This replaces the
    first draft's decision 2 (lines 303-304) on mechanism, and its section "`media` learns the
    enrichment run's outcome from events" (lines 114-141). That decision's aims stand: no module
    reads another module's tables, and there is no shared store in the kernel.
    - `media` declares `EnrichmentOutcomeSource { latestEnrichmentStatus() }`. `automations`
      implements it over `latestStatusOfTask` and registers the implementation in its cradle.
      Reading the facts calls it once per request.
    - Precedents: `media`'s `ActiveTypesSource` (`activeFieldSet.ts:85-88`), and `system`'s
      `EnrichmentJobFactoryLike`, which `media` implements (`systemTaskRunner.ts:13-23`). Both are
      sanctioned by `server-architecture-north-star.md:62-70`. `automations` may already import
      `media` (`.dependency-cruiser.cjs:29-37`).
    - What goes: `run:latest`, `announceLatestRuns`, the `EnrichmentOutcome` holder, the startup
      ordering rule and its boot test, and the window after a restart when the result is unknown.
    - Moving the system task ids into `contract/` leaves this plan. It is independent cleanup.

14. **A query an automation uses cannot be deleted. The database enforces it.**
    - `automation_queries.queryId` changes from `onDelete: 'cascade'` to `onDelete: 'restrict'`
      (`server/database/schema.ts:200-202`). The migration rebuilds the table, following the
      precedent of `0005_nullable_automation_fks.sql` and `0012_media_enrichment_canonical.sql`.
    - `MediaQueryService.delete` turns the constraint failure into a `ConflictError`, the kind
      already raised for a Run Now on a running automation (`automations.procedures.ts:64`). The
      query row shows its message.
    - Deleting an automation still cascades to its query links.
    - Ways to help the user through this are future enhancements, not this plan. Examples: listing
      the automations that use a query, or unlinking a query from an automation.

### Final steps, after the redraft reviews

These replace "### Final steps" and "Redrafted steps" above. Each step leaves `yarn ci:fast` green
and the regression harness passing. T3 and T6 also run `yarn depcruise:ci`. UI steps follow the
repo rule: story first, then in place.

**The findings.** A finding is plain data: stable id, kind, query, rule (when it has one), provider
ids, message, and what clears it (decision 12). Sign-off and storage follow decisions 9 and 11.

| Kind | Raised when | Can be signed off, so stored |
|---|---|---|
| `no-library` | No active source serves the query's content type, with or without filters | no |
| `no-provider` | No active, offered provider can supply the rule. Source rules are scoped to the content type's source owner; enrichers serve every content type. This includes a rule only a deferred type produces. | no |
| `unknown-rule` | The filter names a rule that is not registered | no |
| `inactive-instance` | A filter value names an instance that is not an active source of the content type's source owner. This applies to every actuator, and to a query on its own. | no |
| `other-instance` | The automation's provider is a source, and a filter value names a different instance | no |
| `data-incomplete` | Enrichment-only filter, and the latest enrichment run did not succeed | no |
| `no-data` | Enrichment-only filter, and no title of the content type holds a value for its field | **yes** |

**T0. A query an automation uses cannot be deleted** (decision 14).
- Migration, the `ConflictError` mapping, and the message on the query row.
- Test: the hazard review's case becomes the regression test. An automation including all movies
  and excluding tagged ones: the exclude query's delete is refused, the automation keeps both
  queries, and the next run still protects the tagged title.

**T1. Dead code and single loading.**
- Remove `required`, `degraded`/`unavailable` and their executor branches.
- Remove the two tests that stub `required: true` states (`automationExecutorSkip.test.ts:182`,
  `:265`). The test at `:248` stays until T6 rewrites it under `unknown-rule`.
- Each targeted query is loaded once, inside the provider turn.
- Test: one `getById` per query per run.

**T2. The readiness module in `media`.**
- `readReadinessFacts()` reads:
  - the active providers;
  - the enrichment result through `EnrichmentOutcomeSource` (decision 13);
  - one batched lookup of which enrichment fields hold values.
- A pure `findingsFor(facts, filters, contentType, automationProvider?)` returns the findings in
  the table, deduplicated by stable id.
- Two pure answer builders (decision 12):
  - `filterAnswer(findings)` returns `{ queryList, mediaPage }`;
  - `automationAnswer(findings, storedBlocks, trigger, consentedFindings?)` returns
    `{ schedule, runNow, blocks }`.
- Messages come from one formatter in `contract/`. It takes an instance's type from the instance.
- Tests, pure and exhaustive:
  - every kind;
  - every answer state for every consumer;
  - each case in "What changes from the first draft" above;
  - a movie query naming an active Sonarr instance is `inactive-instance`.
- One integration test runs `readReadinessFacts` against an in-memory database.

**T3. `automations` implements `EnrichmentOutcomeSource`** over `latestStatusOfTask`, registered in
its cradle. Test: it reports the latest status of the enrichment task.

**T4. Saved-query health, additively.**
- `findings` and `queryList` are added beside the old `QueryHealth` fields. `list()` reads the
  facts once.
- `create` rejects a rule that the scope declaration defers.
- The proofs' F2 pin and both F9 pins flip here.

**T5. The Media page.**
- Browse returns `findings` and `mediaPage` beside `errors`, and `errors` holds only provider
  failures.
- A warning-styled notice shows the findings. A `no-data` line says that an automation relying
  on this filter needs it signed off for its schedule to run.
- `noDataErrors` and the per-filter `hasValues` go.

**T6. Blocks and the executor.**
- **Table.** `automation_blocks`: automation, finding id, query, rule key, kind, provider ids,
  first seen, signed off at. Unique on (automation, finding id). It cascades when the automation
  is deleted. It holds `no-data` rows only (decision 11).
- **Trigger.** `execute(automationId, { trigger, consentedFindings? })`. The scheduler callback,
  the `run` procedure and the `automations.run` input change with it.
- **The check, inside the provider turn:**
  - read the facts and the findings;
  - reconcile the stored blocks row by row: insert new `no-data` findings, and delete stored
    blocks whose id is no longer found;
  - build `automationAnswer`.
- **Scheduled tick.** `schedule: 'blocked'` skips the task. The skip is recorded only when the
  automation's latest run is not already a skip with the same reason.
- **Run Now.** `runNow: 'stops'` (a broken finding, or a suspect finding not in the consent)
  always records its skip.
- **Removed:** `missingEnrichment`, `enrichmentIsComplete`, the `describe*` helpers and
  `ENRICHMENT_TASK_ID`. The readiness module becomes a required dependency.
- **Flips:**
  - the proofs' F3 case: a Plex actuator with a tag naming an active Radarr instance now runs;
  - the F8 case: with Seerr connected and no Seerr data, a scheduled run is blocked until sign-off,
    and the reason no longer claims the data is loading;
  - `automationExecutorSkip.test.ts:248` is rewritten under `unknown-rule`.
- **Tests:**
  - a block is inserted, and deleted when its finding goes;
  - a signed-off block lets the next tick run, and an unsigned one does not;
  - a block that clears and comes back is a new, unsigned block;
  - Run Now with consent, without consent, and with a consent made stale by a new finding;
  - a Run Now against a blocked automation records its skip;
  - an accept that lands for a block the check has just deleted changes nothing.

**T7. The automations screen.**
- **Preview by automation id.** It returns the automation's answer and findings *before* the
  count. A failed count is shown as such, but does not hide the findings or disable Run Now.
- **One dialog for Run Now.** The destructive-count confirmation (`AutomationRow/index.tsx:78`)
  and the suspect "Proceed / Cancel" share it. Proceed sends the consented finding ids.
- **The row shows `blocks`.**
  - "Needs fix" lines carry their message and what clears them.
  - "Awaiting sign-off" lines carry Accept.
  - "Signed off" lines are listed too, so accepted risk stays visible.
- **Accept** updates an existing stored block only. Otherwise it answers with a conflict.
- Story first. Tests cover the dialog, accepting, and a failed count.

**T8. The query list.**
- The badge shows the `queryList` answer: **Broken** or **Check data**, followed by the findings'
  messages.
- `healthReasons`, `ISSUE_REASONS` and the old `QueryHealth` fields go, and client fixtures are
  rewritten once.

**T9. Docs and close.**
- As in the first draft's step 7.
- The architecture doc states the accepted limits:
  - one enrichment result for the whole run (decision 2);
  - a newly connected Tautulli, Seerr or TMDB is not read for up to 24 hours (F6);
  - Plex and Jellyfin wait for the hourly identity run (F7);
  - `no-data` cannot tell a failed load from an empty field, which is why only the user can sign
    it off;
  - an unreachable source shows as a failed run, not as a block.
- Delete this file.

### Closure, final

The problem: four sources answer "what's wrong with these filters?", each with its own rules and
its own wording, and they contradict each other.

- **One mechanism, one wording.** T2 is the only place a finding is raised, worded or given a
  consequence. Every consumer reads its own answer from it, and none keeps a rule.
- **The query list and the Media page agree.** Both read `filterAnswer` over the same findings.
- **No automation is skipped for a filter reason no screen shows.** Every filter finding appears
  on the query list, the Media page, and as a block on the automation's row. Shown only as the last
  run: the automation's own provider being inactive, the reach guard, a task not being enabled, and
  an unreachable source. Each of these is a property of the automation or of a live call, not of
  its filters.
- **The dead pieces** go: `required`, the triple loading, the enrichment check's silent
  switch-off, the per-filter lookups, and `MediaError.provider` holding a rule label.
- **Beyond the problem statement, the reviews proved two safety defects the plan also closes.**
  - A deleted exclude query silently widened destructive automations (T0).
  - A non-source actuator was refused whenever a filter named a source instance (T6), and the
    fix is guarded so that it does not let an exclude that matches nothing pass (T2).

**Verdict: closed.** The single source has stated limits (T9), and the architecture doc must
carry them, so that "one place" is not read as "complete".
