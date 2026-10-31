# Product

## Register

product

## Users

Self-hosters running a personal media server stack around Plex, Jellyfin, or Emby. They pull metadata from TMDB and OMDB, track playback with Tautulli, and may also run Sonarr or Radarr — but their identity is the broader media ecosystem, not the Servarr family specifically. They are technical and goal-oriented: they come with a job to do and want to finish it quickly. They are not exploring; they are operating.

These users are fluent in the visual language of self-hosted tools: dark surfaces, sidebar nav, table-heavy data views, badge-based status. They notice inconsistency, and they trust tools that feel coherent.

A phone is the owner's primary device. Everything Warden offers is fully operable at 400px: all navigation, every row action, forms, and the same confirmations before anything destructive. A phone is for operating Warden, not only for checking it.

## Product Purpose

Warden is a rule-based automation engine for self-hosted media libraries. Users define **filters** that select a group of media, attach a **schedule** (cron-based), and pair them with a **task** — an action applied to that group on that cadence. The three-part model (filter + schedule + task) is the core primitive. Success looks like: a user opens the app, configures a rule, and the library reflects the result automatically — with no ambiguity about what ran, when, and what changed.

Warden connects to the stack around a media server (Plex, Jellyfin, Emby) and its supporting services (TMDB, OMDB, Tautulli). It is not part of the Servarr family; it is a layer on top of the full stack.

## Brand Personality

Focused, efficient, dark-native.

The tool should feel at home beside Tautulli, Kometa, and Overseerr — tools that take their job seriously and don't perform friendliness they don't mean. Warden is deliberate and functional: the cron + filter + task model is a rules engine, and the interface should reflect that authority without becoming austere.

Teal is the existing brand anchor. It should be used intentionally: primary actions, active states, data highlights — not decoration.

## Anti-references

- Not a SaaS dashboard. No cream/sand backgrounds, no rounded-everything aesthetic, no metric-hero cards.
- Not a Servarr app. Warden is not Sonarr or Radarr; it has no arr suffix, no arr identity, and no arr design debt to inherit.
- Not a monitoring dashboard (Grafana / Prometheus / Tautulli itself). Chart-heavy, metric-grid layouts are wrong for this context.

## Design Principles

1. **The tool disappears into the task.** Users are operating, not exploring. Navigation, labels, and affordances should be self-evident. Novelty is a cost, not a feature.
2. **Ecosystem coherence, not ecosystem mimicry.** Compatible with Sonarr/Radarr visually — dark surfaces, familiar nav patterns, dense data views — but with its own visual hierarchy and polish level. Users should feel at home without déjà vu.
3. **Dark-first.** Dark mode is the designed experience. Light mode is supported but is not the baseline. Contrast ratios, shadow depths, and color decisions are made for dark surfaces.
4. **Density over decoration.** Power users need information at a glance. Whitespace serves readability, not aesthetics. Tables, lists, and panels can be compact; decoration that doesn't carry information should be cut.
5. **State clarity over visual polish.** Every component communicates its state unambiguously: loading, active, disabled, error, success. Users should never wonder whether something is running, finished, or broken.

## Accessibility & Inclusion

WCAG 2.1 AA, in both themes. All body text at 4.5:1 contrast against its background; interactive elements at 3:1. Focus rings visible on keyboard navigation. Reduced-motion alternative for all transitions. Tap targets at least 44px on phones.
