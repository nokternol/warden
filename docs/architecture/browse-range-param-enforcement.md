# EnrichmentFields field-completeness and browse-path range-param coverage: compiler-enforced, not hand-maintained

**Status:** AS-BUILT (current fact). Adding a key to `EnrichmentFields`
(`server/modules/media/mediaFieldProvider.ts`) touches up to six other places before
it's actually usable end to end — and every one of those six was, until this doc's own
history, a silent-drop failure: a missing entry compiled fine and the field just quietly
didn't work (persist, appear on the domain shape, be filterable, or reach the browse
URL/UI). All six are now compiler-enforced. Two failure classes:

**A. Does the field reach *anything* at all** — `activeFieldSet.ts` (does some provider
declare it as producible), `movie.ts`/`series.ts` (does the domain shape carry it),
`enrichmentJob.ts` (does the job actually persist it), `filterRegistry.ts` (does *any*
rule read it, not just a range one). All four now fail to compile if a new field is
missing.

**B. If the field is exposed as a range-`dataType` rule, does it reach the browse URL
contract** — a `{ruleKey}Gte`/`{ruleKey}Lte` (or renamed-alias) pair wired through five
separate hand-authored maps before it's reachable via `GET /api/media/movies|series` or
the client UI's URL params. This is a strict subset of A (only range rules need it) and
is documented in detail below.

## Class A: does the field reach anything at all

