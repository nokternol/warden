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
- the latest enrichment run's status, through `EnrichmentOutcomeSource`, an interface `media` declares
  and `automations` implements over its run history
  ([`server/modules/automations/enrichmentOutcome.ts`](ref:path:server/modules/automations/enrichmentOutcome.ts));
- in one query, which enrichment fields hold a value for at least one title of each content type
  ([`EnrichmentQueries.fieldsWithValues`](ref:path:server/modules/media/enrichment/enrichment.queries.ts)).

`findingsFor(facts, filterList, automationProvider?)` is pure. The query list judges every saved query
against one read of the facts. The Media page judges its URL filters, which have no query id. The
executor judges each targeted query with the automation's provider, inside the provider turn, so a long
wait cannot leave it judging stale facts.

The run history belongs to `automations`, and no module reads another's tables. `automations` may
import `media`, so the port adds no dependency direction, and the outcome is read live, so a restart
cannot lose it.

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
| `other-instance` | The automation's provider is a source, and a filter value names a different source instance, which matches nothing in that automation's own catalog. |
| `data-incomplete` | An enrichment-only filter, and the latest enrichment run did not succeed or none has finished. |
| `no-data` | An enrichment-only filter, and no title of the content type holds a value for its field. |

Findings are deduplicated by id, so two filters naming the same missing instance say it once.

## One answer per consumer

Two pure functions turn findings into what each consumer does. Only `no-data` can be signed off. The
system cannot tell an empty field from a failed load, and only the user knows the field is empty on
purpose, for example Seerr connected before anyone has made a request. That rule lives in the readiness
module; no consumer reads it.

- `filterAnswer(findings)`: the query list shows `clear`, `checkData` (every finding can be signed off)
  or `broken`, and the Media page `clear` or `warns`.
- `automationAnswer(findings, signedOffIds, consentedIds)`: the schedule `runs` or is `blocked`; Run Now
  `runs`, `asks` (a finding awaits sign-off that the user has not chosen to proceed past) or `stops`;
  and the findings split into needs-fix, awaiting sign-off and signed off.

| Consumer | What it does |
|---|---|
| Query list ([`QueryRow`](ref:path:src/components/QueryRow/index.tsx)) | A **Broken** or **Check data** badge, then each finding's message and what clears it. |
| Media page ([`ReadinessNotice`](ref:path:src/components/ReadinessNotice/index.tsx)) | A warning-styled notice beside the results. The red source-failure alert holds only providers that could not be read. |
| Scheduled run ([`AutomationExecutor`](ref:path:server/modules/automations/automationExecutor.ts)) | Runs only when every finding is fixed or signed off. A blocked schedule keeps ticking to re-check, and records its skip once while the reason is unchanged. |
| Run Now | Always records its outcome. Runs past the findings awaiting sign-off that the user chose to proceed past, for that run only; a finding not named stops it, so a stale prompt cannot approve a new finding. |
| Automation row ([`AutomationRow`](ref:path:src/components/AutomationRow/index.tsx)) | Lists needs-fix lines with what clears them, awaiting sign-off lines with Accept, and signed-off lines, so accepted risk stays visible. Run Now checks first through `automations.readiness`, which answers the findings before the target count, so a failed count cannot hide them or stop the run being started. |

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

- **One enrichment outcome for the whole run.** The enrichment job awaits every enricher and writes
  nothing if one fails, so an unreachable Seerr stops every automation that uses any enrichment-only
  filter until enrichment next succeeds. Attributing a failure to one provider would need a write that
  keeps a failed provider's earlier values, because a title's write deletes the fields it does not
  repeat.
- **A newly connected Tautulli, Seerr or TMDB is not read for up to a day.** Titles enriched within the
  last 24 hours are not re-read when a provider is connected, and the latest run still reads as a
  success.
- **Plex and Jellyfin wait for the hourly identity run.** Linking a title to a newly connected server
  clears its enrichment timestamp, but only once identity resolution has run.
- **`no-data` cannot tell a failed load from an empty field**, which is why only the user can sign it
  off.
- **An unreachable source shows as a failed run**, not as a finding: nothing records whether a provider
  can be reached until a run tries.
- **Some reasons a run stops belong to the automation, not its filters**, and show only as its last run:
  the automation's own provider being inactive, the reach guard, and a task that is not enabled.
- **Findings are refetched with the screen**, not pushed when an enrichment run completes.
