# Inter-provider dependency has no representation

**Status:** INTENT (future state, not built). Discovered while examining actuator translation (see
`docs/intent/media-actuator-realisation.md`) and originally recorded alongside the media identity model's
open items — reclassified here on its own: this is an **identity/provider-configuration** issue, not the
`MediaItem` field-shape one (`docs/architecture/media-field-provider-role.md`, shipped, unrelated theme).

## The problem

Tautulli's data is entirely Plex-keyed — it has no identity space of its own; every fact it contributes
is matched by a Plex rating key. Yet nothing in provider configuration declares, validates, or even
represents "this provider requires that provider to be configured." If a user configures Tautulli without
Plex, its enrichment (and, per `media-actuator-realisation.md`, its `deleteWatchHistory` actuator task)
silently resolves nothing, every time, with no error surfaced anywhere.

This is the same *class* of fracture as the original MediaSource-privileging discovery documented in
`docs/architecture/fracture-ledger.md`'s Healed entries (a provider silently needing something it wasn't
modeled as depending on) — a generic providers-can-depend-on-providers gap, not Tautulli-specific.

## Why it's an identity concern

Tautulli's dependency on Plex is specifically that it has no identity/keying of its own — it can only be
joined to a `media_identity` group via a key (`plexRatingKey`) another provider supplies. That's the same
axis `docs/architecture/provider-roles-and-identity.md` already owns (which systems can produce ids the
identity model can key on, and which can't) — this belongs with that model's concerns, not with
`MediaItem`'s field shape.

## Scope of the investigation (not yet started)

- Whether this is representable as a static provider-type fact (mirroring `SOURCE_OWNER`'s
  "known before any instance exists" property — e.g. "Tautulli requires an active Plex instance") or needs
  to be validated per-instance.
- Where the dependency should surface: `assertNoActiveConflict`-style validation at configuration time,
  a `QueryHealth`-style degradation signal at evaluation time, or both.
- Whether this generalizes beyond Tautulli/Plex to other current or future providers, or is currently a
  one-off relationship not worth a general mechanism yet.

May turn out to be a third axis the identity model has to account for, not just an actuator-side concern —
undetermined without the investigation above.
