import { useEffect, useState } from 'react';
import { DEFAULT_SKIN, SKINS, isSkin } from '@siteflow/shared';
import { saveSkin } from './db';

// The person's skin (accent colour): Brass, Amber or Navy. Kept on this browser for the first paint
// and on users/{uid}.skin so it follows them to other browsers and the phone. The stylesheet does
// the rest: data-skin on <html> swaps the accent; Brass needs no attribute.
const KEY = 'siteflow.skin';
export const SKIN_LIST = Object.entries(SKINS).map(([k, s]) => [k, s.label, s.light.brass]);

export function getSkin() {
  try { const s = localStorage.getItem(KEY); return isSkin(s) ? s : DEFAULT_SKIN; } catch { return DEFAULT_SKIN; }
}

export function applySkin(s) {
  const root = document.documentElement;
  if (isSkin(s) && s !== DEFAULT_SKIN) root.dataset.skin = s; else delete root.dataset.skin;
}

// One skin for the whole tab, so the top-bar menu and the Account page stay in step
let current = getSkin();
const listeners = new Set();
function setCurrent(s) {
  if (!isSkin(s)) return;
  current = s;
  applySkin(s);
  try { if (s === DEFAULT_SKIN) localStorage.removeItem(KEY); else localStorage.setItem(KEY, s); } catch { /* private window: this visit only */ }
  listeners.forEach((fn) => fn(s));
}
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY) setCurrent(getSkin()); });

// The profile's saved skin wins once it loads (Layout calls this)
export function useProfileSkin(saved) {
  useEffect(() => { if (isSkin(saved) && saved !== current) setCurrent(saved); }, [saved]);
}

// The current skin; changing it saves to the profile too
export function useSkin(uid) {
  const [skin, setSkinState] = useState(current);
  useEffect(() => { listeners.add(setSkinState); setSkinState(current); return () => listeners.delete(setSkinState); }, []);
  const setSkin = (s) => {
    setCurrent(s);
    return uid ? saveSkin(uid, s) : Promise.resolve();
  };
  return [skin, setSkin];
}
