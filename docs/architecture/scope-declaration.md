# Scope declaration and the provider-type catalogue

Warden keeps deferred features in the codebase, compiled and tested, but exposes none of them. One
declaration decides what is deferred, and every surface that could expose a deferred thing consults it.
Un-deferring something means removing one entry from that declaration.

## The declaration

[`contract/scope.ts`](ref:path:contract/scope.ts) exports `scope: Scope`. It lives in the contract
because both sides of the API depend on the contract, so either side can consult it. It lists three
kinds of deferred things:

- **`providerTypes`** — provider types that cannot be configured: `SEERR`, `TMDB`, `OMDB`, `TVMAZE`.
  The request manager is offered under its current type name, `OVERSEERR`, while `SEERR` (same API,
  but `ProviderFactory` cannot build it) stays deferred.
- **`rules`** — rule keys that are never served: `certification` (a multi-value rule with no lookup,
  so it has no control) and `tmdbStatus` (produced only by TMDB).
- **`tasks`** — provider tasks not offered for enablement or automation, each named by provider type
  and task id, because task ids are unique only within a type. None are deferred today.

The declaration covers provider types, rules and tasks. Pages, navigation items and API procedures
are not part of it.

The questions are asked through three functions beside the declaration: `isOfferedProviderType(declared,
type)`, `isOfferedRule(declared, ruleKey)` and `isOfferedTask(declared, providerType, taskId)`. Each
takes the declaration as an argument, so the server can be handed a different one under test.

## Who consults it

The kernel container registers the declaration as `scope`
([`server/kernel/container.ts`](ref:path:server/kernel/container.ts)). Procedures and services read it
from their cradle, never by importing it:

- **Provider types.** [`providers.procedures.ts`](ref:path:server/modules/providers/providers.procedures.ts)
  serves only offered types from `GET /api/providers/types`. Provider create and the connection test
  (`GET /api/providers/test`) both answer 400 for a deferred type, before anything is stored or any
  connection is attempted. A row of a deferred type stored earlier still lists, but nothing in the API
  creates one.
- **Rules.** [`media.rules.procedures.ts`](ref:path:server/modules/media/media.rules.procedures.ts)
  serves a rule only if the declaration does not defer it *and* it has a *live producer*: one of its
  `providers` is configured, active, and of an offered type. A deferred type is never a producer.
- **Tasks.** `GET /api/providers/tasks` leaves out deferred tasks. That projection is the only source
  the provider card's task toggles and the automation builder read. A deferred task is also refused on
  write: a provider update whose `settings.enabledTasks` names one answers 400, and
  [`AutomationService.create`](ref:path:server/modules/automations/automationService.ts) rejects one
  even if it was enabled before it was deferred.

The `rules` list decides: a listed rule is not served, and removing its entry serves it once it has a
live producer. [`ruleScope.test.ts`](ref:path:server/__tests__/modules/media/ruleScope.test.ts) keeps
the list complete, equal to exactly the set of rules with no control or no offered producer, so it is
a checked inventory too: un-deferring TMDB fails that test until `tmdbStatus` is removed from the list.

The probe itself, `probeConnection` ([`connectionProbe.ts`](ref:path:server/modules/providers/connectionProbe.ts)),
still knows every type. Its SEERR and TVMAZE cases are tested against the probe directly
([`connectionProbe.test.ts`](ref:path:server/__tests__/modules/providers/connectionProbe.test.ts)), so
the deferred code stays covered while no route reaches it.

## The provider-type catalogue

[`providerCatalogue.ts`](ref:path:server/modules/providers/providerCatalogue.ts) describes every
`MetadataProviderType` once: its `label`, the `apiPath` appended to the host the user enters, the
`defaultUrl` of a hosted service, and its `filterData`: short phrases saying what it makes filterable.
It `satisfies` a `Record` keyed by type, so a type without an entry fails to compile, while each entry
keeps its own shape: `ProviderFactory.createTvMaze` reads TVmaze's `defaultUrl` as a guaranteed string.
Its insertion order is the display order. The connection probe reads `apiPath` from it.

A stored provider URL is the host the user enters with the type's `apiPath` appended.
[`contract/providerUrl.ts`](ref:path:contract/providerUrl.ts) holds that join, `apiUrlOf`, and its
inverse, `hostOf`. The connection probe, the add-provider form and the provider card all use them.

`GET /api/providers/types` projects the catalogue through the contract's `ProviderTypeDescriptorSchema`
([`contract/providers.ts`](ref:path:contract/providers.ts)), filtered to offered types. The client holds
no copy. [`useProviderTypes`](ref:path:src/hooks/useProviderTypes.ts) fetches the projection, and
`descriptorFor` looks a type up in it:

- [`AddProviderForm`](ref:path:src/components/AddProviderForm/index.tsx) offers exactly the served
  types by label, starts on the first, appends the chosen type's `apiPath` on save, and fills in and
  locks a `defaultUrl`. While the types load, or when none are served, it says so and disables Save.
- [`ProviderCard`](ref:path:src/components/ProviderCard/index.tsx) shows its type's label and
  filter data, and round-trips the host through `apiPath` when editing. A row of a deferred type gets
  no descriptor: it shows its raw type and no filter data.
- The Providers page ([`src/pages/settings/index.page.tsx`](ref:path:src/pages/settings/index.page.tsx))
  groups configured providers in the served order. The media page
  ([`src/pages/media/index.page.tsx`](ref:path:src/pages/media/index.page.tsx)) names a source's owner
  by its served label.

## What this does not cover

- **An automation saved before its task was deferred still runs.** The executor checks enablement,
  not the declaration.
- **Query health still reports deferred producers.** A query's provider status lists every type in a
  rule's `providers`, deferred ones included.
- **Per-type form fields stay on the client.** The Jellyfin user-id field, and the type icons, are
  still keyed by type name in the components.
