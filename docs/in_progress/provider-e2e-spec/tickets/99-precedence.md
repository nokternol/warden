---
type: wayfinder-ticket
label: wayfinder:grilling
status: closed
assignee: claude
blocked_by: [01-plex-ui, 02-jellyfin-ui, 03-radarr-ui, 04-sonarr-ui, 05-tautulli-ui, 06-overseerr-ui, 07-tmdb-ui, 08-omdb-ui, 09-seerr-ui, 10-tvmaze-ui]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Cross-provider precedence pass

## Question

Read all 10 provider spec files under `docs/in_progress/provider-e2e-spec/specs/`. Collect every
field-name collision flagged during research/decision tickets (known one going in: Plex's `added` =
downloadedAt-to-library vs Radarr/Sonarr's `added` = addedAt-to-source — same word, different domain
meaning). For each collision:

- Decide the domain field name(s) that disambiguate it — grill the user; don't rename unilaterally.
- Decide how `server/modules/media/ruleRegistry.ts`'s `contestedFieldPrecedence` should treat it:
  one merged field with per-provider precedence, or genuinely separate fields that shouldn't merge
  at all.

Also do a second pass across all 10 specs independent of flagged collisions: scan for any field name
reused by two providers with different meaning that nobody caught during the per-provider decision
tickets (the flagged list is a floor, not guaranteed complete).

Write the result as `docs/in_progress/provider-e2e-spec/specs/_precedence.md`. This is the last
ticket on the map — once it closes, the destination (a complete, collision-safe, per-provider e2e
handoff spec) is reached.
