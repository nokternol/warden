// src/styles/theme.ts
// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — Primitive palette (single source of truth for raw hex values)
// Full 50–950 range. Every other layer references these by key, never by hex.
// ─────────────────────────────────────────────────────────────────────────────
export const palette = {
  teal: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    150: '#b2f5ea',
    200: '#99f6e4',
    250: '#72edda',
    300: '#5eead4',
    350: '#45e1c8',
    400: '#2dd4bf',
    450: '#1fc8b2',
    500: '#14b8a6',
    550: '#10a596',
    600: '#0d9488',
    650: '#0c8278',
    700: '#0f766e',
    750: '#0e6b64',
    800: '#115e59',
    850: '#0f524e',
    900: '#134e4a',
    950: '#042f2e',
  },
  red: {
    50: '#fef2f2',
    100: '#fee2e2',
    150: '#fecaca',
    200: '#fca5a5',
    250: '#f87474',
    300: '#fca5a5',
    350: '#f87171',
    400: '#f87171',
    450: '#f35f5f',
    500: '#ef4444',
    550: '#e53535',
    600: '#dc2626',
    650: '#cc2222',
    700: '#b91c1c',
    750: '#a81919',
    800: '#991b1b',
    850: '#8a1818',
    900: '#7f1d1d',
    950: '#450a0a',
  },
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    150: '#eaf0f6',
    200: '#e2e8f0',
    250: '#d4dde8',
    300: '#cbd5e1',
    350: '#b3bfcf',
    400: '#94a3b8',
    450: '#7d8fa3',
    500: '#64748b',
    550: '#566679',
    600: '#475569',
    650: '#3d4a5c',
    700: '#334155',
    750: '#2a3546',
    800: '#1e293b',
    850: '#172032',
    900: '#0f172a',
    950: '#020617',
  },
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    150: '#eaecf0',
    200: '#e5e7eb',
    250: '#d8dbe1',
    300: '#d1d5db',
    350: '#b8bdc7',
    400: '#9ca3af',
    450: '#838a96',
    500: '#6b7280',
    550: '#5a6270',
    600: '#4b5563',
    650: '#404855',
    700: '#374151',
    750: '#2d3644',
    800: '#1f2937',
    850: '#18202e',
    900: '#111827',
    950: '#030712',
  },
  // Status colour primitives: a lighter step for dark surfaces, a darker one for light surfaces.
  emerald: {
    500: '#10b981',
    800: '#065f46',
  },
  amber: {
    500: '#f59e0b',
    800: '#92400e',
  },
  blue: {
    400: '#60a5fa',
    700: '#1d4ed8',
  },
  white: '#ffffff',
  black: '#000000',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — Semantic token definitions
