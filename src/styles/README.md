# Styles

Global styles, Tailwind configuration, and the theme system.

## Architecture overview

The theme uses a **three-layer model** with a single source of truth. Every hex
value is defined exactly once — in `theme.ts` — and everything downstream
derives from it automatically.

```
src/styles/theme.ts          ← single source of truth for all colours
tailwind.config.js           ← consumes theme.ts; injects CSS vars via plugin
src/styles/globals.css       ← zero hex values; structural rules only
```

---

## Layer 1 — Primitive palette (`palette`)

Raw hex values, organised by colour family, with a full **50–950** range in 50-step
increments. This is the only place a hex value ever appears in the codebase.

```ts
// theme.ts
export const palette = {
  teal:  { 50: '#f0fdfa', …, 600: '#0d9488', …, 950: '#042f2e' },
  red:   { 50: '#fef2f2', …, 950: '#450a0a' },
  slate: { 50: '#f8fafc', …, 950: '#020617' },
  gray:  { 50: '#f9fafb', …, 950: '#030712' },
};
```

**Rule:** never write a hex colour outside of `palette`. Everything else
references a key here.

---

## Layer 2 — Semantic tokens (`semanticTokens`)

Maps design *intent* → primitive palette reference. No hex values appear here.

```ts
// theme.ts
export const semanticTokens = {
  primary:       palette.teal[600],   // ← change the shade here only
  primaryHover:  palette.teal[500],
  border:        palette.slate[200],
  borderDark:    palette.slate[800],
  // …
};
```

`cssVarMap` and `cssVarMapDark` translate these tokens into the CSS variable
names consumed by the browser:

```ts
export const cssVarMap = {
  '--color-primary':   semanticTokens.primary,   // '#0d9488'
  '--color-border':    semanticTokens.border,     // '#e2e8f0'
  // …
};

export const cssVarMapDark = {
  '--color-surface-bg': semanticTokens.surfaceBgDark,  // '#020617'
  '--color-border':     semanticTokens.borderDark,     // '#1e293b'
  // …
};
```

**To rebrand:** change one line in `semanticTokens`. All CSS variables, Tailwind
utilities, and dark-mode overrides update automatically.

---

## Layer 3 — Tailwind colours (`themeColors`)

Spread into `tailwind.config.js` to expose both primitive *and* semantic
utilities. Semantic entries point at CSS variables so they flip between light
and dark automatically.

```ts
export const themeColors = {
  // Primitive scales → bg-teal-500, text-slate-900, …
  teal:  palette.teal,
  slate: palette.slate,

  // Semantic utilities → bg-primary, text-text-muted, bg-surface-bg, …
  primary: { DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)', text: 'rgb(var(--color-primary-text) / <alpha-value>)' },
  surface: { bg: 'rgb(var(--color-surface-bg) / <alpha-value>)', panel: 'rgb(var(--color-surface-panel) / <alpha-value>)' },
  text:    { primary: 'rgb(var(--color-text-primary) / <alpha-value>)', muted: 'rgb(var(--color-text-muted) / <alpha-value>)' },
  border:  { DEFAULT: 'rgb(var(--color-border) / <alpha-value>)' },
};
```

---

## How CSS variables are injected

`tailwind.config.js` uses a Tailwind `addBase` plugin to emit the `:root` and
`.dark` blocks at build time — sourced entirely from `theme.ts`. `globals.css`
never declares a custom property or hex value itself.

```js
// tailwind.config.js  (simplified)
const { themeColors, cssVarMap, cssVarMapDark } = require('./src/styles/theme');

module.exports = {
  theme: { extend: { colors: { ...themeColors } } },
  plugins: [
    function ({ addBase }) {
      addBase({
        ':root': cssVarMap,    // light-mode CSS vars
        '.dark': cssVarMapDark // dark-mode overrides
      });
    },
  ],
};
```

The output injected into `@layer base` looks like:

```css
/* generated — do not edit directly */
:root {
  --color-primary:        #0d9488; /* palette.teal[600]  */
  --color-surface-bg:     #f8fafc; /* palette.slate[50]  */
}
.dark {
  --color-surface-bg:     #020617; /* palette.slate[950] */
}
```

---

## Usage in components

```tsx
// Semantic utilities — theme-aware, flip automatically in dark mode
<div className="bg-surface-bg text-text-primary border border-border" />
<button className="bg-primary hover:bg-primary-hover text-on-primary" />
<div className="bg-danger/10 text-danger-text" /> // opacity modifiers work on every semantic colour

// Raw CSS composes the channel variables
// color: rgb(var(--color-text-muted)); background: rgb(var(--color-danger) / 0.1);

// Primitive utilities — for one-off overrides against the palette
<span className="text-teal-400" />
```

---

## Customising the theme

| What you want to change | Where to change it |
|---|---|
| A colour value (e.g. teal-600) | `palette` in `theme.ts` |
| Which shade is "primary" | `semanticTokens` in `theme.ts` |
| A new semantic token | Add to `semanticTokens`, `cssVarMap`/`cssVarMapDark`, and `themeColors` |
| A new primitive family | Add to `palette` and `themeColors` |
| Dark-mode override for a token | Add to `cssVarMapDark` |

**Never** edit generated values in `globals.css`. **Never** write a hex value
outside of `palette` in `theme.ts`.
