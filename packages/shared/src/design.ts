// SiteFlow's design tokens: one source for the web app (styles.css custom properties, checked
// by a test) and the mobile app (theme.js). Change a colour here and in styles.css together.
//
// The look (from the product prototype): cool light-grey ground, a navy sidebar and headers,
// the yellow-and-black hazard-tape logo mark, brass gold for the main call to action and "you are here", navy-steel for
// links and secondary actions, and green / amber / red only for status.

export const COLORS = {
  bg: '#F2F4F5', surface: '#FFFFFF', sunk: '#F7F8F9', ink: '#0E1A22', muted: '#5F6D77', line: '#E1E6E9',
  steel: '#18303F', steelInk: '#FFFFFF',
  navy: '#0F1D27', navy2: '#18303F', onNavy: '#E9EEF1', onNavyMuted: '#93A6B3',
  brass: '#B98D45', brassInk: '#FFFFFF', brassSoft: '#F4EBDB',
  tape: '#F2B705', tapeDark: '#1D262A', // the logo mark (same in dark mode)
  ok: '#1E7A55', okbg: '#E2F2EA', bad: '#B3372B', badbg: '#F9E6E3', warn: '#8F6310', warnbg: '#FAF0D9',
} as const;

export const COLORS_DARK = {
  ...COLORS,
  bg: '#0A1318', surface: '#101C23', sunk: '#0D171D', ink: '#E7ECEE', muted: '#8B9AA3', line: '#1E2D36',
  steel: '#A9C3D1', steelInk: '#0A1318', navy: '#07111A', navy2: '#132634',
  brass: '#D1A866', brassInk: '#0A1318', brassSoft: '#2B2416',
  ok: '#5CC596', okbg: '#12291F', bad: '#EE8A7E', badbg: '#321A17', warn: '#E4BC62', warnbg: '#2E2513',
} as const;

export type ColorName = keyof typeof COLORS;

// Spacing steps (px / dp), corner radii and the smallest comfortable touch target
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const RADIUS = { sm: 6, md: 9, lg: 12, card: 14, pill: 999 } as const;
export const TOUCH_MIN = 48; // Android's recommended minimum; also covers iOS's 44pt

// Status colours, so a "late", "over budget" or "critical" looks the same everywhere
export const TONES = {
  ok: { fg: 'ok', bg: 'okbg' }, warn: { fg: 'warn', bg: 'warnbg' }, bad: { fg: 'bad', bg: 'badbg' }, neutral: { fg: 'ink', bg: 'sunk' },
} as const satisfies Record<string, { fg: ColorName; bg: ColorName }>;
export type Tone = keyof typeof TONES;
