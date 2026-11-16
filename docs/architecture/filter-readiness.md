# Filter readiness

One mechanism answers "can this filter list be trusted to select the titles it describes?" for every
screen and for the automation executor. It raises every finding, words it once, and states what each
consumer does with it. Consumers keep no rules of their own.

## Why it exists

Four places used to answer that question, each with its own rules and wording: saved-query health, the
Media page's "no data" warning, the executor's pre-run check, and the query list's client-side reasons.
They contradicted each other. A query showed healthy while the Media page warned about it. An
automation was skipped for a reason no other screen showed. The Media page's warning travelled as a
provider failure named after a rule. Reviews of the unified design also found two safety defects, both
now closed here:

- A Plex, Jellyfin or Tautulli automation was refused whenever a filter named a source instance, though
  the engine matches such a filter on the pooled catalog by each title's own source instance.
- Deleting a query an automation used silently dropped it from the automation, so a dropped exclude
  widened what a destructive task acted on. The database now refuses that delete: the
  `automation_queries.queryId` foreign key restricts it
  ([`server/database/schema.ts`](ref:path:server/database/schema.ts)), and the query row shows why.

## Facts read once, judged in memory

[`FilterReadiness.readFacts()`](ref:path:server/modules/media/filterReadiness.ts) reads, once per
request:

- every provider instance and whether it is active, through a narrow slice of `ProviderSettingsService`;
- every enricher's `facts` refresh record: when its facts were last read, and whether the latest
  attempt failed, read from the library copy
  ([`LibraryCache`](ref:path:server/modules/media/libraryCache.ts)), as every feature reads it.

`findingsFor(facts, filterList, automationProvider?)` is pure. The query list judges every saved query
against one read of the facts. The Media page judges its URL filters, which have no query id. The
executor judges each targeted query with the automation's provider, inside the provider turn, so a long
wait cannot leave it judging stale facts.

## The findings

Each finding is plain data: a stable id built from its kind, query, rule and provider instances, the
kind, the query and rule when it has them, the provider ids, a message and what clears it. The wording
is one pure function shared by server and client,
[`describeFinding`](ref:path:contract/readiness.ts). Provider types are named by the server's catalogue
labels, and an instance by its own type, so a deleted instance reads "Provider instance N".

| Kind | Raised when |
|---|---|
| `no-library` | No active source owns the content type, with or without filters. It replaces `no-provider` for a rule that source would supply, so the cause is said once. |
| `no-provider` | No active, offered provider can supply the rule. A source supplies only the content type it owns (`SOURCE_OWNER`); enrichers serve every content type. A rule only a deferred provider type produces always raises it, and saving such a query is refused. |
| `unknown-rule` | A stored filter names a rule that is no longer registered. The engine's own throw stays as a backstop. |
| `inactive-instance` | A filter value names an instance that is not an active source of the content type: inactive, deleted, or active but of the wrong type (a Sonarr tag on a movie query). This applies to every actuator. |
| `other-instance` | The automation's provider is a source, and a filter value in an included query names a different source instance, which matches nothing in that automation's own catalog. An excluded query may name any active source instance: it protects titles through every instance's copies. |
| `data-incomplete` | An enrichment-only filter, and an active supplier's latest `facts` refresh failed or never ran. Names those suppliers. Informational (below). |
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
The producers' instance ids are part of the finding's id, so a sign-off given while one Seerr instance
supplied the field does not carry over to its replacement. Accepting a row that the latest check
deleted, or one already signed off, answers 409.

## Accepted limits

The answer is one place, not a complete one. These are known and not checked:

- **An unreachable source shows through its refresh record**, not as a finding: the "As of" line names
  it, and a destructive run depending on it skips.
- **Some reasons a run stops belong to the automation, not its filters**: the automation's own provider
  being inactive, the reach guard, a provider a destructive run depends on that failed or never
  refreshed, and a task that is not enabled. They are not findings and cannot be signed off. The first
  three are also listed among
  the readiness check's problems, so Run Now says the run will be skipped; a task that is not enabled
  shows as a failed count and as the run's outcome.
- **Findings are refetched with the screen**, not pushed when a refresh completes.
