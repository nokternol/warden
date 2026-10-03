---
type: wayfinder-spec
label: wayfinder:spec
provider: _automation-parameters
status: draft
source_ticket: docs/in_progress/provider-e2e-spec/tickets/11-automation-task-parameters.md
---

# Automation task parameters — E2E spec

`AutomationBuilder` has no UI for task parameters today, even though four already-wired tasks
require one (`addToCollection`, `changeQualityProfile`, `addTag`, `removeTag`) — those tasks
cannot actually be selected as a working automation until this ships. This spec covers the general
mechanism; individual provider specs (`jellyfin.md`, `radarr.md`, `sonarr.md`, `overseerr.md`)
declare which shape each of their tasks uses.

## Parameter shape

`ActuatorTaskParameter` (`server/modules/providers/roles.ts`) grows a discriminated `type`:

```ts
type ActuatorTaskParameter =
  | { type: 'select'; label: string; source: ParameterOptionsSource }
  | { type: 'text'; label: string }
  | { type: 'fields'; label: string; fields: ActuatorTaskSubField[] };

type ParameterOptionsSource = 'qualityProfiles' | 'rootFolders' | 'collections' | 'languageProfiles';

interface ActuatorTaskSubField {
  key: string; // property name in the stored JSON object
  label: string;
  type: 'select' | 'text' | 'enum' | 'boolean';
  source?: ParameterOptionsSource; // required when type: 'select'
  options?: { value: string; label: string }[]; // required when type: 'enum'
}
```

`select` and `fields`-with-`select`-subfields both resolve their option list from the same fixed
set of sources — a task never needs a source outside this set today. `enum` carries its own
small, task-declared option list inline (no fetch — e.g. Override status's `status` field).

## Options routes

Four new routes on `contract/providers.ts (implemented in `server/modules/providers/providers.procedures.ts`)`, following the existing
`getTasks`/`getMetadata` convention: no id param, one instance-keyed array covering every
configured instance of the relevant provider type.

| Route | Backing method | Providers |
|---|---|---|
| `GET /api/providers/quality-profiles` | `getProfiles()` | Radarr, Sonarr |
| `GET /api/providers/root-folders` | `getRootFolders()` | Radarr, Sonarr |
| `GET /api/providers/language-profiles` | new `getLanguageProfiles()` | Sonarr |
| `GET /api/providers/collections` | new method | Jellyfin |

Response shape: `[{ providerId: number, options: { value: string; label: string }[] }]`.
`source` names on `ActuatorTaskParameter` map 1:1 to these four routes via a small static
client-side table — adding a task that reuses an existing source needs no client change.

## Storage

`automations.taskParameter` (existing `TEXT` column, no schema change) holds:

- a plain string for `select` and `text` parameters,
- `JSON.stringify({ ... })`, keyed by each sub-field's `key`, for `fields` parameters.

`ActuatorTask.run(ids, parameterValue?: string)` keeps its existing single-optional-string
signature; each task's own runner decides whether to `JSON.parse` it. `requireParameter()` is
unchanged.

`CreateAutomationInput` (`src/hooks/useAutomations.ts`) gains `taskParameter?: string` to actually
carry the collected value from `AutomationBuilder` through to the create-automation request — this
field is currently missing client-side despite the DB column already existing.

## `AutomationBuilder` UI

Renders generically off `parameter.type` — no per-taskId branching:

- `select` → single dropdown, options fetched from `source`'s route, filtered to the selected
  task's `providerId`.
- `text` → a textarea.
- `fields` → one form section, one control per sub-field (dropdown/textarea/select/checkbox per
  sub-field `type`), submitted together as one JSON object.

Selecting a task with a `parameter` blocks submit until every required value is filled, same as
the existing `canSubmit` gating for name/query/schedule.

## Per-task parameter shapes (this map's frontier)

| Task | Provider | Shape |
|---|---|---|
| `addToCollection` | Jellyfin | `select`, source: `collections` |
| `removeFromCollection` | Jellyfin | `select`, source: `collections` |
| `changeQualityProfile` | Radarr, Sonarr | `select`, source: `qualityProfiles` |
| `addTag` / `removeTag` | Radarr, Sonarr | `select`, source: not in this table — existing tag id space, no new route (tags already listed elsewhere in each provider's spec) |
| `moveMovie` | Radarr | `select`, source: `rootFolders` |
| `moveSeries` | Sonarr | `select`, source: `rootFolders` |
| `changeLanguageProfile` | Sonarr | `select`, source: `languageProfiles` |
| `Update request` | Overseerr | `fields`: `qualityProfile` (`select`, source: `qualityProfiles`), `rootFolder`/`languageProfile`/`server` (`select`, provider-specific option lists — see Known limitation below) |
| `Add issue comment` | Overseerr | `text` |
| `Override media availability status` | Overseerr | `fields`: `status` (`enum`, fixed `MediaInfo.status` vocabulary), `is4k` (`boolean`, optional) |

## Known limitation: `Update request` season selection

`MediaRequest.seasons` is inherently per-request (different shows/requests have different season
counts) — a single automation runs against many matched items, so a season value chosen once at
automation-creation time can only be coherent if it means the same thing for every matched item.
"All seasons" is the only value that satisfies that; "some specific seasons" is not expressible
without a value computed per matched item, which this spec does not design (see
`docs/intent/dynamic-per-item-automation-parameters.md`).

**Decision:** `Update request`'s parameter has no season sub-field. The task always requests all
seasons; there is no UI control for it, and no stored value represents it. Real per-season
selection via automation is out of scope until per-item dynamic parameter values exist.

## Sequencing

This ticket's decision unblocks the parameter UI referenced (but not designed) in `02-jellyfin-ui`,
`03-radarr-ui`, `04-sonarr-ui`, and `06-overseerr-ui`. Building it — the schema/route/client work
described above — is implementation, not further spec work; per the map's scope, that happens in a
later `/tdd` or `/plan-and-go` effort, not in this ticket.
