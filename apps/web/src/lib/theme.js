import { useEffect, useState } from 'react';

// Light, dark (night) or follow the device. Kept on this browser only. The stylesheet does the rest:
// data-theme="dark" or "light" on <html> wins over the device setting; no attribute follows the device.
const KEY = 'siteflow.theme';
export const THEMES = [['system', 'Same as device'], ['light', 'Light'], ['dark', 'Dark']];

export function getTheme() {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}

export function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  // The browser's own controls (scrollbars, date pickers) follow too
  root.style.colorScheme = t === 'system' ? 'light dark' : t;
}

// The current theme, kept in step across tabs
export function useTheme() {
  const [theme, setThemeState] = useState(getTheme);
  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) { const t = getTheme(); setThemeState(t); applyTheme(t); } };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const setTheme = (t) => {
    try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* private window: this visit only */ }
    applyTheme(t);
    setThemeState(t);
  };
  return [theme, setTheme];
}
