# EnrichmentFields field-completeness: compiler-enforced, not hand-maintained

**Status:** AS-BUILT (current fact). Adding a key to `EnrichmentFields`
(`server/modules/media/mediaFieldProvider.ts`) touches several other places before it's
usable end to end, and a missing entry in any of them used to compile fine while the field
silently didn't work (wasn't produced, persisted, carried on the domain shape, or filterable).
Each of those places now either fails to compile when a field is missing or has no per-field
entry to forget.

## The checks

**`activeFieldSet.ts`'s `fieldsByProviderType`** declares which providers produce which
fields. A `Record<_UncoveredField, never>` check (`_UncoveredField` = every
`EnrichmentFields` key not present in the union of all declared providers' field lists)
fails to compile if a field has no producer anywhere — unreachable, since nothing would
ever populate it.

**`movie.ts`/`series.ts`'s `NormalizedMovie`/`NormalizedSeries`** extend
`Partial<EnrichmentFields>` directly rather than hand-picking a subset with
`Pick<EnrichmentFields, 'tags' | 'playCount' | ...>`. A `Pick` list compiles with a field
missing from it (it only requires the *listed* keys to be real), and no field is movie-only
or series-only within `EnrichmentFields` (that distinction lives in a rule's `providers` and
`contentTypes`), so there is no list to keep complete.

**`EnrichmentJob.run`'s write path** (`server/modules/media/enrichmentJob.ts`) writes a
resolved value per `EnrichmentFields` key on every pass. Its `values` object literal is typed
against `EnrichmentWriteValues = { [K in EnrichableField]: EnrichmentFields[K] | null }`
(`EnrichableField` is `Exclude<keyof EnrichmentFields, 'tags'>`, from `enrichment/enricher.ts`),
so a new key other than `tags` fails to compile until the write side handles it. Tests insert
enrichment rows directly, bypassing the job, so this check is the only thing that catches a
field the job never writes.

**`ruleRegistry.ts`'s `MEDIA_RULES`** — a `MediaRule` predicate reads an
`EnrichmentFields` key without TypeScript being able to introspect that fact from the
function body, so each field-backed rule declares it explicitly via
`sourceField?: keyof EnrichmentFields` (e.g. `plexAddedDaysAgo`'s rule sets
`sourceField: 'plexAddedAt'`). `_FieldWithNoRule = Exclude<keyof EnrichmentFields,
_DeclaredSourceField>` (`_DeclaredSourceField` extracted from every rule's declared
`sourceField` across `MEDIA_RULES`) fails to compile if a field is missing from every rule's
declaration — a field that is enriched, stored and merged onto the item but never filterable.

**`enrichmentMerge.ts`'s copy-through has no per-field code to check.** Storage holds a row
only for a field that's present ([the EAV model](ref:path:docs/architecture/media-enrichment-eav-model.md)),
so `enrichmentMerge.ts` reads back an object shaped exactly like `EnrichmentFields` and applies
it with one generic `Object.assign(item, fields)`. There's no per-field line to omit.

## Why `MEDIA_RULES` is `as const satisfies readonly MediaRule[]`

`_DeclaredSourceField` extracts each rule's `sourceField` from `typeof MEDIA_RULES`, which
needs those fields to be literal types rather than widened to `keyof EnrichmentFields`; a
widened array would declare every field and the check would pass vacuously.
`MediaRule.contentTypes` and `providers` are `readonly` array types for the same reason — a
`readonly` tuple from `as const` isn't assignable to a mutable array type, so the interface
itself has to accept readonly to accept the const-asserted literal array. `getRule` and
`media.rules.procedures.ts`'s `gatedDescriptors` both widen back to `readonly MediaRule[]`
before calling `.find`/`.filter` — iterating the literal-narrowed union directly breaks
`Array.prototype.includes`' overload resolution (a union of differently-typed readonly tuples
has no single well-typed `includes` signature).

## Only `*.page.tsx` files under `src/pages/` are routes

Next's Pages Router treats every file under `src/pages/` that matches `pageExtensions` as a
route. `next.config.js` sets `pageExtensions` to `page.tsx`/`page.ts`/`page.jsx`/`page.js`,
so routes are named `*.page.tsx` (including `_app.page.tsx` and `_document.page.tsx`) and
any other file there — tests, stories, a page's own components such as
`src/pages/login/LoginScreen.tsx` — is never built as a route. Inclusion by suffix is used
rather than a regex excluding `.test.`/`.stories.`, because Next's dev server resolves
`_app`/`_document` by treating each `pageExtensions` entry as a literal suffix, so a regex
there silently breaks custom `_app`/`_document` in dev while build still works.

## How it's wired

- [`server/modules/media/activeFieldSet.ts`](ref:path:server/modules/media/activeFieldSet.ts) — `fieldsByProviderType` producer-coverage check.
- [`server/modules/media/movie.ts`](ref:path:server/modules/media/movie.ts) / [`series.ts`](ref:path:server/modules/media/series.ts) — `Partial<EnrichmentFields>`.
- [`server/modules/media/enrichmentJob.ts`](ref:path:server/modules/media/enrichmentJob.ts) — `EnrichmentWriteValues`.
- [`server/modules/media/ruleRegistry.ts`](ref:path:server/modules/media/ruleRegistry.ts) — `MEDIA_RULES` and the `sourceField`-coverage check.
- [`next.config.js`](ref:path:next.config.js) — `pageExtensions`.
