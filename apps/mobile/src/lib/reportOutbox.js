import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  PHOTO_THUMB_PX, PHOTO_THUMB_QUALITY, REPORT_PHOTO_MAX_PX, REPORT_PHOTO_QUALITY, errorCode, friendlyError, isRetryable, issueDoc, paths, reportDoc, reportId, thumbName, timeHM, todayKey,
} from '@siteflow/shared';

// Daily reports and issues leave the phone through this outbox (item.kind 'report' or 'issue').
//  1. Send: the report and its photos (resized, copied into the app's own storage, which the
//     phone does not clear) are saved on the phone straight away. Works with no signal.
//  2. When there is signal: photos upload (fixed names, so a retry reuses what already
//     uploaded), then the report is written once. Its id is {date}_{uid}, so a retry can never
//     create a second copy, and a report already on the server is recognised as sent.
//  3. Connection problems are retried. Anything else (no permission, site closed) marks the
//     report failed, keeps it, and shows it with Retry and Delete. Nothing is dropped silently.
const KEY = 'siteflow:reportOutbox';
const DIR = `${FileSystem.documentDirectory}report-photos/`;
const KEEP_SENT = 20;          // sent reports kept on the phone for the history list
const STEP_TIMEOUT_MS = 30000; // a stalled connection counts as a connection problem
const listeners = new Set();
let items = [];
let loaded = null;
let current = null;

const exists = (snap) => (typeof snap.exists === 'function' ? snap.exists() : !!snap.exists);
const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(items));
function emit() { listeners.forEach((l) => l(items)); }
async function load() {
  if (!loaded) loaded = (async () => { try { items = JSON.parse(await AsyncStorage.getItem(KEY)) || []; } catch { items = []; } emit(); })();
  return loaded;
}
async function update(id, patch) {
  items = items.map((x) => (x.id === id ? { ...x, ...patch } : x));
  await persist();
  emit();
}
const withTimeout = (p) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Timed out'), { code: 'deadline-exceeded' })), STEP_TIMEOUT_MS))]);

export async function subscribeOutbox(fn) {
  listeners.add(fn);
  await load();
  fn(items);
  return () => listeners.delete(fn);
}
export const getOutbox = () => items;
export const outboxKey = (sid, uid, date = todayKey()) => `${sid}/${reportId(date, uid)}`;

// Shrinks so the long edge is at most maxPx (portrait photos too). Null if it can't.
async function shrink(uri, size, maxPx, quality) {
  const resize = size?.width && size?.height
    ? (size.width >= size.height ? { width: Math.min(maxPx, size.width) } : { height: Math.min(maxPx, size.height) })
    : { width: maxPx };
  return ImageManipulator.manipulateAsync(uri, [{ resize }], { compress: quality, format: ImageManipulator.SaveFormat.JPEG }).catch(() => null);
}

// Resize and keep a private copy of each photo (so clearing the camera cache can't lose it),
// plus a small copy for lists, so the office's report list doesn't download every full photo
async function keepPhoto(uri, name) {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  const size = await ImageManipulator.manipulateAsync(uri, []).catch(() => null);
  const small = (await shrink(uri, size, REPORT_PHOTO_MAX_PX, REPORT_PHOTO_QUALITY)) || { uri };
  const local = `${DIR}${name}`;
  await FileSystem.copyAsync({ from: small.uri, to: local });
  const thumb = await shrink(uri, size, PHOTO_THUMB_PX, PHOTO_THUMB_QUALITY);
  let thumbLocal = null;
  if (thumb) {
    thumbLocal = `${DIR}${thumbName(name)}`;
    await FileSystem.copyAsync({ from: thumb.uri, to: thumbLocal }).catch(() => { thumbLocal = null; });
  }
  return { local, thumbLocal, url: null, thumb: null };
}

// Save a report on the phone and start sending it. input: validated reportInput.
export async function queueReport({ cid, site, uid, name, input, materials = [], photoUris = [] }) {
  await load();
  const date = todayKey();
  const id = outboxKey(site.id, uid, date);
  const existing = items.find((x) => x.id === id);
  if (existing && existing.status !== 'failed') {
    throw Object.assign(new Error('Already saved'), { code: 'already-exists' });
  }
  const rid = reportId(date, uid);
  const photos = [];
  for (const [i, uri] of photoUris.entries()) photos.push(await keepPhoto(uri, `${rid}-${i + 1}.jpg`));
  const item = {
    kind: 'report', label: `Daily report for ${site.name} (${date})`,
    id, rid, cid, sid: site.id, siteName: site.name, uid, name, date, time: timeHM(), input, materials, photos,
    status: 'waiting', attempts: 0, error: '', queuedAt: Date.now(),
  };
  items = [item, ...items.filter((x) => x.id !== id)];
  await persist();
  emit();
  processOutbox().catch((e) => console.warn('Outbox run failed', e));
  return item;
}