// Maps intent → primitive. This is the single place where you change "which
// shade of teal is primary" — everything else follows automatically.
// These are consumed by globals.css (via the exported cssVarMap) and by
// Tailwind (via the themeColors export below).
// ─────────────────────────────────────────────────────────────────────────────
export const semanticTokens = {
  // Primary brand fill. Text on it is `onPrimary`, never white: white reaches only 3.74:1.
  primary: palette.teal[600],
  primaryHover: palette.teal[500],
  primaryActive: palette.teal[550],
  onPrimary: palette.slate[900],
  // Teal as text or an icon on a surface; the fill colour is too dark on the panel.
  primaryText: palette.teal[800],
  primaryTextDark: palette.teal[500],

  // Danger fill for destructive actions. Hover and active darken because white text must hold 4.5:1.
  danger: palette.red[600],
  dangerHover: palette.red[700],
  dangerActive: palette.red[800],
  onDanger: palette.white,
  // Danger as text on a surface or a danger tint.
  dangerText: palette.red[800],
  dangerTextDark: palette.red[300],

  // Backdrop behind dialogs, and the shadow under poster badges.
  scrim: palette.black,

  // Surface (light)
  surfaceBg: palette.slate[50],
  surfacePanel: palette.slate[150],

  // Surface (dark) — overridden in .dark via CSS vars
  surfaceBgDark: palette.slate[900],
  surfacePanelDark: palette.slate[800],
  // Third elevation level for modals / dropdowns / tooltips
  surfaceElevatedDark: palette.slate[750],

  // Hover surface for elements resting on surface-panel
  surfaceHover: palette.slate[50], // light: step toward the bg
  surfaceHoverDark: palette.slate[900], // dark: dip to the floor

  // Text (light)
  textPrimary: palette.slate[900],
  textSecondary: palette.slate[700],
  textMuted: palette.slate[600],

  // Text (dark)
  textPrimaryDark: palette.slate[50],
  textSecondaryDark: palette.slate[300],
  textMutedDark: palette.slate[400],

  // Container border: decorative, because the surface tiers already separate the container.
  border: palette.slate[300],
  borderDark: palette.slate[600],

  // Input and control borders identify the control, so they hold 3:1 on every surface.
  borderInput: palette.slate[500],
  borderInputDark: palette.slate[450],

  // Rules between rows and inside cards: decorative, because content and spacing separate rows.
  borderDivider: palette.slate[300],
  borderDividerDark: palette.slate[600],

  // ── Elevation shadows — light mode ───────────────────────────────────────
  shadowSm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd: '0 4px 24px rgba(0,0,0,0.10)',
  shadowLg: '0 8px 32px rgba(0,0,0,0.14)',

  // ── Card variant shadows — light mode (no teal glow) ─────────────────────
  shadowCardDefault: 'none',
  shadowCardOutlined: '0 1px 4px rgba(0,0,0,0.06)',
  shadowCardElevated: '0 4px 24px rgba(0,0,0,0.10)',

  // ── Card variant shadows — dark mode (teal ambient glow) ─────────────────
  // Opacities are calibrated against surfaceBgDark = slate[900] (#0f172a).
  // If the background shifts lighter again, increase these proportionally.
  shadowCardDefaultDark: [
    'inset 0 0 0 1px rgb(var(--color-primary) / 0.24)', // edge
    '0 0 0 1px rgb(var(--color-primary) / 0.08)', // outer ring
    '0 4px 24px rgb(var(--color-primary) / 0.10)', // ambient
    '0 1px 6px rgba(0,0,0,0.55)', // depth
  ].join(', '),
  shadowCardOutlinedDark: [
    'inset 0 0 0 1px rgb(var(--color-primary) / 0.18)', // edge
    '0 4px 24px rgb(var(--color-primary) / 0.08)', // ambient
    '0 1px 6px rgba(0,0,0,0.50)', // depth
  ].join(', '),
  shadowCardElevatedDark: [
    'inset 0 0 0 1px rgb(var(--color-primary) / 0.35)', // edge — stronger on lighter bg
    '0 0 0 1px rgb(var(--color-primary) / 0.14)', // outer ring
    '0 10px 48px rgb(var(--color-primary) / 0.16)', // wide ambient — key for lift
    '0 3px 12px rgba(0,0,0,0.70)', // deep drop — restores depth
  ].join(', '),

  // ── Card outlined dark border ─────────────────────────────────────────────
  borderCardOutlinedDark: 'rgb(var(--color-primary) / 0.25)',

  // ── Card glass highlight (dark only) ──────────────────────────────────────
  // Slightly brighter sheen to restore perceived surface lift on lighter bg.
  cardGlassHighlight: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 55%)',

  // ── Status colours, readable as text on every surface of their theme ──────────────────────────
  colorSuccess: palette.emerald[800],
  colorWarning: palette.amber[800],
  colorInfo: palette.blue[700],
  colorSuccessDark: palette.emerald[500],
  colorWarningDark: palette.amber[500],
  colorInfoDark: palette.blue[400],

  // ── Radius ───────────────────────────────────────────────────────────────
  radiusSm: '4px', // buttons, inputs, sidebar items
  radiusMd: '8px', // cards, panels

  // ── Layout ───────────────────────────────────────────────────────────────
  layoutSidebarWidth: '220px',
  layoutContentGutter: '24px',

  // ── Transition ───────────────────────────────────────────────────────────
  transitionFast: '150ms',

  // ── Interaction states ────────────────────────────────────────────────────
  disabledOpacity: '0.4',
} as const;

/** A hex colour as the space-separated channels `rgb(var(--x) / alpha)` composes with. */
function channels(hex: string): string {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(' ');
}

