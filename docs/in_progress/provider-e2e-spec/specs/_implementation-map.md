---
type: wayfinder-implementation-map
label: wayfinder:implementation-map
status: open
---

# Provider E2E Spec — Implementation Map

Tracks building the 12 specs in this directory against real code. The specs themselves
(`plex.md`, `jellyfin.md`, ..., `_precedence.md`, `_automation-parameters.md`) are the finished
output of the closed [provider-e2e-spec wayfinder map](../map.md) — this file is a separate
tracker for the "implement it" phase that map's Destination explicitly deferred.

## Front matter convention

Every spec in this directory carries:

```yaml
---
type: wayfinder-spec
label: wayfinder:spec
provider: <name>              # matches the file name; _-prefixed for cross-provider specs
status: draft | implementing | implemented
source_ticket: <path>         # the wayfinder decision ticket this spec was written from
source_research: <path>       # optional; the research ticket behind source_ticket, if any
---
```

`status` is the per-file source of truth for where that spec is in the implementation
lifecycle:

- **`draft`** — spec is finished and reviewed, nothing built against it yet.
- **`implementing`** — an implementation branch and PR are in flight. Find them in the tracker
  table below (frontmatter doesn't carry a branch/PR field — that's tracked centrally here so
  it's not duplicated 12 times).
- **`implemented`** — the PR merged. The spec's content is done; per this repo's docs
  convention (`docs/in_progress/` is deleted once its phase ships), the `docs-lifecycle` skill
  should fold it into `docs/architecture/` and delete it from here, rather than leaving a stale
  `implemented` flag sitting in `in_progress/`.

## Workflow for implementing a spec

1. Branch from `main`: `git checkout main && git pull && git checkout -b <branch>`.
2. Flip that spec's frontmatter `status` to `implementing`, commit, push, open a PR against
   `main`. Fill in the tracker row below with the branch and PR link.
3. The PR description is the report of what was done — update it as work lands rather than
   narrating progress elsewhere. No separate summary doc.
4. Drive the actual build via the `plan-and-go:tdd-engineer` agent persona: spawn it directly
   with `Agent(subagent_type: "plan-and-go:tdd-engineer")`, pointed at the spec file and this
   implementation map. That agent definition (`~/.claude/skills/plan-and-go/agents/tdd-engineer.md`)
   is governance only — phase discipline, mismatch protocol, working-tree discipline — it does
   NOT contain the actual RED/GREEN/REFACTOR process. For that, the spawned agent must **read
   directly with the Read tool**, not invoke the Skill tool:
   `~/.claude/skills/plan-and-go/skills/tdd/SKILL.md` (Atomic Cycle Rule, output format) and its
   `references/` (`phases.md`, `red-phase.md`, `green-phase.md`, `refactor-phase.md`,
   `extracting-steps.md`). Do NOT have it invoke `Skill(skill: "plan-and-go:tdd")` — that skill's
   own header says it's "executed by the `plan-and-go:tdd-engineer` agent," which triggers a
   nested agent spawn even from inside an agent that already *is* that persona. Reading the
   files directly gets the same process content with no spawn mechanism involved.
5. On merge: flip `status` to `implemented`, update the tracker row, and hand off to
   `docs-lifecycle` to move the spec into `docs/architecture/`.

## Tracker

| Spec | Status | Branch | PR |
|---|---|---|---|
| [plex](plex.md) | implementing | `implement/plex-provider-spec` | [#46](https://github.com/nokternol/warden/pull/46) |
| [jellyfin](jellyfin.md) | implementing | `implement/jellyfin-provider-spec` | [#48](https://github.com/nokternol/warden/pull/48) |
| [radarr](radarr.md) | implementing | `implement/radarr-provider-spec` | [#49](https://github.com/nokternol/warden/pull/49) (merged) |
| [sonarr](sonarr.md) | implementing | `implement/sonarr-provider-spec` | [#50](https://github.com/nokternol/warden/pull/50) (merged) |
| [tautulli](tautulli.md) | draft | — | — |
| [overseerr](overseerr.md) | draft | — | — |
| [seerr](seerr.md) | draft | — | — |
| [tmdb](tmdb.md) | draft | — | — |
| [omdb](omdb.md) | draft | — | — |
| [tvmaze](tvmaze.md) | draft | — | — |
| [_automation-parameters](_automation-parameters.md) | draft | — | — |
| [_precedence](_precedence.md) | draft | — | — |

`_automation-parameters` and `_precedence` are cross-cutting; implement them alongside whichever
provider spec first needs the mechanism or precedence rule they define, not standalone.

**Plex is partially done, still `implementing`.** [#46](https://github.com/nokternol/warden/pull/46)
merged every field in its filter-type-mapping table except `genres`/`certification`: the
enrichment pipeline has no mechanism today to keep Radarr/Sonarr's construction-time value from
being overwritten by Plex's enrichment-stored one, so wiring Plex as a producer for those two
fields now would regress existing behavior rather than extend it. Blocked on `_precedence`'s
implementation landing precedence-ordering machinery first — revisit `plex.md`'s `genres`/
`certification` rows once that ships.

**Radarr is partially done, still `implementing`.** [#49](https://github.com/nokternol/warden/pull/49)
(merged) left `runtime`→`runtimeMinutes` and `studio` unwired for the same reason: both are
already-live `EnrichmentFields` keys with Plex as sole current producer, and wiring Radarr in now
would make it a second, uncoordinated producer with no precedence ordering. Also blocked on
`_precedence`'s implementation — revisit `radarr.md`'s `runtime`/`studio` rows once that ships.

**Sonarr is partially done, still `implementing`.** [#50](https://github.com/nokternol/warden/pull/50)
(merged) left `moveSeries`/`changeLanguageProfile` unwired — both need a single-select task
parameter `AutomationBuilder` has no UI for yet (mirrors Radarr's `moveMovie`, same gap). Blocked
on `tickets/11-automation-task-parameters.md`'s implementation, not `_precedence` — no Sonarr
field collided with an already-enriched single-producer field this time. The `getLanguageProfiles()`
lookup shipped; only the two task actions wait — revisit once `_automation-parameters.md` ships.
