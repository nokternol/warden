# MediaQueryEngine: the one evaluation of the catalog

Every part of Warden that reads the catalog asks one question: which titles do these conditions
select? The Media page asks it to list titles, a saved query's preview asks it to count them, and an
automation asks it to decide what a run, its preview and its Run Now check act on.
[`MediaQueryEngine.select`](ref:path:server/modules/media/mediaQueryEngine.ts) answers it, and nothing
else answers it another way (north-star belief 8).

## Input: `Conditions`

`select(copies, conditions)` takes the copies to judge (a content type's `copies` from one
[`libraryCache.contentOf`](ref:path:server/modules/media/libraryCache.ts) read) and the `Conditions`:

- `contentType`: picks the rule set, which an evaluation over no copies still needs.
- `include`: the filters of each included query, one `Filter[]` per query.
- `exclude`: the filters of each excluded query, the same shape.

Callers build them from saved queries by role (an automation's included and excluded queries), or from
the Media page's URL filters (`include: [filters]`, `exclude: []`). A `Filter` is `{ ruleKey, value }`,
the encoding a saved query stores.

## Answer: `SelectedTitle[]`

One `SelectedTitle` per selected title, in the order its first copy appears in the given copies:

- `mediaIdentityId`: the title group the catalog refresh recorded.
- `copies`: every copy of the title among the given copies, in the given order.
- `met`: the copies that alone meet every filter of an included query the title meets. It may be
  empty, and it serves only to choose which copy represents the title on the Media page. It never
  decides whether a title is selected or what a run acts on.

## What "meets" means

The rule is north-star belief 3: a title is every edition of it everywhere, and each condition is
judged on the title as a whole. It is the same for included and excluded queries.

- A title meets a filter when any of its copies satisfies it. A value naming an instance
  (`providerId` set) is satisfied only by that instance's copy.
- A title meets a query when it meets every filter of it; different filters may be met by different
  copies. "Tagged X in instance B AND has no file" is met by a title whose B copy carries the tag
  and whose A copy has no file.
- A title is selected when it meets at least one included query and no excluded query.
  `include: []` selects nothing; a query with no filters (`[[]]`) is met by every title.

Belief 3 names the problem this rule leaves unsolved, on purpose: when a title's editions are in
different states (one has a file, another has none), the title can meet conditions that contradict
each other, and an automation cannot reliably act on one edition's state. Treating editions
separately is a later requirement; `select` does not attempt it.

## Rules resolved once

Each filter becomes a test of one copy, its rule looked up in the
[`ruleRegistry`](ref:path:server/modules/media/ruleRegistry.ts) once per evaluation, before any copy
is read. A filter naming a rule that no longer exists throws `ValidationError`, even over no copies:
treating it as met would widen an include, and treating it as unmet would widen through an exclude.

`select` is synchronous, owns no data and reads nothing else: each copy already carries its
normalised record and its title's facts from the library cache.

## Callers

| Caller | Conditions | Reads from the answer |
|---|---|---|
| Media page (`browse` in [`media.procedures.ts`](ref:path:server/modules/media/media.procedures.ts)) | the URL filters as one included query | one row per selected title, placed and shown by its first `met` copy in the requested sort, or its first copy in that sort when `met` is empty; `sourceCount`/`sourceProviderIds` from all `copies` |
| Query preview ([`mediaQueries.procedures.ts`](ref:path:server/modules/mediaQueries/mediaQueries.procedures.ts)) | the saved query's filters as one included query | the number of selected titles |
| Run planning ([`automationExecutor.ts`](ref:path:server/modules/automations/automationExecutor.ts)) | the automation's included and excluded queries, over every active instance's copies | what the actuator acts on (below); the preview and the Run Now check count the same |

Each caller keeps the `records` of the `contentOf` read it evaluated, so every answer says how current
the copy was (belief 6).

## What a run acts on

An automation acts only in its own service, so per-instance targeting is the choice of actuator, not a
condition:

- A catalog-owning actuator (Radarr, Sonarr) acts on its own instance's copies of the selected titles,
  including a title selected only through another instance's copy: one target per copy, one actuator
  id per native id.
- Any other actuator (Plex, Jellyfin, Tautulli) acts on every id the selected titles are linked to in
  its media server, drops titles not linked, and records one target per title (its first copy). The
  link model holds one media-server id per title, which departs from belief 3 ("an action acts on
  every copy of it the acting service holds") when a media server holds several editions of a title;
  the fracture ledger records it.

## Registration

`mediaQueryEngine` is registered as a singleton in
[`media.registrations.ts`](ref:path:server/modules/media/media.registrations.ts) and injected into the
Media page procedures, the query procedures and the automation executor, each of which requires it.
The media index exports it as a type only: nothing outside the container constructs it.
