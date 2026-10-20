import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLORS, COLORS_DARK, DEFAULT_SKIN, SKINS } from '../src';

// The web app's CSS custom properties must match the shared tokens (the mobile app imports them)
const css = readFileSync(new URL('../../../apps/web/src/styles.css', import.meta.url), 'utf8');
const cssName = (k: string) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
function block(start: string) {
  const i = css.indexOf(start);
  return css.slice(i, css.indexOf('}', i));
}
const value = (src: string, k: string) => src.match(new RegExp(`${cssName(k)}:[ ]*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase();

describe('design tokens', () => {
  it('light colours match the web stylesheet', () => {
    const root = block(':root {');
    for (const [k, v] of Object.entries(COLORS)) expect(value(root, k), k).toBe(v.toUpperCase());
  });
  it('dark colours match the web stylesheet', () => {
    const dark = block(':root:not([data-theme="light"])');
    for (const [k, v] of Object.entries(COLORS_DARK)) {
      if (v === COLORS[k as keyof typeof COLORS]) continue; // unchanged in dark mode
      expect(value(dark, k), k).toBe(v.toUpperCase());
    }
  });
  it('every skin matches the web stylesheet, light and dark', () => {
    for (const [name, skin] of Object.entries(SKINS)) {
      if (name === DEFAULT_SKIN) {
        // The default skin is the stylesheet's own accent
        for (const [k, v] of Object.entries(skin.light)) expect(COLORS[k as keyof typeof COLORS], k).toBe(v);
        for (const [k, v] of Object.entries(skin.dark)) expect(COLORS_DARK[k as keyof typeof COLORS_DARK], k).toBe(v);
        continue;
      }
      const light = block(`:root[data-skin="${name}"] {`);
      const dark = block(`:root[data-skin="${name}"][data-theme="dark"] {`);
      const auto = block(`:root[data-skin="${name}"]:not([data-theme="light"]) {`);
      for (const [k, v] of Object.entries(skin.light)) expect(value(light, k), `${name} ${k}`).toBe(v.toUpperCase());
      for (const [k, v] of Object.entries(skin.dark)) {
        expect(value(dark, k), `${name} dark ${k}`).toBe(v.toUpperCase());
        expect(value(auto, k), `${name} auto-dark ${k}`).toBe(v.toUpperCase());
      }
    }
  });
});
