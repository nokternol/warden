# Claude Instructions

## Process hygiene

Always stop any server or dev process you start before ending your response. This includes:

- `yarn dev` (Next.js)
- `yarn ladle` (Ladle component server)
- `npx tsx server/index.ts` (Express server)
- Any other long-running process started during the session

Use `pkill -f "<process pattern>"` or track the PID at start and kill it explicitly. Do not leave background processes running — the user will find stale `yarn dev` or `yarn ladle` instances after every session otherwise.

## Writing: comments, commits, PRs

Everything written into the repo must be **durable**: useful to a future reader who has none of the session's context. Each artifact describes its own subject, and nothing about the session that produced it.

- **Code comments** describe the code: what it does, why, and its constraints. Change language ("changed from…", "now we…", "fixed so that…") doesn't belong here, because once the change merges the comment is narrating a past that the reader can't see.
- **Commits & PR bodies** describe the change they contain: what changed and why — What / Why / Changes / Testing. Change language ("X now requires sign-in") is correct here, since a commit *is* a change. What's excluded is the session's process: attempts, mistakes fixed along the way, "first… then…", RED/GREEN/REFACTOR steps, cycle-by-cycle evolution, or review back-and-forth.

## UI changes

Ladle story first, then in-place. (1) Create/update the component's `.stories.tsx`; `yarn ladle serve` + `playwright-cli` to iterate in isolation. (2) Then `yarn dev` + `playwright-cli` to verify in context. Don't skip the story step for non-trivial component work.

## Docs convention

| Directory | What it means | How to treat it |
|---|---|---|
| `docs/in_progress/` | Active implementation plans | Read as current intent. Deleted when the phase ships. |
| `docs/intent/` | Unbuilt architectural decisions | Read as future state, not current fact. Moved to `docs/architecture/` when implemented. |
| `docs/architecture/` | Implemented patterns | Read as current fact. |

**Do not treat `docs/intent/` or `docs/in_progress/` as descriptions of what is built.** When implementing something described in either folder, update the doc status as part of completion — delete `in_progress` files, move `intent` files to `docs/architecture/`.

**`docs/intent/` is the input queue for future `in_progress/` plans — stale entries are dead weight, not harmless.** An intent doc whose stated problem gets solved (whether by the phase meant to solve it, or incidentally by unrelated work) must be deleted, not left marked done — every doc still sitting in `docs/intent/` reads as "still worth picking up" to whoever browses it next, and a solved-but-not-deleted entry wastes their attention or, worse, gets built again. When a change lands, check whether it happens to have solved an existing intent doc's problem even if that wasn't the doc being implemented — this bit a real doc in this repo (`filter-ui.md` said "delete when Phase 4 ships" in its own header, Phase 4 shipped, nobody deleted it).

**`docs/architecture/` staying "current fact" is an ongoing duty, not a one-time promotion.** A resolvable `ref:path:`/`ref:label:` link is not proof a doc is accurate — the target can still exist while the behavior it describes changed underneath it, and a valid-but-stale link is worse than a dangling one because nothing flags it as suspect. Two triggers, both required:
- **Relocating, renaming, or deleting** a file or symbol: `grep -rl <old-path-or-symbol> docs/` and fix or triage every hit, not just the docs the change's own plan already names as related.
- **Editing the behavior of a file** without moving it: `grep -rl <path> docs/architecture/`; if any doc links to it via `ref:path:`, re-read that doc's surrounding prose against your change, not just its link target.

Skipping either is how a doc silently goes stale one change at a time. Use the `docs-lifecycle` skill for the mechanics.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- `docs/architecture/` facts are edge-linked to the code they cite — querying a file/symbol can surface the doc explaining *why* it's built that way, which grep cannot. A truncated or code-only result doesn't mean no doc exists: before concluding, narrow the query (name the file/symbol directly, or `graphify explain "<concept>"`) rather than falling back to grep on the first pass.
- **After writing or editing a `docs/architecture/` doc (including a brand-new one), the correct update is `graphify update .` (plain CLI, AST-only) then `link_doc_to_code.py --apply` — nothing else is needed.** `.md` files have their own deterministic, no-LLM AST extractor (`extract_markdown`) that produces the file + heading nodes `link_doc_to_code.py` resolves `ref:` edges against; `graphify update .` picks these up on every run, same as code. `link_doc_to_code.py` takes a path **relative to the repo root** (e.g. `docs/architecture/foo.md`) — every node's `source_file` is stored relative, so an absolute path silently matches nothing and misreports "not ingested yet."
- **Do not run graphify's incremental LLM semantic-extraction pass** (`/graphify --update`'s subagent dispatch for doc/paper/image files, i.e. the `plan-with-graph`/`update.md` flow's Part B + `build_merge`) just to get a doc linked — it is not needed for `ref:` resolution (see above) and is the risky, non-durable path regardless: re-confirmed 2026-07-05 after three prior sessions hit the same thing, `build_merge` cannot reliably fold new semantic nodes back into an existing `graph.json` without dropping unrelated files' previously-extracted nodes, so that token spend does not survive to the next session — see `link_doc_to_code.py`'s module docstring for the full history (fixing it inside graphify was tried and rejected). Only reach for that pass if you deliberately want the extra concept/rationale/hyperedge nodes it produces, and accept they may not survive the next incremental update.
