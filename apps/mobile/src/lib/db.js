import firestore from '@react-native-firebase/firestore';
import { paths, stockDelta, todayKey } from '@siteflow/shared';
import { registerOps, track } from './sync';

// Firestore keeps working offline on React Native Firebase: writes apply on the phone
// instantly and sync when the signal returns. Every write goes through track() so a
// rejected one is kept and shown instead of disappearing. All paths come from shared.
const now = () => firestore.FieldValue.serverTimestamp();
const inc = (n) => firestore.FieldValue.increment(n);

export const exists = (snap) => (typeof snap.exists === 'function' ? snap.exists() : snap.exists);
export const toList = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
export const userRef = (uid) => firestore().doc(paths.user(uid));
export const companyRef = (cid) => firestore().doc(paths.company(cid));
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
  const { material, type, qty, cost = 0, supplier = '', ref = '', note = '', uid, name, date = todayKey() } = input;
  const b = firestore().batch();
  const logRef = sub(cid, sid, 'materialLogs').doc();
  b.set(logRef, {
    materialId: material.id, materialName: material.name, unit: material.unit,
    type, qty, cost, supplier, ref, note, date, createdBy: uid, createdByName: name, createdAt: now(),
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

// Marks one or more workers for a day ({ workerId: 'present' | 'late' | 'absent' | 'leave' }).
// Merged per worker, so two phones marking different workers never overwrite each other.
export function markAttendance(cid, sid, input) {
  const { marks, label = 'Attendance', uid, date = todayKey() } = input;
  return track(attendanceRef(cid, sid, date).set({ date, marks, markedBy: uid, updatedAt: now() }, { merge: true }), {
    label, op: 'markAttendance', args: [cid, sid, { ...input, date }],
  });
}
export const attendanceRangeQuery = (cid, sid, from, to) =>
  sub(cid, sid, 'attendance').where('date', '>=', from).where('date', '<=', to).orderBy('date', 'desc');

// Pay goes to workerPay, which only finance roles may write
export function addWorker(cid, sid, input) {
  const { name, trade, phone = '', dailyRate = 0, uid } = input;
  const b = firestore().batch();
  const w = sub(cid, sid, 'workers').doc();
  b.set(w, { name, trade, phone, active: true, createdBy: uid, createdAt: now() });
  if (dailyRate > 0) b.set(firestore().doc(paths.workerPay(cid, sid, w.id)), { dailyRate, updatedAt: now() });
  return track(b.commit(), { label: `New worker ${name}`, op: 'addWorker', args: [cid, sid, input] });
}

// The site team can fix a worker's name, trade and phone
export function updateWorker(cid, sid, input) {
  const { id, name, trade, phone = '' } = input;
  return track(subRef(cid, sid, 'workers', id).update({ name, trade, phone, updatedAt: now() }), {
    label: `Changes to ${name}`, op: 'updateWorker', args: [cid, sid, input],
  });
}

// Daily reports are sent through the report outbox (reportOutbox.js), not here
export const reportRef = (cid, sid, rid) => firestore().doc(paths.subDoc(cid, sid, 'reports', rid));
export const siteReportsQuery = (cid, sid, n = 10) => sub(cid, sid, 'reports').orderBy('date', 'desc').limit(n);

registerOps({ logMaterial, markAttendance, addWorker, updateWorker });
