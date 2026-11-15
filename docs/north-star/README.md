# North star — the owner's purpose and intent

The documents in this folder are the target every change moves toward. They state why Warden exists
and what it is for: its purpose, the owner's intent, the beliefs the design rests on, and the
constraints it must keep. They never describe how Warden is built, which is what
`docs/architecture/` is for. They are the fact that plans, diagnoses, specs, reviews and builds
align on: a review finding is fixed by the shape that keeps these beliefs.

## How they differ from the other docs

| Folder | Says | Changes when |
|---|---|---|
| `docs/north-star/` | What Warden is meant to be | Only when the owner decides the target itself changes |
| `docs/architecture/` | What the code does now, and why | Whenever the code changes |
| `docs/intent/`, `docs/in_progress/` | Unbuilt ideas and active plans | As plans are made and shipped |

When they disagree, this folder wins. Code or an architecture doc that contradicts a north-star doc
is a **departure**: a defect, recorded in the fracture ledger's Open section, and fixed by moving the
code toward the target.

## Rules

- **Only the owner changes these documents.** No change, plan, review or diagnosis edits them as a
  side effect of its work, including to "bring them up to date" with code. Code moving away from a
  north-star doc never makes the doc stale; it makes the code wrong.
- **A fracture closes only toward the north star.** A fix that removes a symptom by moving the code
  further from these documents opens a new fracture, however tidy it looks, and is rejected.
- **Where the north star is silent, stop and ask.** If a change needs a design decision these
  documents don't make, the owner makes it, and it is written here by the owner's decision before
  anything is built on it.
- **Departures are named, not absorbed.** An architecture doc describing code that departs from the
  target says so explicitly, citing the north-star statement it departs from. It never presents the
  departure as the design.

- **No architecture here.** Module layout, file names, jobs, tables and patterns belong in
  `docs/architecture/`. A north-star statement says what must hold and why; the architecture says
  how the code holds it, and can change freely as long as the north star still holds.

## Contents

- [`purpose.md`](purpose.md): why Warden exists, the nine beliefs its design rests on, and the
  constraints it keeps. Approved by the owner 2026-11-15.
