import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { friendlyError } from '@siteflow/shared';

// Tracks every write the app makes.
// Firestore applies writes on the phone straight away (so the app works offline) and
// confirms them with the server later. If the server rejects one, it would otherwise
// vanish from the screen with no warning. Here it is kept, with the data that was
// entered, shown to the user, and can be retried or dismissed.
//
// Limitation (addressed in the offline stage): a write still waiting for signal when the
// app is closed is resent by Firestore on next start, but a rejection at that point is
// not tracked here.

const KEY = 'siteflow:failedWrites';
const MAX_FAILED = 50;
const listeners = new Set();
const ops = {};
let state = { online: true, pending: 0, failed: [] };
let loaded = false;

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}
const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(state.failed)).catch((e) => console.warn('Could not store failed writes', e));

export function subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export const getSyncState = () => state;

// db.js registers its write functions so a failed write can be run again by name
export function registerOps(map) { Object.assign(ops, map); }

export async function startSync() {
  if (!loaded) {
    loaded = true;
    try { emit({ failed: JSON.parse(await AsyncStorage.getItem(KEY)) || [] }); } catch { /* start empty */ }
  }
  return NetInfo.addEventListener((s) => emit({ online: !!s.isConnected }));
}

// promise: the Firestore write. op/args: how to run it again. label: what the user did.
export function track(promise, { label, op, args }) {
  emit({ pending: state.pending + 1 });
  promise
    .catch((e) => {
      console.warn(`${label} failed`, e);
      const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label, message: friendlyError(e), op, args, at: Date.now() };
      emit({ failed: [item, ...state.failed].slice(0, MAX_FAILED) });
      persist();
    })
    .finally(() => emit({ pending: Math.max(0, state.pending - 1) }));
  return promise;
}

export function retry(id) {
  const item = state.failed.find((f) => f.id === id);
  if (!item) return;
  dismiss(id);
  const fn = ops[item.op];
  if (!fn) return console.warn('No way to retry', item.op);
  fn(...item.args);
}

export function dismiss(id) {
  emit({ failed: state.failed.filter((f) => f.id !== id) });
  persist();
}
