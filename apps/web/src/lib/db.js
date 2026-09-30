import {
  addDoc, collection, doc, increment, query, serverTimestamp, setDoc, where, orderBy, limit, writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { todayKey, timeHM } from '@siteflow/shared';

// ---------- paths ----------
export const sitesCol = (cid) => collection(db, 'companies', cid, 'sites');
export const siteDoc = (cid, sid) => doc(db, 'companies', cid, 'sites', sid);
export const sub = (cid, sid, name) => collection(db, 'companies', cid, 'sites', sid, name);
export const todayLogsQuery = (cid, sid) => query(sub(cid, sid, 'materialLogs'), where('date', '==', todayKey()));
export const reportsQuery = (cid, sid) => query(sub(cid, sid, 'reports'), orderBy('createdAt', 'desc'), limit(30));
export const expensesQuery = (cid, sid) => query(sub(cid, sid, 'expenses'), orderBy('createdAt', 'desc'), limit(50));
export const attendanceDoc = (cid, sid, date = todayKey()) => doc(db, 'companies', cid, 'sites', sid, 'attendance', date);

// Offline-friendly: when offline, Firestore applies the write locally and syncs later,
// but the promise only resolves once the server confirms. Don't block the UI on that.
export const commit = (p) => (navigator.onLine ? p : (p.catch(console.error), Promise.resolve()));

// ---------- writes ----------
export const createSite = (cid, data) =>
  addDoc(sitesCol(cid), { ...data, spent: 0, progress: 0, status: 'active', lastReportDate: null, createdAt: serverTimestamp() });

export const addMaterial = (cid, sid, m) => addDoc(sub(cid, sid, 'materials'), { ...m, createdAt: serverTimestamp() });

export const addWorker = (cid, sid, w, uid) =>
  addDoc(sub(cid, sid, 'workers'), { ...w, active: true, createdBy: uid, createdAt: serverTimestamp() });

export function logMaterial(cid, sid, { material, type, qty, cost = 0, supplier = '', uid }) {
  const b = writeBatch(db);
  const date = todayKey();
  b.set(doc(sub(cid, sid, 'materialLogs')), {
    materialId: material.id, materialName: material.name, unit: material.unit,
    type, qty, cost, supplier, date, createdBy: uid, createdAt: serverTimestamp(),
  });
  b.update(doc(sub(cid, sid, 'materials'), material.id), { stock: increment(type === 'usage' ? -qty : qty) });
  if (type === 'delivery' && cost > 0) {
    b.set(doc(sub(cid, sid, 'expenses')), {
      date, category: 'Materials', amount: cost, createdBy: uid, createdAt: serverTimestamp(),
      note: `${material.name}, ${qty} ${material.unit}${supplier ? ` from ${supplier}` : ''}`,
    });
    b.update(siteDoc(cid, sid), { spent: increment(cost) });
  }
  return b.commit();
}

export function addExpense(cid, sid, { category, note, amount, uid }) {
  const b = writeBatch(db);
  b.set(doc(sub(cid, sid, 'expenses')), { date: todayKey(), category, note, amount, createdBy: uid, createdAt: serverTimestamp() });
  b.update(siteDoc(cid, sid), { spent: increment(amount) });
  return b.commit();
}

export function saveAttendance(cid, sid, { present, workers, uid }) {
  const date = todayKey();
  const wages = workers.filter((w) => present[w.id]).reduce((s, w) => s + (w.dailyRate || 0), 0);
  const count = Object.values(present).filter(Boolean).length;
  return setDoc(attendanceDoc(cid, sid, date), { date, present, count, wages, markedBy: uid, updatedAt: serverTimestamp() });
}

export async function uploadPhotos(cid, sid, files) {
  const urls = [];
  for (const f of files) {
    const r = ref(storage, `companies/${cid}/sites/${sid}/reports/${todayKey()}/${Date.now()}-${f.name}`);
    await uploadBytes(r, f, { contentType: f.type });
    urls.push(await getDownloadURL(r));
  }
  return urls;
}

export function sendReport(cid, sid, { text, stage, progress, issues, photos, workersPresent, uid, name }) {
  const b = writeBatch(db);
  const date = todayKey();
  const time = timeHM();
  b.set(doc(sub(cid, sid, 'reports')), {
    date, time, text, stage, progress, issues, photos, workersPresent,
    createdBy: uid, createdByName: name, createdAt: serverTimestamp(),
  });
  b.update(siteDoc(cid, sid), { stage, progress, lastReportDate: date, lastReportTime: time });
  return b.commit();
}
