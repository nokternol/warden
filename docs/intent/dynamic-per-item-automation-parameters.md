# Dynamic per-item automation task parameters

**Status:** INTENT — not yet designed. Surfaced while deciding
the automation task-parameter design (`ProviderTaskParameter`); not part of that design's scope.

## The problem

Every automation task parameter designed so far is chosen once at automation-creation time and
applied uniformly to every item the automation's query matches (a quality profile, a root folder,
a fixed status enum). There is no mechanism for a parameter value that instead needs to be
*computed per matched item* at run time — read from the item's own data rather than picked once
by the user in `AutomationBuilder`.

Seerr's `Update request` task is the concrete case that exposed this: `MediaRequest.seasons`
is inherently per-request (different shows have different season counts, different existing
requested-season sets). A single automation runs against many matched items, so "update to seasons
3 and 4" chosen once at creation time is only correct for whichever matched items happen to already
be in that state — it's silently wrong for every other matched item. The only season value that's
coherent as a single creation-time choice is "all seasons," which is why
the task-parameter design hardcodes `Update request`'s season selection to "all" with no UI
control at all, rather than exposing a chooser that would misbehave per item.

## Why it matters

This isn't unique to Seerr — any future task whose "correct" parameter value legitimately
varies by which item it's acting on will hit the same wall. Building the task-parameter design's
static mechanism without at least naming this gap risks it being rediscovered (and re-litigated)
the next time a task like this comes up, or worse, worked around ad hoc per-task instead of once,
generally.

## The shape of the fix (not designed — open questions)

- What does a "computed from the matched item" parameter value even reference? A field on the
  matched item (e.g. "whichever seasons are missing," "the item's own genre")? An expression
  language? A fixed set of per-task "placeholders" the task's own runner interprets (e.g.
  `$MISSING_SEASONS` resolved just before calling the provider API for that specific item)?
- Does this live in the same `ActuatorTaskParameter`/`taskParameter` mechanism
  the task-parameter design establishes (a new `type: 'dynamic'` or a placeholder value inside an
  existing `select`/`fields` shape), or is it a genuinely separate mechanism layered on top?
- Where does resolution happen — at automation-run time, per matched item, before `run()` is
  called with each item's own resolved `parameterValue`? `ActuatorTask.run(ids, parameterValue?)`
  today takes one `parameterValue` for the whole batch of `ids` — a per-item mechanism likely means
  `run()` (or its caller) needs to resolve a different value per id, not one shared value across
  the batch.

## Known concrete motivating case

- Seerr `Update request`'s season selection — see the task-parameter design's "Known
  limitation" section for the current static-only workaround.