// CSS variables injected by tailwind.config.js. Colour variables hold bare channels, so any
// raw CSS use is written `rgb(var(--color-x))` or `rgb(var(--color-x) / 0.1)`.
export const cssVarMap = {
  // ── Brand ────────────────────────────────────────────────────────────────
  '--color-primary': channels(semanticTokens.primary),
  '--color-primary-hover': channels(semanticTokens.primaryHover),
  '--color-primary-active': channels(semanticTokens.primaryActive),
  '--color-on-primary': channels(semanticTokens.onPrimary),
  '--color-primary-text': channels(semanticTokens.primaryText),

  // ── Danger ───────────────────────────────────────────────────────────────
  '--color-danger': channels(semanticTokens.danger),
  '--color-danger-hover': channels(semanticTokens.dangerHover),
  '--color-danger-active': channels(semanticTokens.dangerActive),
  '--color-on-danger': channels(semanticTokens.onDanger),
  '--color-danger-text': channels(semanticTokens.dangerText),

  '--color-scrim': channels(semanticTokens.scrim),

  // ── Surface ──────────────────────────────────────────────────────────────
  '--color-surface-bg': channels(semanticTokens.surfaceBg),
  '--color-surface-panel': channels(semanticTokens.surfacePanel),

  // ── Text ─────────────────────────────────────────────────────────────────
  '--color-text-primary': channels(semanticTokens.textPrimary),
  '--color-text-secondary': channels(semanticTokens.textSecondary),
  '--color-text-muted': channels(semanticTokens.textMuted),

  // ── Border ───────────────────────────────────────────────────────────────
  '--color-border': channels(semanticTokens.border),
  '--color-border-input': channels(semanticTokens.borderInput),
  '--color-divider': channels(semanticTokens.borderDivider),
  // A complete colour, not channels: it carries its own alpha in dark mode.
  '--color-border-card-outlined': 'rgb(var(--color-border))',

  // ── Elevation shadows (light mode) ───────────────────────────────────────
  '--shadow-sm': semanticTokens.shadowSm,
  '--shadow-md': semanticTokens.shadowMd,
  '--shadow-lg': semanticTokens.shadowLg,

  // ── Card shadows (light mode) ─────────────────────────────────────────────
  '--shadow-card-default': semanticTokens.shadowCardDefault,
  '--shadow-card-outlined': semanticTokens.shadowCardOutlined,
  '--shadow-card-elevated': semanticTokens.shadowCardElevated,

  // ── Card glass highlight (none in light mode) ─────────────────────────────
  '--card-glass-highlight': 'none',

  // ── Status colors ─────────────────────────────────────────────────────────
  '--color-success': channels(semanticTokens.colorSuccess),
  '--color-warning': channels(semanticTokens.colorWarning),
  '--color-info': channels(semanticTokens.colorInfo),

  // ── Elevated surface (light mode = same as panel; elevated context handled by shadow) ──
  '--color-surface-elevated': channels(semanticTokens.surfacePanel),

  // ── Hover surface for panel-level elements ────────────────────────────────
  '--color-surface-hover': channels(semanticTokens.surfaceHover),

  // ── Radius ───────────────────────────────────────────────────────────────
  '--radius-sm': semanticTokens.radiusSm,
  '--radius-md': semanticTokens.radiusMd,

  // ── Layout ───────────────────────────────────────────────────────────────
  '--layout-sidebar-width': semanticTokens.layoutSidebarWidth,
  '--layout-content-gutter': semanticTokens.layoutContentGutter,

  // ── Transition ───────────────────────────────────────────────────────────
  '--transition-fast': semanticTokens.transitionFast,

  // ── Interaction states ────────────────────────────────────────────────────
  '--state-disabled-opacity': semanticTokens.disabledOpacity,
} as const;

