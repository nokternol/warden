---
name: docs-lifecycle
description: "Move docs between the intent/, in_progress/, and architecture/ pots correctly — write fresh architecture content, never git-mv-and-retense — while docs/north-star/ (the owner's target design) stays fixed and every doc is measured against it. Use when closing an in_progress phase, promoting a shipped intent design, hitting a code/doc contradiction, closing a fracture-ledger entry to Healed, relocating/renaming/deleting a file or symbol that any doc references, changing the behavior of a file that any doc's ref:path: links to, or landing any change that might incidentally solve a docs/intent/ doc's stated problem."
---

# Docs lifecycle

One fixed target, then three pots, mutually exclusive by status — never describe a built thing as intent:
- **north-star** (`docs/north-star/`) — the owner's target design. Not a pot: nothing moves in or out
  of it, and this skill never edits it. Every other doc is measured against it.
- **intent** — aspirational, unbuilt, may be thin.
- **in_progress** — staged plan, adjusted as it executes.
- **architecture** — Explanation prose (why it exists, why built this way, decisions baked in),
  code-only `ref:path:`/`ref:label:` links, never doc-to-doc.

## The north star is never brought up to date

Architecture docs follow the code; the north star does not. When code and a north-star doc disagree,
the code is wrong, whichever changed last.

- **Never edit `docs/north-star/`** while closing a pot, healing a fracture, fixing a stale link or
  following a relocation trigger. A relocation trigger that hits a north-star doc (a path it cites
  moved) is reported to the owner, not fixed. Only the owner's explicit decision about the target
  changes it.
- **Writing architecture content for code that departs from the north star:** describe what the code
  does, and say plainly that it departs, citing the north-star statement. Add or update the fracture
  ledger's Open entry for the departure. Never write the departure as the design, and never write a
  rationale that defends it.
- **Healing a fracture means moving toward the north star.** Before flipping an entry to Healed,
  check the healed shape against the relevant north-star doc. A heal whose shape contradicts it
  (it unified two mechanisms by picking the one the north star rules out) is not healed: it stays
  Open and the contradiction goes to the owner.
- **A plan, intent doc or in_progress doc that contradicts the north star** is raised at the
  checkpoint below, not built or promoted.

## Closing a pot

1. Contradiction between shipped code and the doc, beyond "not written up yet"? Stop → checkpoint below.
2. Write the new architecture content first, citing real code.
3. `git rm` the source (or trim, per checkpoint). Never delete before step 2 exists.
4. Fracture-ledger entry for this, now healed? Flip to Healed, strip *every* linker edge — code or doc,
   `ref:path:` and `ref:label:` alike. Healed is historical narrative, not current-fact graph content.
5. `graphify update .` → `link_doc_to_code.py --apply` on touched docs. Zero dangling `ref:path:` links.
   Skip the LLM semantic-extraction pass.

## Checkpoint — ask the user, never resolve solo

(a) bad plan → delete. (b) real remaining scope → reframe/trim to it. (c) code drifted from plan → new
`in_progress` phase + Open fracture-ledger entry. (d) code, plan or doc contradicts the north star →
Open fracture-ledger entry citing the north-star statement; the fix moves toward the north star, or
the owner changes the north star. Never resolved by editing the north star or by documenting the
contradiction as design. If the north star is silent or ambiguous rather than contradicted, ask per
`CLAUDE.md`'s *When work meets the north star*.

## Keeping a linked doc's content honest, not just its links

A resolvable `ref:path:`/`ref:label:` is not proof a doc is accurate — the target can still exist while
the behavior it describes changed underneath it. A valid-but-stale link is *worse* than a dangling one:
the dangling-link check catches broken paths, nothing catches a link that still resolves over wrong
prose. Two triggers, both required, both cheap per-change:

- **Relocating, renaming, or deleting** a file or symbol: `grep -rl <old-path-or-symbol> docs/` across
  *every* pot, not just the docs this change's plan already names as related. Fix or triage every hit.
- **Editing a file's behavior without moving it**: `grep -rl <path> docs/architecture/`; if any doc
  `ref:path:`-links to it, re-read that doc's surrounding prose against your change, not just confirm
  the link still resolves.

Skipping either is how a doc-you-forgot-was-related silently goes stale, one change at a time, across
every phase that doesn't check — which is what a full audit later has to find the expensive way.

## Pruning `docs/intent/` — solved is not the same as done

`docs/intent/` is the input queue for future `in_progress/` plans. A stale entry isn't harmless — it
reads as "still worth picking up" to whoever browses the folder next, wasting their attention or getting
rebuilt. An intent doc's problem can be solved without that doc ever being "implemented" as its own
phase — a differently-scoped change can incidentally close it. When closing any phase, check whether it
solved an *unrelated* intent doc's stated problem too, and delete that doc if so — don't wait for it to
be the thing you're explicitly promoting. (Precedent: `filter-ui.md` said "delete when Phase 4 ships" in
its own header; Phase 4 shipped; nobody deleted it until an explicit spring-clean caught it.)

## Rules

- No "superseded by X" stubs — narrate history inside the new architecture doc instead.
- Only `fracture-ledger.md`, only while Open, may cite intent/in_progress docs. This means *any* mention
  of a `docs/intent/`/`docs/in_progress/` path, not just a linked one — a plain-text cross-reference
  ("see `docs/intent/x.md` for why") still makes an architecture doc's meaning lean on unshaped,
  mutable content, and still goes stale silently when that doc moves or is deleted (verified: this
  happened — an architecture doc cited an intent doc by name after that doc had already been deleted).
  Check it mechanically: `grep -n 'docs/intent/\|docs/in_progress/' docs/architecture/*.md` — zero hits
  outside `fracture-ledger.md`'s Healed entries (which cite unlinked, as historical narrative of a pot
  the subject doc *used to* live in, never as a pointer to consult).
- `VOCABULARY.md` trends code-only too; not enforced here.
