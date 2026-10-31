---
name: Warden
description: Rule-based automation engine for self-hosted media libraries
colors:
  primary: "#0d9488"
  primary-hover: "#14b8a6"
  primary-active: "#10a596"
  on-primary: "#0f172a"
  primary-text: "#14b8a6"
  primary-text-light: "#115e59"
  danger: "#dc2626"
  danger-hover: "#b91c1c"
  danger-active: "#991b1b"
  on-danger: "#ffffff"
  danger-text: "#fca5a5"
  danger-text-light: "#991b1b"
  surface-bg: "#0f172a"
  surface-panel: "#1e293b"
  surface-elevated: "#2a3546"
  surface-bg-light: "#f8fafc"
  surface-panel-light: "#eaf0f6"
  text-primary: "#f8fafc"
  text-secondary: "#cbd5e1"
  text-muted: "#94a3b8"
  text-primary-light: "#0f172a"
  text-secondary-light: "#334155"
  text-muted-light: "#475569"
  border: "#475569"
  border-light: "#cbd5e1"
  border-input: "#7d8fa3"
  border-input-light: "#64748b"
  success: "#10b981"
  success-light: "#065f46"
  warning: "#f59e0b"
  warning-light: "#92400e"
  info: "#60a5fa"
  info-light: "#1d4ed8"
typography:
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
  caption:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: '"JetBrains Mono", monospace'
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "4px"
  md: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  card-default:
    backgroundColor: "{colors.surface-panel}"
    rounded: "{rounded.md}"
    padding: "16px"
  card-outlined:
    backgroundColor: "{colors.surface-panel}"
    rounded: "{rounded.md}"
    padding: "16px"
  badge-primary:
    backgroundColor: "rgba(13, 148, 136, 0.10)"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  badge-success:
    backgroundColor: "rgba(16, 185, 129, 0.10)"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  badge-warning:
    backgroundColor: "rgba(245, 158, 11, 0.10)"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: Warden

## 1. Overview

**Creative North Star: "The Operator's Console"**

Warden is a control surface for the self-hosted media stack. Users arrive with a task and leave with it done. The interface is designed to disappear: dark surfaces that reduce eye strain during long sessions, teal reserved for where the system is alive (active states, live indicators, primary actions), and information density calibrated for operators who know what they're looking at.

The design is dark-first. Not dark as aesthetic flourish — dark as the designed experience. Three surface tiers (bg / panel / elevated) create hierarchy through tonal separation rather than decoration. Cards lift from the background by stepping one tier toward the light. The teal ambient glow in dark mode — layered inset edge highlights and wide ambient diffusion — signals elevation and focus, not ornament.

Warden should feel at home beside Tautulli, Kometa, and Overseerr — tools that take their job seriously and don't perform friendliness they don't mean. It is not a Servarr app and carries no arr design debt; it has its own hierarchy, its own authority, and its own level of craft.

**Key Characteristics:**
- Dark-first: dark mode is the designed experience, not a theme variant
- Teal as signal: the accent appears only where the system is active or responsive
- Three surface tiers: bg / panel / elevated, enforced by tonal separation and shadow depth
- Dense by default: information at a glance; whitespace earns its place
- Confident and minimal: clear affordances, no surface decoration without function

## 2. Colors: The Teal Operator Palette

Slate neutrals form the structural backbone; teal marks what is alive and interactive.

