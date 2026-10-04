# Modelling multiple editions per media item

**Status:** INTENT (future state, not built).

## The problem

The identity model (`docs/architecture/provider-roles-and-identity.md`) resolves one
`media_identity` row per logical title and groups per-instance copies under it via `media_item`
(`server/database/schema.ts`). `media_item` is unique on `(providerId, externalId)` — it assumes
exactly one concrete item per (provider instance, title) pair.

That assumption breaks for sources that can expose more than one physical copy of the same title
from a single instance — the clearest case is Plex, where one library can hold several editions of
the same movie (e.g. theatrical cut and director's cut, or two quality-differentiated rips) as
distinct items sharing one `ratingKey`-adjacent identity but no single native external id the
current schema can key on without collision. This is explicitly flagged as a known limitation in
`docs/architecture/provider-roles-and-identity.md` ("No version/edition concept") but has no
design beyond the one-sentence flag.

Today, whichever edition a sync job happens to write last silently wins the `(providerId,
externalId)` slot (or the unique constraint rejects the second write, depending on how externalId
is derived) — there is no visibility into the collision and no way for a query or actuator task to
target "the director's cut" specifically.

## Why it matters

- **Actuator correctness (blocks part of `media-actuator-realisation.md`).** Tasks like
  `deleteFromLibrary` or `markPlayed` operate on ids resolved through this model. If a title has
  multiple editions and the model can only address one, an actuator task has no way to disambiguate
  which physical copy to act on — it either acts on the wrong one or can't act at all.
- **Query correctness.** Filter predicates and enrichment merges assume one row per title per
  instance; a silently-dropped or silently-overwritten edition is invisible data loss, not a
  visible degradation (unlike the `QueryHealth` cases already handled for instance-qualified filter
  values).
- **Not urgent today** — no known user-reported breakage yet, because most libraries don't carry
  multiple editions of the same title. This is a correctness gap waiting to be hit, not an active
  incident.

## Scope of the investigation (not yet started)

This doc is a problem statement, not a spec. Open questions that need resolving before this can
move to `docs/in_progress/`:

1. **Addressing scheme.** Does an edition get its own `media_item` row (relaxing the unique
   constraint to `(providerId, externalId, editionKey)`) or a new child table under `media_item`?
   What's the stable key for an edition when the source provider doesn't expose one itself (e.g.
   Plex's edition identifier vs. a synthesized key from file attributes)?
2. **Which sources are actually affected.** Confirm which of Plex/Jellyfin/Radarr/Sonarr can
   surface multiple editions of one title from one instance today, versus which never can — no
   point generalizing the schema for a case only one provider hits.
3. **UI/API surface.** Do queries and automations need edition-level targeting from day one, or is
   "pick one edition, ignore the rest, but stop silently colliding" an acceptable first cut?
4. **Interaction with instance-qualification.** The existing multi-instance model
   (`InstanceScopedValue.providerId`, `MediaRule.instanceScoped`) qualifies ids by provider instance;
   an edition axis is a second, orthogonal qualifier and needs to compose with it without the
   combinatorics leaking into every call site.

## Dependencies

- Soft-blocks the actuator id-translation seam in `docs/intent/media-actuator-realisation.md` for
  any provider where multiple editions turn out to be common — that doc's `run(ids)` contract
  assumes one id addresses one item.
- No dependency in the other direction: the actuator work can and should proceed for the common
  single-edition case without waiting on this.
