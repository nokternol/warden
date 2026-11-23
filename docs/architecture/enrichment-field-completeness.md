# Reported-fact completeness: compiler-enforced, not hand-maintained

**Status:** AS-BUILT (current fact). A reported fact is declared by key in `ReportedFacts`
([`server/modules/providers/facts.ts`](ref:path:server/modules/providers/facts.ts)) and reported by
the connections whose `capabilities.facts.reports` name it. Everything else that needs to know which
service supplies a fact derives it from those declarations, so there is no second list to keep in
step. The few places that still hold a per-fact entry each fail to compile, or fail a test, when one is
missing.

## The checks

**A reporter must be able to read and rank what it declares.** `defineProviderClasses`
([`providerClasses.ts`](ref:path:server/modules/providers/providerClasses.ts)) refuses a class that
declares `facts` without implementing `FactReporter`, or that resolves to no kind (neither a media
server nor a declared `providerKind`) or no title id column (no address column and no `matchedBy`).
`@ts-expect-error` fixtures in
[`providerClasses.typecheck.ts`](ref:path:server/__tests__/modules/providers/providerClasses.typecheck.ts)
prove each check fires.

**A catalog fact and a reported fact never share a key.** `NoReportedFacts`
([`mediaItem.ts`](ref:path:server/modules/media/mediaItem.ts)) fails to compile when a key of
`MovieCatalogRecord` or `SeriesCatalogRecord` is also a reported fact key, with a fixture
([`catalogRecords.typecheck.ts`](ref:path:server/__tests__/modules/media/catalogRecords.typecheck.ts)).
`NormalizedMovie`/`NormalizedSeries` are a catalog record plus `Partial<ReportedFacts>`, so a new
reported fact is carried on the item with no list to extend. A provider that wanted to report a catalog
fact would need an owner decision on source-versus-reporter precedence first.

**Every reported fact has a rule that reads it.** A `MediaRule` predicate reads its fact without
TypeScript being able to introspect the function body, so each rule declares it in `reads`
(`'catalog'` or one reported fact key). `_everyReportedFactHasARule`
([`ruleRegistry.ts`](ref:path:server/modules/media/ruleRegistry.ts)) fails to compile when a reported
fact is read by no rule: a fact that would be stored and merged onto the item but never filterable.

**Every contested fact has a precedence.** A unit test
([`facts.test.ts`](ref:path:server/__tests__/modules/providers/facts.test.ts)) walks every declaration
and fails when a fact reported by two or more kinds of provider leaves one of them out of its
`REPORTED_FACT_PRECEDENCE` order.

**Every reported fact has a storage row.** Facts are stored by field id, and `enrichment_field` is
seeded by migrations. A test ([`mediaEnrichment.test.ts`](ref:path:server/__tests__/database/mediaEnrichment.test.ts))
checks that, after every migration, the seeded keys equal the `ReportedFactKey` set, through an object
typed `Record<ReportedFactKey, true>` that does not compile while it misses or invents a key.

**Enrichment writes only what is declared, with no per-fact code.**
[`EnrichmentJob`](ref:path:server/modules/media/enrichmentJob.ts) stores, per reporter, the keys its
declaration names with defined values; a key a mapping returns but does not declare is never written.
The load-time merge ([`enrichmentMerge.ts`](ref:path:server/modules/media/enrichmentMerge.ts)) reads
back an object shaped like `ReportedFacts` and the cache applies it with one generic `Object.assign`.

## Why `MEDIA_RULES` is `as const satisfies readonly MediaRule[]`

`_everyReportedFactHasARule` extracts each rule's `reads` from `typeof MEDIA_RULES`, which needs those
values to be literal types rather than widened to `'catalog' | ReportedFactKey`; a widened array would
read every fact and the check would pass vacuously. `MediaRule.contentTypes` is a `readonly` array
type for the same reason: a `readonly` tuple from `as const` isn't assignable to a mutable array type.
`getRule` and `media.rules.procedures.ts`'s `gatedDescriptors` both widen back to
`readonly MediaRule[]` before calling `.find`/`.filter`, because iterating the literal-narrowed union
directly breaks `Array.prototype.includes`' overload resolution.

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

- [`server/modules/providers/facts.ts`](ref:path:server/modules/providers/facts.ts) — `ReportedFacts`, `ReportedFactKey`, `REPORTED_FACT_PRECEDENCE`.
- [`server/modules/providers/providerClasses.ts`](ref:path:server/modules/providers/providerClasses.ts) — the reporter checks on the class map.
- [`server/modules/media/mediaItem.ts`](ref:path:server/modules/media/mediaItem.ts) — `NoReportedFacts` over the catalog records.
- [`server/modules/media/ruleRegistry.ts`](ref:path:server/modules/media/ruleRegistry.ts) — `reads` and `_everyReportedFactHasARule`.
- [`next.config.js`](ref:path:next.config.js) — `pageExtensions`.