// Save an issue on the phone and start sending it. input: validated issueInput (without photos).
// The issue id is made on the phone, so a retry writes the same issue instead of a second one.
export async function queueIssue({ cid, site, uid, name, input, photoUris = [] }) {
  await load();
  const issueId = firestore().collection(paths.sub(cid, site.id, 'issues')).doc().id;
  const photos = [];
  for (const [i, uri] of photoUris.entries()) photos.push(await keepPhoto(uri, `issue-${issueId}-${i + 1}.jpg`));
  const item = {
    kind: 'issue', label: `Issue "${input.title}"`,
    id: `${site.id}/issue/${issueId}`, issueId, cid, sid: site.id, siteName: site.name, uid, name, date: todayKey(), input, photos,
    status: 'waiting', attempts: 0, error: '', queuedAt: Date.now(),
  };
  items = [item, ...items];
  await persist();
  emit();
  processOutbox().catch((e) => console.warn('Outbox run failed', e));
  return item;
}

// Uploads a file unless it is already there (fixed names, so an earlier upload is reused)
async function uploadOnce(path, local) {
  const ref = storage().ref(path);
  const url = await ref.getDownloadURL().catch(() => null);
  if (url) return url;
  await withTimeout(ref.putFile(local, { contentType: 'image/jpeg' }));
  return withTimeout(ref.getDownloadURL());
}

// Uploads an item's photos (and their small copies) that aren't up yet.
// Returns matching lists of links: { urls, thumbs } ('' where there is no small copy).
async function uploadPhotos(item, pathFor) {
  const photos = [...item.photos];
  for (const [i, p] of photos.entries()) {
    let { url, thumb } = p;
    if (!url) {
      const info = await FileSystem.getInfoAsync(p.local);
      if (!info.exists) throw Object.assign(new Error('Photo file missing'), { code: 'photo-missing' });
      url = await uploadOnce(pathFor(i), p.local);
    }
    // The small copy is a nice-to-have: if its file is gone, the list shows the full photo instead
    if (!thumb && p.thumbLocal && (await FileSystem.getInfoAsync(p.thumbLocal)).exists) {
      thumb = await uploadOnce(thumbName(pathFor(i)), p.thumbLocal);
    }
    if (url !== p.url || thumb !== p.thumb) {
      photos[i] = { ...p, url, thumb: thumb || null };
      await update(item.id, { photos }); // remember progress in case the app closes
    }
  }
  return { urls: photos.map((p) => p.url), thumbs: photos.map((p) => p.thumb || '') };
}

async function sendIssue(item) {
  const issuePath = paths.subDoc(item.cid, item.sid, 'issues', item.issueId);
  const already = await withTimeout(firestore().doc(issuePath).get({ source: 'server' }));
  if (exists(already)) return;
  const { urls: photos, thumbs } = await uploadPhotos(item, (i) => paths.issuePhoto(item.cid, item.sid, item.issueId, `${i + 1}.jpg`));
  const profile = await withTimeout(firestore().doc(paths.user(item.uid)).get({ source: 'server' }));
  const site = await withTimeout(firestore().doc(paths.site(item.cid, item.sid)).get({ source: 'server' }));
  const now = firestore.FieldValue.serverTimestamp();
  await withTimeout(firestore().doc(issuePath).set({
    ...issueDoc(item.input, {
      companyId: item.cid, siteId: item.sid, siteName: site.data()?.name || item.siteName, uid: item.uid,
      name: profile.data()?.name || item.name, photos, thumbs, date: item.date,
    }),
    createdAt: now, updatedAt: now, lastActivityAt: now,
  }));
}

