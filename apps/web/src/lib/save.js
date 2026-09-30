import { friendlyError } from '@siteflow/shared';

// Every write goes through save(). Firestore resolves a write only when the server
// confirms it, and while offline it applies the change locally and waits.
//  - Online: we wait (up to QUEUE_AFTER_MS). If it fails, save() throws a friendly
//    message so the form can keep what the user typed and show the error.
//  - Offline or slow: the change is kept locally and save() returns { queued: true }.
//    If the server later rejects it, the failure is shown as a toast. Nothing fails silently.

const QUEUE_AFTER_MS = 10000;
const listeners = new Set();
let state = { pending: 0, toasts: [] };
let nextId = 1;

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}
export function subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export const getState = () => state;

export function toast(message, kind = 'ok', { sticky = kind === 'err' } = {}) {
  const id = nextId++;
  emit({ toasts: [...state.toasts, { id, message, kind }] });
  if (!sticky) setTimeout(() => dismiss(id), 5000);
  return id;
}
export const dismiss = (id) => emit({ toasts: state.toasts.filter((t) => t.id !== id) });

export class SaveError extends Error {}

export async function save(promise, label = 'Your change') {
  emit({ pending: state.pending + 1 });
  let confirmed = false;
  const tracked = promise.then((v) => { confirmed = true; return v; })
    .finally(() => emit({ pending: Math.max(0, state.pending - 1) }));

  const waitLimit = navigator.onLine ? QUEUE_AFTER_MS : 0;
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('queued'), waitLimit); });
  try {
    const r = await Promise.race([tracked, timeout]);
    if (r !== 'queued' || confirmed) return { queued: false };
  } catch (e) {
    console.error(`${label} failed`, e);
    throw new SaveError(friendlyError(e));
  } finally {
    clearTimeout(timer);
  }
  // Queued: report a later failure instead of dropping it
  tracked.catch((e) => {
    console.error(`${label} failed after syncing`, e);
    toast(`${label} could not be saved. ${friendlyError(e)}`, 'err');
  });
  return { queued: true };
}

// For forms: the message to show after a successful save
export const savedText = (res, what) => (res.queued ? `${what} saved on this device. It will sync when you're back online.` : `${what} saved.`);