### Primary
- **Operative Teal** (#0d9488): The brand fill. Primary action buttons, active sidebar items, focus rings, key data indicators. Never decorative — only where the system responds to or awaits user intent.
- **Live Teal** (#14b8a6): Hover state for primary actions. The lighter step signals responsiveness without brightness overload on a dark surface.
- **Pressed Teal** (#10a596): Active/pressed state. Confirms input receipt.
- **On Primary** (#0f172a): Text on every teal fill: 4.77:1 at rest, 7.17:1 on hover, 5.82:1 pressed. White reaches only 3.74:1 and is not used on teal.
- **Teal Text** (#14b8a6 dark, #115e59 light): Teal as text or an icon on a surface. The fill colour reaches only 3.91:1 on the panel, so it is never used for text.

### Secondary
- **Critical Red** (#dc2626): Destructive fills exclusively. Delete, disconnect, irreversible operations. White text. Hover: #b91c1c. Active: #991b1b. Both darken because white text must hold 4.5:1. Never decorative.
- **Danger Text** (#fca5a5 dark, #991b1b light): Errors and danger as text on a surface or a danger tint. It holds 4.5:1 on the panel, the elevated tier and a 15% danger tint.

### Neutral
- **Console Black** (#0f172a): The floor. Page background in dark mode. Nothing is placed directly here except the panel tier.
- **Panel Slate** (#1e293b): The primary working surface. Cards, sidebars, and containers sit here — one tier above the floor.
- **Elevated Slate** (#2a3546): Third tier. Modals, dropdowns, tooltips. Lifts above the panel layer.
- **Secondary Text** (#cbd5e1): Body-weight information, secondary labels, descriptions in dark mode.
- **Muted Text** (#94a3b8): Supporting information: timestamps, counts, placeholder text. Never for text the user needs to act on.
- **Cool White** (#f8fafc): Primary text and icons in dark mode; page background in light mode.
- **Panel Light** (#eaf0f6): Surface for cards and containers in light mode.
- **Border** (#475569 dark, #cbd5e1 light): Container borders and row dividers. Decorative, because surface tiers, content and spacing already separate what they outline.
- **Input Border** (#7d8fa3 dark, #64748b light): The edge of inputs and other controls. It identifies the control, so it holds 3:1 on every surface.

### Status
- **Go Green** (#10b981 dark, #065f46 light): Success states, completed tasks, healthy connections.
- **Caution Amber** (#f59e0b dark, #92400e light): Warnings, degraded states, non-critical issues.
- **Signal Blue** (#60a5fa dark, #1d4ed8 light): Informational context, non-urgent notices.

Each status colour is readable as text on every surface of its theme and on its own 10% tint. `src/styles/__tests__/theme.contrast.test.ts` computes all of these ratios from the theme.

**The One Theme Rule.** Components use tokens, never a colour value. Colour tokens are channel variables composed with `rgb(var(--x) / <alpha-value>)`, so opacity modifiers work on every semantic colour.

**The Single Voice Rule.** Teal appears on ≤10% of any given screen at rest. An interface where everything is teal is an interface where nothing is teal. Its rarity is its power: when teal appears, the system is speaking.

**The No-Warm-Surface Rule.** No cream, sand, beige, or warm-tinted neutrals. The floor and panel are cool slate. "Warmth" in this brand is carried by the teal accent and its glow, not by background tinting.

## 3. Typography

**UI Font:** Inter (with system-ui, sans-serif fallback)
**Mono Font:** JetBrains Mono (with monospace fallback)

**Character:** One family carries the entire interface. Inter at multiple weights creates hierarchy without font-pairing noise. JetBrains Mono marks technical strings — IDs, paths, config values — distinguishing data from label exactly where the distinction matters.

### Hierarchy
- **Title** (semibold 600, 1.25rem / 20px, line-height 1.4): Page headings, card section titles, modal headers.
- **Body** (regular 400, 0.875rem / 14px, line-height 1.5): Primary content, descriptions, form field values. Cap prose at 65–75ch.
- **Label** (medium 500, 0.875rem / 14px, line-height 1.25): Button text, navigation items, form labels, badge copy. Weight contrast distinguishes control from content at the same size.
- **Caption** (regular 400, 0.75rem / 12px, line-height 1.4): Timestamps, secondary metadata, helper text below form fields.
- **Mono** (regular 400, 0.8125rem / 13px, line-height 1.6): Technical strings: IDs, file paths, config values, query strings.

**The Scale Constraint Rule.** No fluid (`clamp()`) typography. This is a product UI used at consistent DPI. Fixed rem values only. A heading that shrinks inside a sidebar is not responsive design.

**The One Family Rule.** No display fonts, no decorative pairing. Inter carries every role. Weight contrast (400 to 600) and size contrast (12px to 20px) are the hierarchy tools.

## 4. Elevation

Warden uses a **three-tier tonal system** as the foundation, augmented by a teal ambient glow in dark mode for card surfaces.

In dark mode, cards do not use generic drop shadows. Each shadow is constructed from teal ambient light diffusing outward from the card surface, plus a depth anchor that restores physical distance. The exact multi-layer values below are calibrated against Console Black (#0f172a) as the floor; changing the floor color requires recalibrating shadow opacities proportionally.

In light mode, tonal separation (floor to panel) carries the hierarchy alone. Shadows are structural and minimal.

### Shadow Vocabulary
- **Card default (dark):** `inset 0 0 0 1px rgba(13,148,136,0.24), 0 0 0 1px rgba(13,148,136,0.08), 0 4px 24px rgba(13,148,136,0.10), 0 1px 6px rgba(0,0,0,0.55)`. Subtle teal edge highlight, diffuse ambient glow, depth anchor.
- **Card outlined (dark):** `inset 0 0 0 1px rgba(13,148,136,0.18), 0 4px 24px rgba(13,148,136,0.08), 0 1px 6px rgba(0,0,0,0.50)`. Lighter teal edge for bordered containers.
- **Card elevated (dark):** `inset 0 0 0 1px rgba(13,148,136,0.35), 0 0 0 1px rgba(13,148,136,0.14), 0 10px 48px rgba(13,148,136,0.16), 0 3px 12px rgba(0,0,0,0.70)`. Strong teal edge, wide ambient, deep drop. For modals, popovers, command palettes.
- **Card default (light):** None. Tonal layering (Cool White → Panel Light) provides hierarchy.
- **Card outlined (light):** `0 1px 4px rgba(0,0,0,0.06)`. Minimal structural shadow.
- **Card elevated (light):** `0 4px 24px rgba(0,0,0,0.10)`. Standard floating panel.

**The Teal Glow Rule.** The ambient glow is calibrated to Console Black (#0f172a). Never increase teal opacity beyond the elevated card values; above that threshold, the glow reads as a rendering artifact, not an elevation signal.

**The Flat-By-Default Rule.** Surfaces are flat at rest in light mode. Shadows appear as structural differentiation or state response, never decoration.

## 5. Components

Confident and minimal. Clear affordances, stripped-back surfaces, full state vocabulary on every interactive element.

### Buttons
- **Shape:** Gently rounded (4px / `--radius-sm`). Suggests a control, not a pill or a block.
- **Primary:** Operative Teal fill (#0d9488), On Primary text, `px-4 py-2` (16px / 8px), medium 500. Hover: Live Teal (#14b8a6). Active: Pressed Teal (#10a596). Focus: the global ring.
- **Secondary:** Panel surface background, primary text color, 1px border (`--color-border`). Hover shifts background one tier down (surface-bg), creating a visible contrast change without color shift.
- **Danger:** Critical Red (#dc2626) fill, white text. Same shape and padding as primary.
- **Disabled:** All variants at 40% opacity, `cursor: not-allowed`. No hover response.
- **Loading:** Label replaced by "Loading..." with a 16px inline spinner. Dimensions held constant to prevent CLS.
- **Size variants:** sm (`px-3 py-1.5`, 14px text), md (`px-4 py-2`, 16px text), lg (`px-6 py-3`, 18px text). At least 44px tall below `sm`.
- **Focus, everywhere:** one global `:focus-visible` ring, 2px at primary color with a 2px offset. Components do not restyle it.

### Badges
- **Shape:** Full pill (9999px). The pill shape distinguishes read-only status from interactive buttons.
- **Status formula:** 10% opacity fill, 20% opacity border, full-opacity text — applied consistently across all variants (primary, success, warning, error, info). Consistent transparency formula; no ad-hoc alpha values.
- **Prohibited as interactive.** Badges are read-only status indicators. If it needs a click handler, use a button or a 4px-radius chip with `aria-pressed`, as the schedule presets do.

### Cards
- **Corner style:** Gently rounded (8px / `--radius-md`). Larger than buttons to suggest a container.
- **Background:** Panel Slate (`--color-surface-panel`) in dark mode; Panel Light in light mode. One tier above the floor.
- **Variants:**
  - **Default:** Transparent border, teal ambient shadow in dark mode, flat in light mode.
  - **Outlined:** Explicit border (teal at 25% opacity in dark mode, `--color-border` in light). Used when edge definition matters more than depth.
  - **Elevated:** Strong teal glow + deep depth shadow. Floating panels, dialogs, prominent containers.
- **Internal padding:** `md` (16px) as default. `sm` (12px) for compact data cards. `lg` (24px) for forms and detail panels.
- **Sub-components:** `Card.Header` and `Card.Footer` use the divider token (not the border token) to separate from body content. Always use `Card.Content` for body when header or footer slots are present.

### Inputs / Fields
- **Style:** the `.field` class. 1px border (`--color-border-input`), surface-bg background, 4px radius (`--radius-sm`). Inter 14px regular; 16px and at least 44px tall below `sm`, which also stops iOS zooming.
- **Focus:** Border shifts to `--color-primary`, with the global ring.
- **Label:** Inter 14px medium, positioned above the field. Helper text at 12px muted below.
- **No floating labels.** Fixed labels above the field always. Floating labels fail at 120% zoom and obscure state.

### Navigation (Sidebar)
- **Background:** Panel Slate (`--color-surface-panel`), right border at `--color-border`.
- **Items:** Inter 14px medium, `px-3 py-2.5`, 4px radius. 20×20 icon + text label.
- **Active:** Operative Teal fill, On Primary text. The only sidebar surface where teal appears at full fill opacity.
- **Inactive hover:** Surface-bg background, primary text color. Subtle shift without color introduction.
- **Width:** 220px (`--layout-sidebar-width`), fixed.

### Navigation (Phone)
- `AppLayout` mounts one bottom bar on every screen below `md`, from the same scope-filtered items as the sidebar: the main pages as tabs, the configuration pages and Sign out under More.

### Async states
- **One pattern:** `AsyncBoundary` for every load. Loading shows skeleton rows, a failure is an alert naming the data with a Retry, and empty is `EmptyState`. A failure never reads as empty, and loading never shows an empty state.
- **Mutations:** a failure shows an inline `role="alert"` at its source and keeps the input; the action shows a pending state; a successful create is confirmed.
- **Destructive actions** state a count before they can be confirmed: disabled until it arrives, and a failed count blocks with a retry.

### Tables and rows
- One convention for Automations, System and Runs: a panel with a `text-xs` medium muted header in sentence case, divider-separated rows, and always-visible actions with 16px icons and labels naming the row. Below the layout's breakpoint, cells stack with their own labels and nothing scrolls sideways.

## 6. Do's and Don'ts

### Do:
- **Do** use teal exclusively for primary actions, active selections, and live status indicators.
- **Do** use the three-tier surface system (bg / panel / elevated) as the primary hierarchy tool. Every container belongs to one tier.
- **Do** use the exact shadow vocabulary from Section 4. The multi-layer teal glow is calibrated; substituting generic drop shadows breaks the elevation language.
- **Do** keep Inter as the sole UI typeface. Weight and size contrast create hierarchy; additional fonts add noise.
- **Do** cap prose line length at 65–75ch. Dense data views may run longer; descriptions and help text must not.
- **Do** make every surface fully operable at 400px, because a phone is the owner's primary device.
- **Do** include all six states on every interactive component: default, hover, focus, active, disabled, loading.
- **Do** use `cursor: not-allowed` and 40% opacity for disabled states on every component variant.
- **Do** verify contrast for every new surface-text pairing. The minimum: 4.5:1 for body text, 3:1 for large or bold text and interactive elements.

### Don't:
- **Don't** use a cream, sand, or warm-neutral body background. This is the most common AI-generated aesthetic of 2025-2026 and reads immediately as generic. The floor is Console Black in dark mode, Cool White in light mode.
- **Don't** model the visual identity on Sonarr, Radarr, or any Servarr app. Warden is not a Servarr app; it has no arr suffix, no arr inheritance, and no obligation to inherit arr design patterns.
- **Don't** build a monitoring dashboard. No metric-hero cards (big number, small label, gradient accent), no chart-heavy grid layouts. Warden is a task automation tool, not Grafana.
- **Don't** use gradient text (`background-clip: text` with a gradient). Prohibited. Solid teal or solid white only.
- **Don't** use side-stripe accents (`border-left` or `border-right` greater than 1px in a brand color). Use full borders, background tints, or status badges instead.
- **Don't** use display or decorative fonts in UI labels, buttons, nav items, or table cells. Inter only.
- **Don't** apply teal as a background fill to more than 10% of screen area at rest. The active sidebar item is the permitted use case; anything broader dilutes the signal.
- **Don't** default to modals. Inline editing, contextual side panels, and progressive disclosure are almost always the better pattern. A modal is a last resort.
- **Don't** animate layout properties (`width`, `height`, `padding`, `margin`). All state transitions use only `background-color`, `color`, `opacity`, `transform`, and `box-shadow`. 150ms duration on all, and none under `prefers-reduced-motion`, where skeletons hold their base colour and spinners hold a still arc.
- **Don't** gate content visibility on entrance animations. Animations are additive enhancement; content must be visible by default.