async function sendOne(item) {
  if (item.kind === 'issue') return sendIssue(item);
  const reportPath = paths.subDoc(item.cid, item.sid, 'reports', item.rid);
  // Already on the server (an earlier attempt got through before the connection dropped)?
  const already = await withTimeout(firestore().doc(reportPath).get({ source: 'server' }));
  if (exists(already)) return;

  const { urls: photoUrls, thumbs } = await uploadPhotos(item, (i) => paths.photo(item.cid, item.sid, item.rid, `${i + 1}.jpg`));

  // The rules check the author name against the profile, so use the current one
  const profile = await withTimeout(firestore().doc(paths.user(item.uid)).get({ source: 'server' }));
  const name = profile.data()?.name || item.name;
  const site = await withTimeout(firestore().doc(paths.site(item.cid, item.sid)).get({ source: 'server' }));
  const last = site.data()?.lastReportDate;
  // A site with milestones takes its progress from them, not from reports
  const ms = await withTimeout(firestore().collection(paths.sub(item.cid, item.sid, 'milestones')).limit(1).get({ source: 'server' }));
  const fromMilestones = !ms.empty;
  const input = fromMilestones ? { ...item.input, progress: site.data()?.progress || 0 } : item.input;

  const b = firestore().batch();
  b.set(firestore().doc(reportPath), {
    ...reportDoc(input, {
      companyId: item.cid, siteId: item.sid, siteName: site.data()?.name || item.siteName, date: item.date, time: item.time,
      uid: item.uid, name, role: profile.data()?.role, email: profile.data()?.email || '', photos: photoUrls, thumbs, materials: item.materials, source: 'app',
    }),
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  // Only move the site forward: a report sent late never overwrites a newer one
  if (!last || item.date >= last) {
    b.update(firestore().doc(paths.site(item.cid, item.sid)), {
      stage: input.stage, ...(fromMilestones ? {} : { progress: input.progress }), lastReportDate: item.date, lastReportTime: item.time,
    });
  }
  await withTimeout(b.commit());
}

async function removePhotos(item) {
  for (const p of item.photos || []) {
    for (const file of [p.local, p.thumbLocal].filter(Boolean)) await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
  }
}

// Photo files no report or issue on the phone refers to any more (the app closed between
// copying a photo and saving the item, or a deleted item). Only this app's own folder is touched.
export async function cleanPhotos() {
  await load();
  const keep = new Set(items.flatMap((x) => (x.status === 'sent' ? [] : (x.photos || []).flatMap((p) => [p.local, p.thumbLocal].filter(Boolean)))));
  const names = await FileSystem.readDirectoryAsync(DIR).catch(() => []);
  let removed = 0;
  for (const n of names) {
    if (keep.has(`${DIR}${n}`)) continue;
    // A photo copied in the last few minutes may belong to a report being saved right now
    const info = await FileSystem.getInfoAsync(`${DIR}${n}`).catch(() => null);
    if (!info?.exists || (info.modificationTime || 0) * 1000 > Date.now() - 10 * 60 * 1000) continue;
    await FileSystem.deleteAsync(`${DIR}${n}`, { idempotent: true }).catch(() => {});
    removed++;
  }
  return removed;
}

async function runOutbox() {
  await load();
  const net = await NetInfo.fetch();
  const uid = auth().currentUser?.uid;
  if (!net.isConnected || net.isInternetReachable === false || !uid) return;
  const tried = new Set();
  for (;;) {
    const item = items.find((x) => x.status === 'waiting' && x.uid === uid && !tried.has(x.id));
    if (!item) break;
    tried.add(item.id);
    await update(item.id, { status: 'sending' });
    try {
      await sendOne(items.find((x) => x.id === item.id));
      await update(item.id, { status: 'sent', sentAt: Date.now(), error: '' });
      await removePhotos(item);
    } catch (e) {
      console.warn('Report not sent yet', e);
      const missing = errorCode(e) === 'photo-missing';
      const retry = !missing && isRetryable(e);
      await update(item.id, {
        status: retry ? 'waiting' : 'failed',
        attempts: (item.attempts || 0) + 1,
        error: missing ? 'A photo is no longer on this phone. Delete this and send it again.' : friendlyError(e),
      });
    }
  }
  // Keep only the most recent sent reports on the phone
  const sent = items.filter((x) => x.status === 'sent').sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
  if (sent.length > KEEP_SENT) {
    const drop = new Set(sent.slice(KEEP_SENT).map((x) => x.id));
    items = items.filter((x) => !drop.has(x.id));
    await persist();
    emit();
  }
}

// Calling it during a run returns that run
export function processOutbox() {
  if (!current) current = runOutbox().finally(() => { current = null; });
  return current;
}

export async function retryReport(id) {
  await load();
  await update(id, { status: 'waiting', error: '' });
  return processOutbox();
}

// Only for reports that failed: removes the report and its photos from the phone
export async function deleteReport(id) {
  await load();
  const item = items.find((x) => x.id === id);
  if (!item || item.status !== 'failed') return;
  await removePhotos(item);
  items = items.filter((x) => x.id !== id);
  await persist();
  emit();
}

// Call once at app start: sends when signal returns, when the app comes back to the
// foreground and after sign-in. Returns an unsubscribe function.
export function startOutbox() {
  const run = () => processOutbox().catch((e) => console.warn('Outbox run failed', e));
  // A report caught mid-send when the app was closed goes back to waiting
  load().then(async () => {
    for (const x of items.filter((i) => i.status === 'sending')) await update(x.id, { status: 'waiting' });
    run();
    cleanPhotos().catch((e) => console.warn('Photo clean-up failed', e));
  });
  const unNet = NetInfo.addEventListener((s) => { if (s.isConnected) run(); });
  const unAuth = auth().onAuthStateChanged(run);
  const app = AppState.addEventListener('change', (s) => { if (s === 'active') run(); });
  return () => { unNet(); unAuth(); app.remove(); };
}
