// SiteFlow's design tokens: one source for the web app (styles.css custom properties, checked
// by a test) and the mobile app (theme.js). Change a colour here and in styles.css together.
//
// The look: site-office plain. Light grey ground, steel blue for actions, hazard-tape yellow as
// the brand mark and "current" marker, and green / amber / red only for status.

export const COLORS = {
  bg: '#EEF0EE', surface: '#FFFFFF', sunk: '#F5F6F5', ink: '#1D262A', muted: '#5E6A6F', line: '#D3D8D6',
  steel: '#2F4A57', steelInk: '#FFFFFF', tape: '#F2B705', tapeDark: '#1D262A',
  ok: '#2E7D4F', okbg: '#E3F0E7', bad: '#B7352A', badbg: '#F8E4E1', warn: '#8A6400', warnbg: '#FBF0CC',
} as const;

export const COLORS_DARK = {
  ...COLORS,
  bg: '#141A1D', surface: '#1D2529', sunk: '#182024', ink: '#E4E9E9', muted: '#9BA7AB', line: '#2F3B40',
  steel: '#8DB3C4', steelInk: '#10181B', ok: '#6CC08E', okbg: '#1B3125', bad: '#EC8175', badbg: '#3A1F1C', warn: '#E9C45A', warnbg: '#3A3114',
} as const;

export type ColorName = keyof typeof COLORS;

// Spacing steps (px / dp), corner radii and the smallest comfortable touch target
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const RADIUS = { sm: 4, md: 6, lg: 8, card: 10, pill: 20 } as const;
export const TOUCH_MIN = 48; // Android's recommended minimum; also covers iOS's 44pt

// Status colours, so a "late", "over budget" or "critical" looks the same everywhere
export const TONES = {
  ok: { fg: 'ok', bg: 'okbg' }, warn: { fg: 'warn', bg: 'warnbg' }, bad: { fg: 'bad', bg: 'badbg' }, neutral: { fg: 'ink', bg: 'sunk' },
} as const satisfies Record<string, { fg: ColorName; bg: ColorName }>;
export type Tone = keyof typeof TONES;
