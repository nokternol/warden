# Library cache: one copy of the library, served from memory

Warden answers every question about the owner's library from one copy: what the services said about
each title, stored in Warden's database by the scheduled refreshes. Features never read Radarr,
Sonarr, Plex, Jellyfin or the enrichers live. They read
[`LibraryCache`](ref:path:server/modules/media/libraryCache.ts), a singleton in the media module
(registered in [`media.registrations.ts`](ref:path:server/modules/media/media.registrations.ts)): the
in-memory copy of the library as last refreshed, loaded from the database. It holds nothing the
database does not.

## Why one copy

Two copies of the library disagree. Before this design, features read Radarr and Sonarr live through
a 60-second cache while the identity job's stored grouping lagged an hour behind, so the Media page,
counts and runs each answered a slightly different question. With one copy, written only by the
refreshes and read only through this cache, every feature answers from the same data and says how
current it is. The cache keeps reads fast without database indexing, so the scheduled mass writes stay
simple.

## What the copy is

The refreshes write these tables (schema in
[`schema.ts`](ref:path:server/database/schema.ts)):

| Table | Holds | Written by |
|---|---|---|
| `media_item` + `media_item_payload` | each Radarr/Sonarr copy, its title group, and the provider's own record of it | the catalog refresh |
| `media_identity` | each title, its ids in other services, and its Plex/Jellyfin links | the catalog refresh |
| `media_enrichment` | each fact about a title, per provider that reported it | the enrichment job |
| `provider_lists` | each Radarr/Sonarr instance's tags, quality profiles, root folders, language profiles | the catalog refresh |
| `provider_refresh` | when each kind of each provider's data last refreshed, and whether the latest attempt failed | both refreshes |

The refreshes and their rules (believing a successful answer, keeping data on failure) are described
in the provider roles and identity doc.

## What a load holds

A load reads, for active providers only:

- **Copies.** Every copy with a payload and not marked removed, each as a
  [`LibraryCopy`](ref:path:server/modules/media/libraryCache.ts): its `media_item` id, title group,
  instance, the provider's record, the title's media-server links, and the normalised item the query
  engine reads. The item carries its title group (`_sourceIds.identity`), its Plex/Jellyfin ids and
  its facts, so evaluation reads nothing else.
- **Facts, one value each.** Facts are stored per provider. The load resolves them with
  [`resolveFacts`](ref:path:server/modules/media/enrichmentMerge.ts): where more than one active
  provider reported a fact, `contestedFieldPrecedence` picks one; a fact one provider reported is kept
  as reported.
- **Providers, refresh records and stored lists**, for the "As of" line, dependency checks and choice
  lists.

## Who reads it

Everything that shows or uses library data:

- **Browse** ([`media.procedures.ts`](ref:path:server/modules/media/media.procedures.ts)) lists the titles
  the query engine's `select` answers over the copies, one row per title.
- **Filter choices**: genres, networks, release groups and collection names from the stored records;
  studio, file details and labels from the stored facts; tags and profiles from the stored lists.
- **Query counts** ([`mediaQueries.procedures.ts`](ref:path:server/modules/mediaQueries/mediaQueries.procedures.ts))
  count the titles `select` answers.
- **Task parameter choices** ([`providers.procedures.ts`](ref:path:server/modules/providers/providers.procedures.ts))
  read stored lists through the type-only
  [`ProviderListsReader`](ref:path:server/modules/providers/providerListsReader.ts), which the cache
  implements and the container injects, so `providers` never imports `media`.
- **Runs, previews and Run Now checks**
  ([`automationExecutor.ts`](ref:path:server/modules/automations/automationExecutor.ts)) plan on the
  copy as it stands, from one `select` over every active instance's copies, and address titles by their
  linked ids. A run records the `media_item` ids it
  targeted, and the copy's freshness.

`contentOf(contentType)` hands each reader one content type's `copies` and the `records` saying how
current they are; the query engine judges those copies directly, so the cache hands out no other
view of them.

## Saying how current it is

[`recordsFor`](ref:path:server/modules/media/libraryCache.ts) picks the refresh records a view of a
content type answers from: the `catalog` and `lists` records of each active instance owning it, and
the `links` and `facts` records of every active media server and enricher. A kind that never refreshed
appears with neither time, as not refreshed yet. Browse, query counts, automation previews and
readiness carry these records.
[`freshnessOf`](ref:path:contract/schemas.ts) turns them into one "As of" time, the stalest
successful refresh, so a view never claims fresher data than it has, plus the providers that failed or
never refreshed. The client shows that as one line,
[`AsOfLine`](ref:path:src/components/AsOfLine/index.tsx), on the Media page, the builder's counts, the
query list, the Run Now check, the System page and run history.

## When it reloads

There is no time-based expiry: the copy changes only when a refresh writes it. The cache clears on
`media:changed`, which the catalog refresh and the enrichment job send whenever they finish (success
or failure) and a media reset sends after deleting the copy. It also clears on `provider:changed`,
since a provider joining, changing or leaving changes which copies are active. The next read loads
again. A load in flight when the cache clears is never kept: `read` stores the promise of the load it
starts, and a clear drops it, so the next read starts a new load. A failed load is not kept either.

User runs do not clear it. A run acts on the services, not on the copy, and the copy changes only
when a refresh reads the services again.

## Measured on the built read path

On a generated library of 10,000 movies across two Radarr instances (12,000 copies) and 3,000 series,
with payloads sized like real Radarr and Sonarr records (about 59 MB of JSON) and facts for every
title from three providers, a cold load took about 0.9 s and a warm browse page about 220 ms for
movies and 105 ms for series, on both an in-memory and a file database.
