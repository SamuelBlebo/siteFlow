import firestore from '@react-native-firebase/firestore';
import { paths, stockDelta, todayKey, timeHM } from '@siteflow/shared';
import { enqueuePhotos } from './uploadQueue';
import { registerOps, track } from './sync';

// Firestore keeps working offline on React Native Firebase: writes apply on the phone
// instantly and sync when the signal returns. Every write goes through track() so a
// rejected one is kept and shown instead of disappearing. All paths come from shared.
const now = () => firestore.FieldValue.serverTimestamp();
const inc = (n) => firestore.FieldValue.increment(n);

export const exists = (snap) => (typeof snap.exists === 'function' ? snap.exists() : snap.exists);
export const toList = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
export const userRef = (uid) => firestore().doc(paths.user(uid));
export const sitesCol = (cid) => firestore().collection(paths.sites(cid));
export const siteRef = (cid, sid) => firestore().doc(paths.site(cid, sid));
export const sub = (cid, sid, name) => firestore().collection(paths.sub(cid, sid, name));
export const subRef = (cid, sid, name, id) => firestore().doc(paths.subDoc(cid, sid, name, id));
export const financeRef = (cid, sid) => firestore().doc(paths.finance(cid, sid));
export const attendanceRef = (cid, sid, date = todayKey()) => firestore().doc(paths.attendance(cid, sid, date));
export const todayLogsQuery = (cid, sid) => sub(cid, sid, 'materialLogs').where('date', '==', todayKey());

// Log entry and stock change in one batch (the rules check they match).
// A delivery cost is only sent by finance roles; it also records an expense.
export function logMaterial(cid, sid, input) {
  const { material, type, qty, cost = 0, supplier = '', uid, date = todayKey() } = input;
  const b = firestore().batch();
  const logRef = sub(cid, sid, 'materialLogs').doc();
  b.set(logRef, {
    materialId: material.id, materialName: material.name, unit: material.unit,
    type, qty, cost, supplier, date, createdBy: uid, createdAt: now(),
  });
  b.update(subRef(cid, sid, 'materials', material.id), { stock: inc(stockDelta({ type, qty })), lastLogId: logRef.id });
  if (type === 'delivery' && cost > 0) {
    b.set(sub(cid, sid, 'expenses').doc(), {
      date, category: 'Materials', amount: cost, createdBy: uid, createdAt: now(),
      note: `${material.name}, ${qty} ${material.unit}${supplier ? ` from ${supplier}` : ''}`,
    });
    b.update(financeRef(cid, sid), { spent: inc(cost), updatedAt: now() });
  }
  return track(b.commit(), {
    label: `${material.name} ${type === 'usage' ? 'usage' : 'delivery'} (${qty} ${material.unit})`,
    op: 'logMaterial', args: [cid, sid, { ...input, date }],
  });
}

// One worker at a time, merged, so two phones marking different workers never overwrite each other
export function markAttendance(cid, sid, input) {
  const { workerId, workerName, present, uid, date = todayKey() } = input;
  return track(attendanceRef(cid, sid, date).set({ date, present: { [workerId]: present }, markedBy: uid, updatedAt: now() }, { merge: true }), {
    label: `Attendance for ${workerName || 'a worker'}`, op: 'markAttendance', args: [cid, sid, { ...input, date }],
  });
}

// Pay goes to workerPay, which only finance roles may write
export function addWorker(cid, sid, input) {
  const { name, trade, dailyRate = 0, uid } = input;
  const b = firestore().batch();
  const w = sub(cid, sid, 'workers').doc();
  b.set(w, { name, trade, active: true, createdBy: uid, createdAt: now() });
  if (dailyRate > 0) b.set(firestore().doc(paths.workerPay(cid, sid, w.id)), { dailyRate, updatedAt: now() });
  return track(b.commit(), { label: `New worker ${name}`, op: 'addWorker', args: [cid, sid, input] });
}

// Report text saves now (works offline). Photos go into a queue and upload when online.
export async function sendReport(cid, sid, input) {
  const { text, stage, progress, issues, photoUris = [], workersPresent, uid, name } = input;
  const date = input.date || todayKey();
  const time = input.time || timeHM();
  const reportId = input.reportId || sub(cid, sid, 'reports').doc().id;
  const b = firestore().batch();
  b.set(subRef(cid, sid, 'reports', reportId), {
    date, time, text, stage, progress, issues, photos: [], photoCount: photoUris.length, source: 'app',
    workersPresent, createdBy: uid, createdByName: name, createdAt: now(),
  });
  b.update(siteRef(cid, sid), { stage, progress, lastReportDate: date, lastReportTime: time });
  track(b.commit(), {
    label: `Daily report for ${date}`, op: 'sendReport',
    args: [cid, sid, { ...input, date, time, reportId, photoUris: [] }], // photos are already queued; don't queue them twice
  });
  if (photoUris.length) await enqueuePhotos(photoUris.map((uri, i) => ({ cid, sid, reportId, uri, uid, n: i + 1 })));
}

registerOps({ logMaterial, markAttendance, addWorker, sendReport });
