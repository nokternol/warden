# Filter readiness

One mechanism answers "can this filter list be trusted to select the titles it describes?" for every
screen and for the automation executor. It raises every finding, words it once, and states what each
consumer does with it. Consumers keep no rules of their own.

## Why it exists

Every screen that shows a filter list, and the executor before it runs one, needs the same answer.
Saved-query health, the Media page's "no data" warning, the executor's pre-run check and the query
list's reasons all read it from here, so a query cannot show healthy on one screen while another warns
about it, and an automation is never skipped for a reason no screen shows. Two safety rules hold
here:

- A Plex, Jellyfin or Tautulli automation is not refused because a filter names a source instance: the
  engine matches such a filter on the pooled catalog by each title's own source instance.
- A query an automation uses cannot be deleted, so an exclude can never drop out from under a
  destructive task and widen what it acts on. The database refuses that delete: the
  `automation_queries.queryId` foreign key restricts it
  ([`server/database/schema.ts`](ref:path:server/database/schema.ts)), and the query row shows why.

## Facts read once, judged in memory

[`FilterReadiness.readFacts()`](ref:path:server/modules/media/filterReadiness.ts) reads, once per
request:

- every provider instance and whether it is active, through a narrow slice of `ProviderSettingsService`;
- the library copy's active providers and refresh records
  ([`LibraryCache`](ref:path:server/modules/media/libraryCache.ts)), as every feature reads them.
  Readiness does not judge refresh records itself: whether a fact's reporters can be relied on is
  `reporterReliability`'s answer over the copy, the one a destructive run's gate reads too.

`findingsFor(facts, filterList)` is pure. The query list judges every saved query against one read of
the facts. The Media page judges its URL filters, which have no query id. The executor judges each
query an automation targets, inside the provider turn, so a long wait cannot leave it judging stale
facts. A filter list is judged the same whichever automation uses it: under north-star belief 3 a
value naming any active source instance is a valid condition for every actuator, since it selects
titles that each actuator then acts on in its own service.

## The findings

Each finding is plain data: a stable id built from its kind, query, rule and provider instances, the
kind, the query and rule when it has them, the provider ids, a message and what clears it. The wording
is one pure function shared by server and client,
[`describeFinding`](ref:path:contract/readiness.ts). Provider types are named by the server's catalogue
labels, and an instance by its own type, so a deleted instance reads "Provider instance N".

| Kind | Raised when |
|---|---|
| `no-library` | No active source owns the content type, with or without filters. It replaces `no-provider` for a rule that source would supply, so the cause is said once. |
| `no-provider` | No active, offered supplier of what the rule reads (`suppliersOf`): the content type's source for a catalog fact, the fact's reporters for a reported fact. A catalog-fact rule depends on the source alone, so it never raises this: `no-library` says the source is missing. A rule only a deferred provider type reports always raises it, and saving such a query is refused. |
| `unknown-rule` | A stored filter names a rule that is no longer registered. The engine's own throw stays as a backstop. |
| `inactive-instance` | A filter value names an instance that is not an active source of the content type: inactive, deleted, or active but of the wrong type (a Sonarr tag on a movie query). This applies to every actuator. |
| `data-incomplete` | A reported-fact filter none of whose active reporters can be relied on: each one's latest `facts` refresh failed or never ran, or, for a reporter matched through a media server's links, that server's `links` refresh did. Read from `reporterReliability`, the one answer a destructive run's gate also reads, so the two cannot disagree; one failed reporter beside a good one raises nothing. Names the reporters. Informational (below). |
| `no-data` | No longer raised. Warden believes a supplier's successful refresh, so a fact no title holds is the truth (north-star belief 6). The kind and the sign-off path it fed remain in the code, unreachable. |

Findings are deduplicated by id, so two filters naming the same missing instance say it once.

## One answer per consumer

Two pure functions turn findings into what each consumer does. Informational findings
(`INFORMATIONAL_KINDS` in [`contract/readiness.ts`](ref:path:contract/readiness.ts), today only
`data-incomplete`) say how complete the data is, not that a filter cannot work: both functions ignore
them, so they never stop a schedule or Run Now and leave the query list and the Media page clear.
Screens show them only through the copy's "As of" line, which names the provider. Only `no-data` can be
signed off, and it is no longer raised.

- `filterAnswer(findings)`: the query list shows `clear`, `checkData` (every finding can be signed off)
  or `broken`, and the Media page `clear` or `warns`.
- `automationAnswer(findings, signedOffIds, consentedIds)`: the schedule `runs` or is `blocked`; Run Now
  `runs`, `asks` (a finding awaits sign-off that the user has not chosen to proceed past) or `stops`;
  and the findings split into needs-fix, awaiting sign-off and signed off.

| Consumer | What it does |
|---|---|
| Query list ([`QueryRow`](ref:path:src/components/QueryRow/index.tsx)) | A **Broken** or **Check data** badge, then each finding's message and what clears it. |
| Media page ([`ReadinessNotice`](ref:path:src/components/ReadinessNotice/index.tsx)) | A warning-styled notice beside the results, leaving out informational findings. The copy's "As of" line, above it, names providers that failed or never refreshed. |
| Scheduled run ([`AutomationExecutor`](ref:path:server/modules/automations/automationExecutor.ts)) | Runs only when every finding is fixed or signed off. A blocked schedule keeps ticking to re-check, and records its skip once while the reason is unchanged. |
| Run Now | Always records its outcome. Runs past the findings awaiting sign-off that the user chose to proceed past, for that run only; a finding not named stops it, so a stale prompt cannot approve a new finding. |
| Automation row ([`AutomationRow`](ref:path:src/components/AutomationRow/index.tsx)) | Lists needs-fix lines with what clears them, awaiting sign-off lines with Accept, and signed-off lines, so accepted risk stays visible. Run Now checks first through `automations.readiness` when the check opens or is retried; it counts from the library copy as it stands and answers the findings before the target count, so a failed count cannot hide them or stop the run being started. Until that read answers nothing is confirmable, and a failed read shows no earlier answer. |

The executor adds one problem of its own: the automation's provider is not active.

## Sign-offs are stored

[`AutomationBlockService`](ref:path:server/modules/automations/automationBlockService.ts) keeps one
`automation_blocks` row per automation and `no-data` finding id. Each check reconciles the rows: it
inserts new findings and deletes those it no longer finds, row by row, so a sign-off landing during a
check is never overwritten. A finding that clears and comes back is a new row and needs a new sign-off.
The suppliers' instance ids are part of the finding's id, so a sign-off given while one Seerr instance
supplied the field does not carry over to its replacement. Accepting a row that the latest check
deleted, or one already signed off, answers 409.

## Accepted limits

The answer is one place, not a complete one. These are known and not checked:

- **An unreachable source shows through its refresh record**, not as a finding: the "As of" line names
  it, and a destructive run depending on it skips.
- **Some reasons a run stops belong to the automation, not its filters**: the automation's own provider
  being inactive, the reach guard, a provider a destructive run depends on that failed or was never
  read, or a fact it filters on that no refreshed provider supplies, and a task that is not enabled. They are not findings and cannot be signed off. The first
  three are also listed among
  the readiness check's problems, so Run Now says the run will be skipped; a task that is not enabled
  shows as a failed count and as the run's outcome.
- **Findings are refetched with the screen**, not pushed when a refresh completes.
