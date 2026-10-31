import { cssVarMap, cssVarMapDark, themeColors } from '@app/styles/theme';
import { describe, expect, it } from 'vitest';

type Rgb = [number, number, number];

const channels = (value: string): Rgb => value.split(' ').map(Number) as Rgb;

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
  fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;

const light = cssVarMap as Record<string, string>;
const dark = { ...cssVarMap, ...cssVarMapDark } as Record<string, string>;
const THEMES = [
  ['dark', (name: string) => channels(dark[name])],
  ['light', (name: string) => channels(light[name])],
] as const;

const SURFACES = ['--color-surface-bg', '--color-surface-panel', '--color-surface-elevated'];
const TEXT_ON_SURFACES = [
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-muted',
  '--color-primary-text',
  '--color-danger-text',
  '--color-success',
  '--color-warning',
  '--color-info',
];
// Status tints follow the badge formula (10%); selection and danger panels go up to 15%.
const TINTED_TEXT = [
  ['--color-primary-text', '--color-primary', 0.15],
  ['--color-danger-text', '--color-danger', 0.15],
  ['--color-success', '--color-success', 0.1],
  ['--color-warning', '--color-warning', 0.1],
  ['--color-info', '--color-info', 0.1],
] as const;

describe.each(THEMES)('%s theme contrast', (_name, token) => {
  it.each(TEXT_ON_SURFACES)('%s reaches 4.5:1 on every surface', (text) => {
    for (const surface of SURFACES) {
      expect(ratio(token(text), token(surface))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(TINTED_TEXT)('%s reaches 4.5:1 on a %s tint of the panel', (text, tint, alpha) => {
    const panel = token('--color-surface-panel');
    expect(ratio(token(text), over(token(tint), panel, alpha))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['--color-primary', '--color-primary-hover', '--color-primary-active'])(
    'on-primary text reaches 4.5:1 on %s',
    (fill) => {
      expect(ratio(token('--color-on-primary'), token(fill))).toBeGreaterThanOrEqual(4.5);
    }
  );

  it.each(['--color-danger', '--color-danger-hover', '--color-danger-active'])(
    'on-danger text reaches 4.5:1 on %s',
    (fill) => {
      expect(ratio(token('--color-on-danger'), token(fill))).toBeGreaterThanOrEqual(4.5);
    }
  );

  it('input borders and the focus ring reach 3:1 on every surface', () => {
    for (const surface of SURFACES) {
      expect(ratio(token('--color-border-input'), token(surface))).toBeGreaterThanOrEqual(3);
      expect(ratio(token('--color-primary'), token(surface))).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('theme mechanism', () => {
  it('declares semantic colours so Tailwind opacity modifiers can apply', () => {
    expect(themeColors.primary.DEFAULT).toBe('rgb(var(--color-primary) / <alpha-value>)');
    expect(themeColors.surface.panel).toBe('rgb(var(--color-surface-panel) / <alpha-value>)');
    expect(themeColors.divider).toBe('rgb(var(--color-divider) / <alpha-value>)');
  });
});
