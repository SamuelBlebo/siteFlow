import firestore from '@react-native-firebase/firestore';
import { todayKey, timeHM } from '@siteflow/shared';
import { enqueuePhotos } from './uploadQueue';

// Firestore keeps working offline by default on React Native Firebase.
// Writes apply to the local cache instantly and sync when the signal returns,
// so we never await commit() in the UI; we just catch errors.
const now = () => firestore.FieldValue.serverTimestamp();
const inc = (n) => firestore.FieldValue.increment(n);
const sync = (p) => p.catch((e) => console.warn('SiteFlow sync error', e));

export const exists = (snap) => (typeof snap.exists === 'function' ? snap.exists() : snap.exists);
export const toList = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
export const siteRef = (cid, sid) => firestore().collection('companies').doc(cid).collection('sites').doc(sid);
export const sub = (cid, sid, name) => siteRef(cid, sid).collection(name);
export const userRef = (uid) => firestore().collection('users').doc(uid);
export const sitesCol = (cid) => firestore().collection('companies').doc(cid).collection('sites');

export function logMaterial(cid, sid, { material, type, qty, cost = 0, supplier = '', uid }) {
  const b = firestore().batch();
  const date = todayKey();
  b.set(sub(cid, sid, 'materialLogs').doc(), {
    materialId: material.id, materialName: material.name, unit: material.unit,
    type, qty, cost, supplier, date, createdBy: uid, createdAt: now(),
  });
  b.update(sub(cid, sid, 'materials').doc(material.id), { stock: inc(type === 'usage' ? -qty : qty) });
  if (type === 'delivery' && cost > 0) {
    b.set(sub(cid, sid, 'expenses').doc(), {
      date, category: 'Materials', amount: cost, createdBy: uid, createdAt: now(),
      note: `${material.name}, ${qty} ${material.unit}${supplier ? ` from ${supplier}` : ''}`,
    });
    b.update(siteRef(cid, sid), { spent: inc(cost) });
  }
  sync(b.commit());
}

export function saveAttendance(cid, sid, { present, workers, uid }) {
  const date = todayKey();
  const wages = workers.filter((w) => present[w.id]).reduce((s, w) => s + (w.dailyRate || 0), 0);
  const count = Object.values(present).filter(Boolean).length;
  sync(sub(cid, sid, 'attendance').doc(date).set({ date, present, count, wages, markedBy: uid, updatedAt: now() }));
}

export function addWorker(cid, sid, w, uid) {
  sync(sub(cid, sid, 'workers').add({ ...w, active: true, createdBy: uid, createdAt: now() }));
}

// Report text saves now (works offline). Photos go into a queue and upload when online.
export async function sendReport(cid, sid, { text, stage, progress, issues, photoUris, workersPresent, uid, name }) {
  const date = todayKey();
  const time = timeHM();
  const reportRef = sub(cid, sid, 'reports').doc();
  const b = firestore().batch();
  b.set(reportRef, {
    date, time, text, stage, progress, issues, photos: [], photoCount: photoUris.length,
    workersPresent, createdBy: uid, createdByName: name, createdAt: now(),
  });
  b.update(siteRef(cid, sid), { stage, progress, lastReportDate: date, lastReportTime: time });
  sync(b.commit());
  await enqueuePhotos(photoUris.map((uri) => ({ cid, sid, reportId: reportRef.id, uri })));
}
