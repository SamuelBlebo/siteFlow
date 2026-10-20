// SiteFlow's design tokens: one source for the web app (styles.css custom properties, checked
// by a test) and the mobile app (theme.js). Change a colour here and in styles.css together.
//
// The look (light, 2026-10-20): white cards on a soft warm-grey ground, a white sidebar, the
// yellow-and-black hazard-tape logo mark, and minimal colour: greys for normal things, one accent
// (the person's skin, see SKINS) for the main action and "you are here", red only for problems.
// `brass` is the accent token's name in both apps; a skin replaces brass, brassInk and brassSoft.

export const COLORS = {
  bg: '#F4F4F2', surface: '#FFFFFF', sunk: '#F6F6F4', ink: '#17191C', muted: '#5A5F64', line: '#E6E6E2',
  steel: '#2B3640', steelInk: '#FFFFFF',
  navy: '#0F1D27', navy2: '#18303F', onNavy: '#E9EEF1', onNavyMuted: '#93A6B3',
  brass: '#B98D45', brassInk: '#FFFFFF', brassSoft: '#F4EBDB',
  tape: '#F2B705', tapeDark: '#1D262A', // the logo mark (same in dark mode)
  ok: '#1E7A55', okbg: '#E2F2EA', bad: '#B3372B', badbg: '#F9E6E3', warn: '#8F6310', warnbg: '#FAF0D9',
} as const;

export const COLORS_DARK = {
  ...COLORS,
  bg: '#0E1013', surface: '#16191D', sunk: '#121417', ink: '#E9EAEB', muted: '#9AA0A6', line: '#262A2F',
  steel: '#B4BEC6', steelInk: '#0E1013', navy: '#07111A', navy2: '#132634',
  brass: '#D1A866', brassInk: '#0A1318', brassSoft: '#2B2416',
  ok: '#5CC596', okbg: '#12291F', bad: '#EE8A7E', badbg: '#321A17', warn: '#E4BC62', warnbg: '#2E2513',
} as const;

export type ColorName = keyof typeof COLORS;

// Skins: each person picks the accent colour they work in. Brass is SiteFlow's own and the default.
type Accent = { brass: string; brassInk: string; brassSoft: string };
export const SKINS = {
  brass: { label: 'Brass', light: { brass: '#B98D45', brassInk: '#FFFFFF', brassSoft: '#F4EBDB' }, dark: { brass: '#D1A866', brassInk: '#0A1318', brassSoft: '#2B2416' } },
  amber: { label: 'Amber', light: { brass: '#E8A20C', brassInk: '#1D1A10', brassSoft: '#FDF3DC' }, dark: { brass: '#F2B33D', brassInk: '#1D1A10', brassSoft: '#2E2410' } },
  navy: { label: 'Navy', light: { brass: '#18303F', brassInk: '#FFFFFF', brassSoft: '#E3EAEF' }, dark: { brass: '#A9C3D1', brassInk: '#0A1318', brassSoft: '#16252E' } },
} as const satisfies Record<string, { label: string; light: Accent; dark: Accent }>;
export type Skin = keyof typeof SKINS;
export const DEFAULT_SKIN: Skin = 'brass';
export const isSkin = (v: unknown): v is Skin => typeof v === 'string' && Object.prototype.hasOwnProperty.call(SKINS, v);

// Spacing steps (px / dp), corner radii and the smallest comfortable touch target
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const RADIUS = { sm: 6, md: 9, lg: 12, card: 14, pill: 999 } as const;
export const TOUCH_MIN = 48; // Android's recommended minimum; also covers iOS's 44pt

// Status colours, so a "late", "over budget" or "critical" looks the same everywhere
export const TONES = {
  ok: { fg: 'ok', bg: 'okbg' }, warn: { fg: 'warn', bg: 'warnbg' }, bad: { fg: 'bad', bg: 'badbg' }, neutral: { fg: 'ink', bg: 'sunk' },
} as const satisfies Record<string, { fg: ColorName; bg: ColorName }>;
export type Tone = keyof typeof TONES;
