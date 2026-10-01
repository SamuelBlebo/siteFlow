import {
  collection, collectionGroup, doc, getDoc, increment, query, serverTimestamp, setDoc, updateDoc, where, orderBy, limit, writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { paths, reportDoc, reportId, siteFields, stockDelta, todayKey, timeHM } from '@siteflow/shared';
import { resizePhoto } from './photos';

// ---------- references (all paths come from @siteflow/shared) ----------
export const userDoc = (uid) => doc(db, paths.user(uid));
export const usersCol = () => collection(db, paths.users());
export const companyDoc = (cid) => doc(db, paths.company(cid));
export const sitesCol = (cid) => collection(db, paths.sites(cid));
export const siteDoc = (cid, sid) => doc(db, paths.site(cid, sid));
export const sub = (cid, sid, name) => collection(db, paths.sub(cid, sid, name));
export const subDoc = (cid, sid, name, id) => doc(db, paths.subDoc(cid, sid, name, id));
export const financeDoc = (cid, sid) => doc(db, paths.finance(cid, sid));
export const attendanceDoc = (cid, sid, date = todayKey()) => doc(db, paths.attendance(cid, sid, date));
export const todayLogsQuery = (cid, sid) => query(sub(cid, sid, 'materialLogs'), where('date', '==', todayKey()));
// Reports for one site, newest first (from = oldest date to include)
export const siteReportsQuery = (cid, sid, n = 30, from = '') =>
  query(sub(cid, sid, 'reports'), ...(from ? [where('date', '>=', from)] : []), orderBy('date', 'desc'), limit(n));
// Reports across the company (roles that see every site). Uses the collection-group indexes.
export function companyReportsQuery(cid, { siteId = '', author = '', from = '', to = '' } = {}, n = 50) {
  const c = [where('companyId', '==', cid)];
  if (siteId) c.push(where('siteId', '==', siteId));
  if (author) c.push(where('createdBy', '==', author));
  if (from) c.push(where('date', '>=', from));
  if (to) c.push(where('date', '<=', to));
  return query(collectionGroup(db, 'reports'), ...c, orderBy('date', 'desc'), limit(n));
}
export const reportRef = (cid, sid, rid) => doc(db, paths.subDoc(cid, sid, 'reports', rid));
export const expensesQuery = (cid, sid) => query(sub(cid, sid, 'expenses'), orderBy('createdAt', 'desc'), limit(50));
export const teamQuery = (cid) => query(usersCol(), where('companyId', '==', cid));
export const activityQuery = (cid, n = 20) => query(collection(db, paths.activity(cid)), orderBy('at', 'desc'), limit(n));

// ---------- account and company ----------
export const updateMyProfile = (uid, { name, phone }) => updateDoc(userDoc(uid), { name, phone, updatedAt: serverTimestamp() });
export const clearMustChangePassword = (uid) => updateDoc(userDoc(uid), { mustChangePassword: false, updatedAt: serverTimestamp() });
export const updateCompany = (cid, { name, phone, location }) => updateDoc(companyDoc(cid), { name, phone, location, updatedAt: serverTimestamp() });

// ---------- writes ----------
// Each returns the Firestore promise. Wrap calls in save() from ./save so failures reach the user.

// Site details and its money live in separate documents (site teams can't read the money).
// input: validated siteInput
export function createSite(cid, { budget, ...details }) {
  const b = writeBatch(db);
  const siteRef = doc(sitesCol(cid));
  b.set(siteRef, { ...siteFields(details), progress: 0, status: 'active', lastReportDate: null, createdAt: serverTimestamp() });
  b.set(financeDoc(cid, siteRef.id), { budget, spent: 0, updatedAt: serverTimestamp() });
  return { id: siteRef.id, done: b.commit() };
}

// input: validated siteDetailsInput
export const updateSiteDetails = (cid, sid, details) => updateDoc(siteDoc(cid, sid), { ...siteFields(details), updatedAt: serverTimestamp() });
export const setSiteStatus = (cid, sid, status) => updateDoc(siteDoc(cid, sid), { status, updatedAt: serverTimestamp() });
export const setBudget = (cid, sid, budget) => updateDoc(financeDoc(cid, sid), { budget, updatedAt: serverTimestamp() });

export const addMaterial = (cid, sid, m) => setDoc(doc(sub(cid, sid, 'materials')), { ...m, createdAt: serverTimestamp() });

// Worker details are visible to the site team; the daily rate goes to workerPay (finance roles only)
export function addWorker(cid, sid, { name, trade, dailyRate }, uid) {
  const b = writeBatch(db);
  const w = doc(sub(cid, sid, 'workers'));
  b.set(w, { name, trade, active: true, createdBy: uid, createdAt: serverTimestamp() });
  if (dailyRate > 0) b.set(doc(db, paths.workerPay(cid, sid, w.id)), { dailyRate, updatedAt: serverTimestamp() });
  return b.commit();
}

// Log entry and stock change go in one batch; the rules check they match.
// A delivery cost (finance roles only) also records an expense and adds to spent.
export function logMaterial(cid, sid, { material, type, qty, cost = 0, supplier = '', uid }) {
  const b = writeBatch(db);
  const date = todayKey();
  const logRef = doc(sub(cid, sid, 'materialLogs'));
  b.set(logRef, {
    materialId: material.id, materialName: material.name, unit: material.unit,
    type, qty, cost, supplier, date, createdBy: uid, createdAt: serverTimestamp(),
  });
  b.update(subDoc(cid, sid, 'materials', material.id), { stock: increment(stockDelta({ type, qty })), lastLogId: logRef.id });
  if (type === 'delivery' && cost > 0) {
    b.set(doc(sub(cid, sid, 'expenses')), {
      date, category: 'Materials', amount: cost, createdBy: uid, createdAt: serverTimestamp(),
      note: `${material.name}, ${qty} ${material.unit}${supplier ? ` from ${supplier}` : ''}`,
    });
    b.update(financeDoc(cid, sid), { spent: increment(cost), updatedAt: serverTimestamp() });
  }
  return b.commit();
}

export function addExpense(cid, sid, { category, note, amount, uid }) {
  const b = writeBatch(db);
  b.set(doc(sub(cid, sid, 'expenses')), { date: todayKey(), category, note, amount, createdBy: uid, createdAt: serverTimestamp() });
  b.update(financeDoc(cid, sid), { spent: increment(amount), updatedAt: serverTimestamp() });
  return b.commit();
}

// Marks one worker. Merging per worker means two people marking at once don't overwrite each other.
export function markAttendance(cid, sid, { workerId, present, uid }) {
  const date = todayKey();
  return setDoc(attendanceDoc(cid, sid, date), {
    date, present: { [workerId]: present }, markedBy: uid, updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Photos are resized on the device, then stored under the report's id
export async function uploadPhotos(cid, sid, rid, files) {
  const urls = [];
  for (const [i, original] of files.entries()) {
    const f = await resizePhoto(original);
    const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const r = ref(storage, paths.photo(cid, sid, rid, `${i + 1}-${Date.now()}.${ext}`));
    await uploadBytes(r, f, { contentType: f.type || 'image/jpeg' });
    urls.push(await getDownloadURL(r));
  }
  return urls;
}

// Today's report for this person on this site (one per person per day)
export const myReportId = (uid, date = todayKey()) => reportId(date, uid);

// Writes the report and moves the site's stage/progress on, in one batch.
// site: the site document (for its name and current last report date)
export function sendReport(cid, site, input, { uid, name, photos = [], materials = [], date = todayKey(), time = timeHM() }) {
  const b = writeBatch(db);
  const rid = reportId(date, uid);
  b.set(reportRef(cid, site.id, rid), {
    ...reportDoc(input, { companyId: cid, siteId: site.id, siteName: site.name, date, time, uid, name, photos, materials, source: 'web' }),
    createdAt: serverTimestamp(),
  });
  // Only move the site forward: an older report never overwrites a newer one
  if (!site.lastReportDate || date >= site.lastReportDate) {
    b.update(siteDoc(cid, site.id), { stage: input.stage, progress: input.progress, lastReportDate: date, lastReportTime: time });
  }
  return { id: rid, done: b.commit() };
}

export const reportExists = async (cid, sid, rid) => (await getDoc(reportRef(cid, sid, rid))).exists();
