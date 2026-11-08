# One normalized rating over per-source values

**Status:** INTENT (future state, not built). This records the owner's direction for ratings after
the catalog became Warden's one ratings mechanism (2026-11-08). It describes the problem, the
direction and the inventory as the code stands. It is not a design.

## Where ratings stand

A title's ratings are whatever its Radarr or Sonarr record reports. `contract/ratings.ts`
(`ratingsOf`) is the one reader: it lists each source the record reports, with its label, its value
on that source's fixed scale and its vote count, and it leaves an unrated entry (value 0 with zero or
missing votes) out. Normalization takes the rating filters' `imdbRating` and `communityRating` from
it, and the Media page's ratings panel shows the same list. Nothing is stored per source, nothing is
normalized onto one scale, and nothing is averaged.

## The direction

The owner's direction: **one normalized product rating to sort by, computed from identity-keyed
per-source values, with the raw values and their sources still displayed.**

- **Per-source values keyed by identity.** One value per (media identity, rating source), so the raw
  values survive independently and can be grouped, weighted and recomputed. A title-keyed lookup
  (search a provider by typed title and year) is not an acceptable input: it is ambiguous and ignores
  Warden's identity model. Warden had one, and it was deleted for those reasons.
- **One normalized rating Warden owns.** A computed rating (for example weighted by source
  reliability, vote count or recency) is something this product owns even though every input comes
  from elsewhere. That is what a "sort by rating" or a single rating filter would read.
- **Raw values stay visible.** Wherever the normalized rating shows, the per-source values and their
  sources stay available, each labelled by its own source. TMDB's vote average is not an IMDb score,
  and a display that drops source labels would blur that.

Table shape, the weighting algorithm, which sources beyond Radarr and Sonarr feed it, and how a rating
filter would read it are **not decided here**.

## Why ratings don't fit the shared EnrichmentFields pattern

Other fields with several producers (`genres`, `certification`, `studio`, `network`) pick one winning
value per item through `contestedFieldPrecedence`, and the losing values are discarded. That shape is
wrong for ratings. The sources use different scales that cannot be converted into each other (IMDb
0–10, Rotten Tomatoes 0–100%, Metacritic 0–100, TMDB 0–10 over a different vote population than
IMDb's), so picking one winner throws away exactly the signal a blended rating needs.

## Out of scope for this direction

- **`certification`** is a categorical classification (PG-13, TV-MA), not a numeric score. It stays
  in the shared precedence pattern.
- **Award flags and box office** (OMDb) are not ratings. Award signals might later weight a blend,
  but they are not rating values.

## Per-source inventory, as the code stands

| Source | Values | Scale | State |
|---|---|---|---|
| Radarr | IMDb, TMDB, Trakt (each with votes) | 0–10 | Read by `contract/ratings.ts`, not stored. IMDb feeds the `imdbRating` filter (movies). There is no `NormalizedMovie.tmdbRating`. |
| Radarr | Rotten Tomatoes, Metacritic (votes reported as 0) | 0–100 | Read by `contract/ratings.ts`, not stored. No filter reads them. |
| Sonarr | community rating (with votes) | 0–10 | Read by `contract/ratings.ts`, not stored. Feeds the `communityRating` filter (series). |
| Plex | `rating` / `audienceRating` | Opaque, depends on the metadata agent | Not read. Its scale and provenance depend on the agent, so it would have to stay provider-labelled. |
| Jellyfin | `CommunityRating` / `CriticRating` | Opaque, same reasoning as Plex | Not read. |
| TMDB | `vote_average` / `vote_count` | 0–10 | Carried on the connection's `*Enriched` types; nothing reads it as a rating. TMDB is a deferred provider type. |
| OMDb | IMDb, Rotten Tomatoes, Metacritic | as above | Not read. OMDB is a deferred provider type with no consumer. |
| TVmaze | `rating.average` | 0–10 | Not read. Nothing consumes TVmaze ratings. |