export const cssVarMapDark = {
  // ── Brand and danger as text ─────────────────────────────────────────────
  '--color-primary-text': channels(semanticTokens.primaryTextDark),
  '--color-danger-text': channels(semanticTokens.dangerTextDark),

  // ── Surface ──────────────────────────────────────────────────────────────
  '--color-surface-bg': channels(semanticTokens.surfaceBgDark),
  '--color-surface-panel': channels(semanticTokens.surfacePanelDark),

  // ── Text ─────────────────────────────────────────────────────────────────
  '--color-text-primary': channels(semanticTokens.textPrimaryDark),
  '--color-text-secondary': channels(semanticTokens.textSecondaryDark),
  '--color-text-muted': channels(semanticTokens.textMutedDark),

  // ── Border ───────────────────────────────────────────────────────────────
  '--color-border': channels(semanticTokens.borderDark),
  '--color-border-input': channels(semanticTokens.borderInputDark),
  '--color-divider': channels(semanticTokens.borderDividerDark),
  '--color-border-card-outlined': semanticTokens.borderCardOutlinedDark,

  // ── Status colors ─────────────────────────────────────────────────────────
  '--color-success': channels(semanticTokens.colorSuccessDark),
  '--color-warning': channels(semanticTokens.colorWarningDark),
  '--color-info': channels(semanticTokens.colorInfoDark),

  // ── Card shadows (dark mode, teal glow composed from --color-primary) ─────
  '--shadow-card-default': semanticTokens.shadowCardDefaultDark,
  '--shadow-card-outlined': semanticTokens.shadowCardOutlinedDark,
  '--shadow-card-elevated': semanticTokens.shadowCardElevatedDark,

  // ── Card glass highlight ──────────────────────────────────────────────────
  '--card-glass-highlight': semanticTokens.cardGlassHighlight,

  // ── Elevated surface (modals / dropdowns / tooltips) ─────────────────────
  '--color-surface-elevated': channels(semanticTokens.surfaceElevatedDark),

  // ── Hover surface for panel-level elements ────────────────────────────────
  '--color-surface-hover': channels(semanticTokens.surfaceHoverDark),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — Tailwind color map
// Spread into tailwind.config.js `theme.extend.colors`.
// Semantic utilities (bg-surface-bg, text-primary …) point at CSS variables so
// they automatically flip between light/dark. Primitive utilities (bg-teal-500 …)
// are also available for one-off overrides.
// ─────────────────────────────────────────────────────────────────────────────
const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

export const themeColors = {
  // Primitive scales (available as e.g. bg-teal-500, text-slate-900)
  teal: palette.teal,
  red: palette.red,
  slate: palette.slate,
  gray: palette.gray,

  // Semantic utilities: theme-aware through CSS variables, and they accept opacity modifiers.
  primary: {
    DEFAULT: token('primary'),
    hover: token('primary-hover'),
    active: token('primary-active'),
    text: token('primary-text'),
  },
  'on-primary': token('on-primary'),
  danger: {
    DEFAULT: token('danger'),
    hover: token('danger-hover'),
    active: token('danger-active'),
    text: token('danger-text'),
  },
  'on-danger': token('on-danger'),
  scrim: token('scrim'),
  surface: {
    bg: token('surface-bg'),
    panel: token('surface-panel'),
    elevated: token('surface-elevated'),
    hover: token('surface-hover'),
  },
  text: {
    primary: token('text-primary'),
    secondary: token('text-secondary'),
    muted: token('text-muted'),
  },
  border: {
    DEFAULT: token('border'),
    input: token('border-input'),
  },
  divider: token('divider'),

  // Status colors
  success: token('success'),
  warning: token('warning'),
  info: token('info'),

  // Integration partner colors (third-party brand constants, not design tokens)
  plex: {
    DEFAULT: '#e5a00d',
    hover: '#ffb40d',
    active: '#cc8f0b',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3c — Tailwind font family map
// Spread into tailwind.config.js `theme.extend.fontFamily`.
// ─────────────────────────────────────────────────────────────────────────────
export const themeFonts = {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['"JetBrains Mono"', 'monospace'],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3b — Tailwind shadow map
// Spread into tailwind.config.js `theme.extend.boxShadow`.
// Values reference CSS vars so they flip automatically between light/dark.
// ─────────────────────────────────────────────────────────────────────────────
export const themeShadows = {
  'elevation-sm': 'var(--shadow-sm)',
  'elevation-md': 'var(--shadow-md)',
  'elevation-lg': 'var(--shadow-lg)',
  card: 'var(--shadow-card-default)',
  'card-outlined': 'var(--shadow-card-outlined)',
  'card-elevated': 'var(--shadow-card-elevated)',
} as const;