**`activeFieldSet.ts`'s `fieldsByProviderType`** declares which providers produce which
fields. A `Record<_UncoveredField, never>` check (`_UncoveredField` = every
`EnrichmentFields` key not present in the union of all declared providers' field lists)
fails to compile if a field has no producer anywhere — unreachable, since nothing would
ever populate it.

**`movie.ts`/`series.ts`'s `NormalizedMovie`/`NormalizedSeries`** used to hand-pick a subset
of `EnrichmentFields` via `Pick<EnrichmentFields, 'tags' | 'playCount' | ...>` — a union
that compiled fine even with a field silently missing from it (`Pick` only constrains
the *listed* keys to be real ones; it doesn't require the list to be complete). Since no
field is actually movie-only or series-only within `EnrichmentFields` today (that
distinction lives in `sourceProviders`/`contentTypes` instead), both interfaces now
simply extend `Partial<EnrichmentFields>` directly — not a check, a simplification that
removes the maintenance burden rather than gating it.

**`EnrichmentJob.run`'s write path** (`server/modules/media/enrichmentJob.ts`) writes a
resolved value per `EnrichmentFields` key on every pass. The `values` object literal is
now typed against `EnrichmentWriteValues = { [K in EnrichableField]: EnrichmentFields[K] | null }`
(`EnrichableField` — `Exclude<keyof EnrichmentFields, 'tags'>` — already existed in
`enrichment/enricher.ts`). A new `EnrichmentFields` key that isn't `tags` now fails to
compile here until the write side adds it — previously `plexAddedAt` shipped to every
other touch point but this one, and nothing caught it because tests insert enrichment
rows directly, bypassing the job.

**`filterRegistry.ts`'s `MEDIA_RULES`** — a `MediaRule` predicate reads an
`EnrichmentFields` key without TypeScript being able to introspect that fact from the
function body, so each field-backed rule now declares it explicitly via
`sourceField?: keyof EnrichmentFields` (e.g. `plexAddedDaysAgo`'s rule sets
`sourceField: 'plexAddedAt'`). `_FieldWithNoRule = Exclude<keyof EnrichmentFields,
_DeclaredSourceField>` (`_DeclaredSourceField` extracted from every rule's declared
`sourceField` across `MEDIA_RULES`) then fails to compile if a field is missing from
every rule's declaration — enriched, stored, and merged onto the item, but never
filterable, would previously compile clean.

**`enrichmentMerge.ts`'s copy-through, closed by a storage shape change, not a type
check.** This was the one Class A gap that stayed open after the other four: the
per-field `if (enr.X !== null) item.X = enr.X;` lines were runtime logic no additive
type check could police. It closed anyway, as a side effect of
[the EAV rewrite](ref:path:docs/architecture/media-enrichment-eav-model.md) — once
storage only ever holds a row for a field that's actually present,
`enrichmentMerge.ts` reads back an object shaped exactly like `EnrichmentFields` and
applies it with one generic `Object.assign(item, fields)`. There's no longer a
per-field line to omit, so there's nothing left to enforce.

## Class B: browse-path range-param coverage

A range-`dataType` rule in `MEDIA_RULES` needs a `{ruleKey}Gte`/`{ruleKey}Lte` (or
renamed-alias) pair wired through five separate hand-authored maps before it's actually
reachable via the browse endpoints (`GET /api/media/movies|series`) or the client UI's
URL params:

**The browse-path range-param translators** — `sharedFilterFields`,
`MoviesBrowseQuerySchema`/`SeriesBrowseQuerySchema` (zod, the browse procedures' input in
`contract/media.ts`), `MOVIE_PARAM_TO_KEY`/`SERIES_PARAM_TO_KEY`
(server, `media.procedures.ts`), and the client's `BROWSE_PARAM_BINDINGS`
(`src/lib/mediaQueryAdapters.ts`) — each need an entry for every range rule. None of
these param names equal the registry rule key 1:1: the browse URL contract is a
deliberately-renamed legacy vocabulary (`radarrImdbRatingGte` for `imdbRating`,
`sonarrRatingGte` for `communityRating`, `yearMin`/`yearMax` instead of `Gte`/`Lte` —
see the fracture ledger's "Filter/rule vocabulary" entry), so the required param names
can't be mechanically derived from rule keys. Coverage is checked a different way at
each of the three layers:

## The mechanism

**`contract/browseRangeKeys.ts`** declares `MovieRangeRuleKey`/`SeriesRangeRuleKey` as plain
literal unions in the API contract, which both the server and the client import. The client may
not import server code at all (dependency-cruiser forbids it), and the contract imports nothing
from `server/`, so these lists are hand-declared rather than derived from `MEDIA_RULES` in place.

**`filterRegistry.ts`** keeps the real derivation (`_ActualRangeRuleFor<CT>`, a
distributive conditional type over `MEDIA_RULES`' `dataType: 'range'` entries) internal,
never exported, and asserts it against the imported contract bidirectionally:

```ts
type _SymmetricDiff<A extends string, B extends string> = Exclude<A, B> | Exclude<B, A>;
const _movieRangeKeysMatchContract: Record<_SymmetricDiff<_ActualMovieRangeKey, MovieRangeRuleKey>, never> = {};
```

A range rule added to, removed from, or content-type-rescoped in `MEDIA_RULES` without a
matching edit to `contract/browseRangeKeys.ts` fails to compile right here, naming the
mismatched key — in either direction (registry has a key the contract doesn't, or vice
versa).

**`media.procedures.ts`** and **`mediaQueryAdapters.ts`** each declare a "witness" map,
keyed by `MovieRangeRuleKey`/`SeriesRangeRuleKey` (so it's exhaustive — a missing rule
fails to compile), whose `gte`/`lte` values are typed `keyof typeof MOVIE_PARAM_TO_KEY`
/`keyof typeof BROWSE_PARAM_BINDINGS` (so a typo'd or dangling param-name reference also
fails to compile, naming the exact bad string):

```ts
const MOVIE_RANGE_PARAM_WITNESS: Record<
  MovieRangeRuleKey,
  { gte: keyof typeof MOVIE_PARAM_TO_KEY; lte: keyof typeof MOVIE_PARAM_TO_KEY }
> = {
  imdbRating: { gte: 'radarrImdbRatingGte', lte: 'radarrImdbRatingLte' },
  // ...
};
```

This shape — not a nested conditional type reaching into the target map's per-entry
`{key, bound}` shape — is deliberate: an earlier attempt at deeper validation (checking
that the referenced entry's own `key`/`bound` fields, not just its existence, matched)
hit a real TypeScript compiler limitation where a distributive-conditional-derived
union, consumed as a generic type argument across a module import boundary, silently
fails to narrow (confirmed via isolated repro: the identical construction works
correctly when every type is declared in one file, and stops working the moment the
union crosses an `import type`). The simpler `keyof typeof Table` form avoids that
class of type entirely and was verified (by deliberately breaking each direction) to
still catch both a missing rule and a dangling param reference.

**The zod schemas** (`sharedFilterFields`, `MoviesBrowseQuerySchema`, `SeriesBrowseQuerySchema`, in the contract) are
checked separately, since a param stripped by validation never reaches the
`*_PARAM_TO_KEY` maps at all — same silent-drop failure, one layer earlier:

```ts
type MovieSchemaMissing = Exclude<keyof typeof MOVIE_PARAM_TO_KEY, keyof MovieSchemaShape>;
const _movieSchemaCoversParams: MovieSchemaShape & Record<MovieSchemaMissing, never> = {} as MovieSchemaShape;
```

## Why `MEDIA_RULES` is `as const satisfies readonly MediaRule[]`

The distributive-conditional derivation in `filterRegistry.ts` needs `MEDIA_RULES`'
`key`/`dataType`/`contentTypes` fields to be literal types, not widened to
`string`/`MediaRule['dataType']`/`ContentType[]`. `MediaRule.contentTypes` and
`sourceProviders` are `readonly` array types for the same reason — a `readonly` tuple
from `as const` isn't assignable to a mutable array type, so the interface itself has
to accept readonly to accept the const-asserted literal array. `getRule` and
`media.rules.procedures.ts`'s `gatedDescriptors` both widen back to
`readonly MediaRule[]` before calling `.find`/`.filter` — iterating the literal-narrowed
union directly breaks `Array.prototype.includes`' overload resolution (a union of
differently-typed readonly tuples has no single well-typed `includes` signature).

**Caution:** `MOVIE_PARAM_TO_KEY`/`SERIES_PARAM_TO_KEY` must use `as const satisfies
Record<string, ParamMapping>` with *no* separate explicit type annotation on the `const`
declaration (`const X: Record<string, ParamMapping> = {...} as const satisfies ...`) —
an explicit annotation on the variable overrides the `as const`'s literal narrowing
entirely, silently widening `keyof typeof X` back to `string` and defeating every
witness map built on it. This exact mistake shipped once in this file during
development and produced no error — the witness maps' own exhaustiveness checks stayed
correct (they check `MovieRangeRuleKey`, not `MOVIE_PARAM_TO_KEY`'s narrowness), but the
typo/dangling-reference protection silently did nothing until caught by a targeted probe.

## Non-page files must live outside `src/pages/`

Not part of the range-param mechanism, but discovered and fixed alongside it: Next.js's
Pages Router treats every file under `src/pages/` matching `pageExtensions` as a route,
with no directory-based exclusion for colocated `__tests__`/`.stories.tsx` files or
arbitrary non-page utility modules — confirmed by an actual `next build` failure, twice
(once for `.test.tsx` files pulling `msw` into the production bundle via
`tests/mocks/server.ts`, once for `mediaQueryAdapters.ts`/`DashboardContent.tsx` having
no default-exported component). `next.config.js`'s `pageExtensions` now excludes
`.test.`/`.stories.` files via a negative lookbehind on the extension match (no renaming
of real pages needed — every real page here is already `index.tsx`/one of Next's
reserved special names). Non-page utility modules and components can't be excluded the
same way (no shared naming pattern) — they were relocated instead:
`mediaQueryAdapters.ts` → `src/lib/`, `DashboardContent.tsx` (+ its story) →
`src/components/DashboardContent/`, matching every other component's own-directory
convention (`src/components/MediaFilterBar/index.tsx`, etc.). A `.tsx`/`.ts` file that
isn't a route belongs outside `src/pages/` entirely, not colocated with a
naming-convention workaround — `pageExtensions` filtering is for genuinely test-only or
story-only files, which by construction never need a real route.

## How it's wired

- [`server/modules/media/activeFieldSet.ts`](ref:path:server/modules/media/activeFieldSet.ts) — `fieldsByProviderType` producer-coverage check.
- [`server/modules/media/movie.ts`](ref:path:server/modules/media/movie.ts) / [`series.ts`](ref:path:server/modules/media/series.ts) — `Partial<EnrichmentFields>`.
- [`server/modules/media/enrichmentJob.ts`](ref:path:server/modules/media/enrichmentJob.ts) — `EnrichmentWriteValues`.
- [`server/modules/media/filterRegistry.ts`](ref:path:server/modules/media/filterRegistry.ts) — `MEDIA_RULES`, `sourceField`-coverage check, the range-key derivation, the bidirectional contract assertion.
- [`contract/browseRangeKeys.ts`](ref:path:contract/browseRangeKeys.ts) — the range-rule key lists both sides share.
- [`contract/media.ts`](ref:path:contract/media.ts) — the browse query schemas.
- [`server/modules/media/media.procedures.ts`](ref:path:server/modules/media/media.procedures.ts) — server-side witness maps and zod schema coverage checks.
- [`src/lib/mediaQueryAdapters.ts`](ref:path:src/lib/mediaQueryAdapters.ts) — client-side witness maps, `BROWSE_PARAM_BINDINGS`.
- [`next.config.js`](ref:path:next.config.js) — `pageExtensions`' test/stories exclusion.
