import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import auth from '@react-native-firebase/auth';
import storage from '@react-native-firebase/storage';
import firestore from '@react-native-firebase/firestore';
import { errorCode, friendlyError, isRetryable, paths } from '@siteflow/shared';

// Photos waiting to upload. Kept on the phone until they are safely on the server.
// Each photo has a fixed file name, so a retry after a half-finished attempt reuses the
// uploaded file instead of creating a duplicate. One bad photo no longer blocks the rest.
const KEY = 'siteflow:photoQueue';
const MAX_ATTEMPTS = 8;
const listeners = new Set();
let current = null; // the upload run in progress, if any
let state = { waiting: 0, failed: 0 };

async function readQueue() {
  try { return JSON.parse(await AsyncStorage.getItem(KEY)) || []; } catch { return []; }
}
async function writeQueue(q) {
  await AsyncStorage.setItem(KEY, JSON.stringify(q));
  state = { waiting: q.filter((x) => !x.failed).length, failed: q.filter((x) => x.failed).length };
  listeners.forEach((l) => l(state));
}

export function subscribePhotos(fn) {
  listeners.add(fn); fn(state);
  readQueue().then(writeQueue);
  return () => listeners.delete(fn);
}

export async function enqueuePhotos(items) {
  if (!items.length) return;
  const q = await readQueue();
  const stamp = Date.now();
  await writeQueue([...q, ...items.map((it) => ({ ...it, id: `${it.reportId}-${it.n}-${stamp}`, attempts: 0 }))]);
  processQueue().catch((e) => console.warn('Photo queue run failed', e));
}

async function uploadOne(item) {
  const ref = storage().ref(paths.photo(item.cid, item.sid, item.reportId, `${item.id}.jpg`));
  // Already uploaded on an earlier attempt? Use it (the rules don't allow overwriting).
  let url = await ref.getDownloadURL().catch(() => null);
  if (!url) {
    await ref.putFile(item.uri, { contentType: 'image/jpeg' });
    url = await ref.getDownloadURL();
  }
  await firestore().doc(paths.subDoc(item.cid, item.sid, 'reports', item.reportId))
    .update({ photos: firestore.FieldValue.arrayUnion(url) });
}

// Uploads the signed-in user's queued photos. Connection problems are retried later;
// a photo that can't ever succeed (file gone, no permission) is marked failed and kept
// so the user can see it and decide. Calling it during a run returns that run.
export function processQueue() {
  if (!current) current = runQueue().finally(() => { current = null; });
  return current;
}

async function runQueue() {
  const net = await NetInfo.fetch();
  const uid = auth().currentUser?.uid;
  if (!net.isConnected || !uid) return;
  const tried = new Set();
  // Re-read each time so photos queued during this run are picked up too
  for (;;) {
    const item = (await readQueue()).find((x) => !x.failed && !tried.has(x.id) && (!x.uid || x.uid === uid));
    if (!item) return;
    tried.add(item.id);
    let update = null; // null = uploaded, remove from the queue
    try {
      await uploadOne(item);
    } catch (e) {
      const attempts = (item.attempts || 0) + 1;
      const missingFile = errorCode(e) === 'file-not-found' || /ENOENT|no such file/i.test(String(e?.message));
      const giveUp = missingFile || !isRetryable(e) || attempts >= MAX_ATTEMPTS;
      console.warn('Photo upload failed', giveUp ? '(stopped)' : '(will retry)', e);
      update = { ...item, attempts, failed: giveUp, error: missingFile ? 'The photo file is no longer on this phone.' : friendlyError(e) };
    }
    const q = await readQueue();
    await writeQueue(update ? q.map((x) => (x.id === item.id ? update : x)) : q.filter((x) => x.id !== item.id));
  }
}

export async function retryFailedPhotos() {
  const q = await readQueue();
  await writeQueue(q.map((x) => (x.failed ? { ...x, failed: false, attempts: 0 } : x)));
  return processQueue();
}

export async function discardFailedPhotos() {
  await writeQueue((await readQueue()).filter((x) => !x.failed));
}

// Call once at app start. Returns an unsubscribe function.
export function startUploadQueue() {
  const run = () => processQueue().catch((e) => console.warn('Photo queue run failed', e));
  run();
  const unNet = NetInfo.addEventListener((s) => { if (s.isConnected) run(); });
  const unAuth = auth().onAuthStateChanged(run);
  return () => { unNet(); unAuth(); };
}
