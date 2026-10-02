import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { errorCode, friendlyError, isRetryable } from '@siteflow/shared';

// The write journal: how the phone makes sure a change it saved reaches the office.
//
// Firestore applies a write on the phone straight away (so the app works offline) and sends it
// when there is signal. On its own, a write that the server refuses after the app was closed and
// reopened would vanish without a word. So every change is first written to this journal (on the
// phone's storage), then sent. It leaves the journal only once the server has confirmed it.
//
//  - Confirmed: removed.
//  - Refused (no permission, invalid): kept as failed, with the data and a plain message, until the
//    person taps Try again or Dismiss.
//  - Still unconfirmed when the app starts again: once there is signal, the app waits for
//    Firestore's own queue to finish, then checks on the server whether the change is there.
//    If it is, done. If not, it is shown as failed with Try again.
//
// Each change carries fixed ids made on the phone, and Try again checks the server first, so
// retrying can never record something twice.
//
// Reports and issues with photos go through the report outbox instead (reportOutbox.js).

const KEY = 'siteflow:journal';
const OLD_KEY = 'siteflow:failedWrites';
const MAX = 200;
const WAIT_MS = 20000;
const listeners = new Set();
const ops = {};
const checks = {};
const inFlight = new Set(); // entries sent in this session and not yet answered
let entries = [];
let state = { online: true, pending: 0, failed: [], syncing: false, lastSyncedAt: null };
let loaded = null;
let reconciling = null;

function publish(patch = {}) {
  state = {
    ...state, ...patch,
    pending: entries.filter((e) => e.status === 'pending').length,
    failed: entries.filter((e) => e.status === 'failed'),
  };
  listeners.forEach((l) => l(state));
}
const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(entries)).catch((e) => console.warn('Could not save the journal', e));

async function load() {
  if (!loaded) loaded = (async () => {
    try { entries = JSON.parse(await AsyncStorage.getItem(KEY)) || []; } catch { entries = []; }
    // Failures kept by the older tracker carry over
    try {
      const old = JSON.parse(await AsyncStorage.getItem(OLD_KEY)) || [];
      if (old.length) {
        entries = [...entries, ...old.map((f) => ({ ...f, status: 'failed' }))];
        await AsyncStorage.removeItem(OLD_KEY);
        await persist();
      }
    } catch { /* nothing to carry over */ }
    publish();
  })();
  return loaded;
}

export function subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export const getSyncState = () => state;
export const getJournal = () => entries;

// db.js registers each write by name: how to run it again, and how to check it reached the server
export function registerOps(map) { Object.assign(ops, map); }
export function registerChecks(map) { Object.assign(checks, map); }

async function setEntry(id, patch) {
  entries = patch === null ? entries.filter((e) => e.id !== id) : entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
  await persist();
  publish();
}

// Records a change in the journal, then sends it. run() returns the Firestore write.
// refused: the message to show when the rules turn it down, where a likelier reason than
// "no permission" is known (say, someone else changed the same record first).
export async function journaled({ label, op, args, refused }, run) {
  await load();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  entries = [...entries, { id, label, op, args, status: 'pending', at: Date.now() }].slice(-MAX);
  await persist();
  publish();
  inFlight.add(id);
  try {
    const result = await run();
    await setEntry(id, null);
    publish({ lastSyncedAt: Date.now() });
    return result;
  } catch (e) {
    console.warn(`${label} failed`, e);
    // Connection problems stay pending (checked again later); anything else is a real refusal
    const message = refused && errorCode(e) === 'permission-denied' ? refused : friendlyError(e);
    await setEntry(id, isRetryable(e) ? { status: 'pending' } : { status: 'failed', message });
    throw e;
  } finally {
    inFlight.delete(id);
  }
}

async function isApplied(e) {
  const check = checks[e.op];
  if (!check) return false;
  try { return !!(await check(...e.args)); } catch (err) { console.warn('Could not check', e.label, err); return null; }
}

// Settles changes left unconfirmed (from an earlier session, or after a dropped connection)
async function runReconcile() {
  await load();
  const waiting = entries.filter((e) => e.status === 'pending' && !inFlight.has(e.id));
  if (!waiting.length) return;
  publish({ syncing: true });
  try {
    // Let Firestore finish sending what it still has queued
    await Promise.race([firestore().waitForPendingWrites(), new Promise((r) => setTimeout(r, WAIT_MS))]);
    for (const e of waiting) {
      const applied = await isApplied(e);
      if (applied === null) continue; // no signal after all: try later
      await setEntry(e.id, applied ? null : { status: 'failed', message: 'This change did not reach the office. Tap Try again to send it.' });
    }
    publish({ lastSyncedAt: Date.now() });
  } finally {
    publish({ syncing: false });
  }
}
export function reconcile() {
  if (!reconciling) reconciling = runReconcile().finally(() => { reconciling = null; });
  return reconciling;
}

// Try again: if the change turns out to be on the server already, it is just cleared
export async function retry(id) {
  const e = entries.find((x) => x.id === id);
  if (!e) return;
  if (await isApplied(e)) return setEntry(id, null);
  await setEntry(id, null);
  const fn = ops[e.op];
  if (!fn) return console.warn('No way to retry', e.op);
  try { await fn(...e.args); } catch { /* the new attempt is in the journal with its own result */ }
}

export async function retryAll() {
  for (const e of [...state.failed]) await retry(e.id);
}

export function dismiss(id) { return setEntry(id, null); }

// Call once at app start. Watches the connection and the app returning to the front.
export async function startSync() {
  await load();
  const onNet = (s) => {
    const online = !!s.isConnected && s.isInternetReachable !== false;
    publish({ online });
    if (online) reconcile().catch((e) => console.warn('Sync check failed', e));
  };
  const unNet = NetInfo.addEventListener(onNet);
  const app = AppState.addEventListener('change', (s) => { if (s === 'active') reconcile().catch(() => {}); });
  NetInfo.fetch().then(onNet).catch(() => {});
  return () => { unNet(); app.remove(); };
}
