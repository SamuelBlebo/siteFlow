import {
  collection, collectionGroup, deleteDoc, doc, getDoc, increment, query, serverTimestamp, setDoc, updateDoc, where, orderBy, limit, writeBatch,
} from 'firebase/firestore';
import { db, getStorage } from '../firebase';
import {
  countDifference, issueDoc, milestoneProgress, overallProgress, paths, reportDoc, reportId, siteFields, standardMilestones, stockDelta, thumbName, todayKey, timeHM,
} from '@siteflow/shared';
import { resizePhoto, thumbnail } from './photos';

// ---------- references (all paths come from @siteflow/shared) ----------
export const userDoc = (uid) => doc(db, paths.user(uid));
// A person's role, projects and switch in one company (one login can belong to several)
export const memberDoc = (cid, uid) => doc(db, paths.member(cid, uid));
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
export const expensesQuery = (cid, sid, from = '', n = 500) =>
  query(sub(cid, sid, 'expenses'), ...(from ? [where('date', '>=', from)] : []), orderBy('date', 'desc'), limit(n));
export const teamQuery = (cid) => collection(db, paths.members(cid));
export const activityQuery = (cid, n = 20) => query(collection(db, paths.activity(cid)), orderBy('at', 'desc'), limit(n));

// ---------- account and company ----------
// Name and phone live on the person; a Cloud Function copies them to each company they belong to
export const updateMyProfile = (uid, { name, phone }) => updateDoc(userDoc(uid), { name, phone, updatedAt: serverTimestamp() });
// Look at another company this person belongs to (the rules check they are a member)
export const switchCompany = (uid, cid) => updateDoc(userDoc(uid), { companyId: cid, updatedAt: serverTimestamp() });
export const clearMustChangePassword = (uid) => updateDoc(userDoc(uid), { mustChangePassword: false, updatedAt: serverTimestamp() });
export const updateCompany = (cid, { name, phone, location }) => updateDoc(companyDoc(cid), { name, phone, location, updatedAt: serverTimestamp() });
// Owner: country, currency and time zone (validated companyLocaleInput)
export const updateCompanyLocale = (cid, { country, currency, timeZone }) => updateDoc(companyDoc(cid), { country, currency, timeZone, updatedAt: serverTimestamp() });

// ---------- writes ----------
// Each returns the Firestore promise. Wrap calls in save() from ./save so failures reach the user.

// Site details and its money live in separate documents (site teams can't read the money).
// input: validated siteInput
export function createSite(cid, { budget, ...details }) {
  const b = writeBatch(db);
  const siteRef = doc(sitesCol(cid));
  b.set(siteRef, { ...siteFields(details), progress: 0, status: 'active', lastReportDate: null, createdAt: serverTimestamp() });
  b.set(financeDoc(cid, siteRef.id), { budget, spent: 0, updatedAt: serverTimestamp() }); // spent is kept by the server from here on
  return { id: siteRef.id, done: b.commit() };
}

// input: validated siteDetailsInput
export const updateSiteDetails = (cid, sid, details) => updateDoc(siteDoc(cid, sid), { ...siteFields(details), updatedAt: serverTimestamp() });
export const setSiteStatus = (cid, sid, status) => updateDoc(siteDoc(cid, sid), { status, updatedAt: serverTimestamp() });
// Site managers: total budget and (optionally) budget per category
export const setBudget = (cid, sid, budget, budgetByCategory) =>
  updateDoc(financeDoc(cid, sid), { budget, ...(budgetByCategory ? { budgetByCategory } : {}), updatedAt: serverTimestamp() });

export const addMaterial = (cid, sid, m) => setDoc(doc(sub(cid, sid, 'materials')), { ...m, active: true, createdAt: serverTimestamp() });

// Worker details are visible to the site team; the daily rate goes to workerPay (finance roles only)
export function addWorker(cid, sid, { name, trade, phone = '', dailyRate }, uid) {
  const b = writeBatch(db);
  const w = doc(sub(cid, sid, 'workers'));
  b.set(w, { name, trade, phone, active: true, createdBy: uid, createdAt: serverTimestamp() });
  if (dailyRate > 0) b.set(doc(db, paths.workerPay(cid, sid, w.id)), { dailyRate, updatedAt: serverTimestamp() });
  return b.commit();
}
export const updateWorker = (cid, sid, wid, { name, trade, phone = '' }) =>
  updateDoc(subDoc(cid, sid, 'workers', wid), { name, trade, phone, updatedAt: serverTimestamp() });
export const setWorkerActive = (cid, sid, wid, active) => updateDoc(subDoc(cid, sid, 'workers', wid), { active, updatedAt: serverTimestamp() });
export const setWorkerRate = (cid, sid, wid, dailyRate) =>
  setDoc(doc(db, paths.workerPay(cid, sid, wid)), { dailyRate, updatedAt: serverTimestamp() }, { merge: true });

// Entry and stock change go in one batch; the rules check they match.
// type: 'usage' | 'delivery' | 'adjustment' (stock count; qty is the signed difference).
// A delivery cost (finance roles only) also records an expense; the server then updates the spending totals.
export function logMaterial(cid, sid, { material, type, qty, cost = 0, supplier = '', ref = '', note = '', uid, name, date = todayKey() }) {
  const b = writeBatch(db);
  const logRef = doc(sub(cid, sid, 'materialLogs'));
  b.set(logRef, {
    materialId: material.id, materialName: material.name, unit: material.unit,
    type, qty, cost, supplier, ref, note, date, createdBy: uid, createdByName: name, createdAt: serverTimestamp(),
  });
  b.update(subDoc(cid, sid, 'materials', material.id), { stock: increment(stockDelta({ type, qty })), lastLogId: logRef.id });
  if (type === 'delivery' && cost > 0) {
    b.set(doc(sub(cid, sid, 'expenses')), {
      date, category: 'Materials', amount: cost, payee: supplier, method: '', ref, createdBy: uid, createdByName: name, createdAt: serverTimestamp(),
      note: `${material.name}, ${qty} ${material.unit}`,
    });
  }
  return b.commit();
}

// Stock count (site managers): records the difference between counted and recorded.
// Returns null when the count matches the records (nothing to write).
export function stockCount(cid, sid, { material, counted, note, uid, name }) {
  const qty = countDifference(material.stock, counted);
  if (qty === 0) return null;
  return logMaterial(cid, sid, { material, type: 'adjustment', qty, note, uid, name });
}

export const updateMaterial = (cid, sid, id, { name, unit, reorderLevel, avgDaily }) =>
  updateDoc(subDoc(cid, sid, 'materials', id), { name, unit, reorderLevel, avgDaily, updatedAt: serverTimestamp() });
export const setMaterialActive = (cid, sid, id, active) => updateDoc(subDoc(cid, sid, 'materials', id), { active, updatedAt: serverTimestamp() });

// Entries for a site, newest first, optionally for one material and from a date
export function materialLogsQuery(cid, sid, { from = '', materialId = '' } = {}, n = 200) {
  const c = [];
  if (materialId) c.push(where('materialId', '==', materialId));
  if (from) c.push(where('date', '>=', from));
  return query(sub(cid, sid, 'materialLogs'), ...c, orderBy('date', 'desc'), limit(n));
}

// Expenses (finance roles). The recalcSiteSpending function keeps the totals right.
export const addExpense = (cid, sid, input, { uid, name }) =>
  setDoc(doc(sub(cid, sid, 'expenses')), { ...input, createdBy: uid, createdByName: name, createdAt: serverTimestamp() });
export const updateExpense = (cid, sid, id, input) => updateDoc(subDoc(cid, sid, 'expenses', id), { ...input, updatedAt: serverTimestamp() });
export const deleteExpense = (cid, sid, id) => deleteDoc(subDoc(cid, sid, 'expenses', id));
// Wages for a period, worked out from attendance, recorded as one Labour expense
export const recordWages = (cid, sid, { from, to, amount, date = todayKey(), method = '' }, me) =>
  addExpense(cid, sid, { date, category: 'Labour', amount, note: `Wages ${from} to ${to}`, payee: 'Site workers', method, ref: '' }, me);

// Marks one or more workers for a day, e.g. { w1: 'present', w2: 'late' }. Merged per worker, so
// two people marking at once don't overwrite each other.
export function markAttendance(cid, sid, { marks, uid, date = todayKey() }) {
  return setDoc(attendanceDoc(cid, sid, date), { date, marks, markedBy: uid, updatedAt: serverTimestamp() }, { merge: true });
}
export const attendanceRangeQuery = (cid, sid, from, to) =>
  query(sub(cid, sid, 'attendance'), where('date', '>=', from), where('date', '<=', to), orderBy('date'));

// Photos are resized on the device, then stored with a small copy for lists (thumbName in shared).
// Returns { photos, thumbs }: matching lists of links ('' where no small copy could be made).
async function uploadWithThumbs(files, pathFor) {
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
  const storage = await getStorage();
  const photos = [];
  const thumbs = [];
  for (const [i, original] of files.entries()) {
    const f = await resizePhoto(original);
    const name = `${i + 1}-${Date.now()}.jpg`;
    const r = ref(storage, pathFor(name));
    await uploadBytes(r, f, { contentType: f.type || 'image/jpeg' });
    photos.push(await getDownloadURL(r));
    const t = await thumbnail(original);
    if (t) {
      const tr = ref(storage, pathFor(thumbName(name)));
      await uploadBytes(tr, t, { contentType: 'image/jpeg' });
      thumbs.push(await getDownloadURL(tr));
    } else thumbs.push('');
  }
  return { photos, thumbs };
}
export const uploadPhotos = (cid, sid, rid, files) => uploadWithThumbs(files, (name) => paths.photo(cid, sid, rid, name));

// Today's report for this person on this site (one per person per day)
export const myReportId = (uid, date = todayKey()) => reportId(date, uid);

// Writes the report and moves the site's stage/progress on, in one batch.
// site: the site document (for its name and current last report date)
// progressFromMilestones: the site has milestones, so its progress comes from them, not from reports
export function sendReport(cid, site, input, { uid, name, role = '', email = '', photos = [], thumbs = [], materials = [], date = todayKey(), time = timeHM(), progressFromMilestones = false }) {
  const b = writeBatch(db);
  const rid = reportId(date, uid);
  if (progressFromMilestones) input = { ...input, progress: site.progress || 0 };
  b.set(reportRef(cid, site.id, rid), {
    ...reportDoc(input, { companyId: cid, siteId: site.id, siteName: site.name, date, time, uid, name, role, email, photos, thumbs, materials, source: 'web' }),
    createdAt: serverTimestamp(),
  });
  // Only move the site forward: an older report never overwrites a newer one
  if (!site.lastReportDate || date >= site.lastReportDate) {
    b.update(siteDoc(cid, site.id), { stage: input.stage, ...(progressFromMilestones ? {} : { progress: input.progress }), lastReportDate: date, lastReportTime: time });
  }
  return { id: rid, done: b.commit() };
}

export const reportExists = async (cid, sid, rid) => (await getDoc(reportRef(cid, sid, rid))).exists();

// ---------- issues ----------
export const issueRef = (cid, sid, id) => doc(db, paths.subDoc(cid, sid, 'issues', id));
export const newIssueId = (cid, sid) => doc(sub(cid, sid, 'issues')).id;
export const siteIssuesQuery = (cid, sid, n = 100) => query(sub(cid, sid, 'issues'), orderBy('date', 'desc'), limit(n));
// Every open issue in the company (roles that see every site): one listener for the dashboard and Issues page
export const openIssuesQuery = (cid) =>
  query(collectionGroup(db, 'issues'), where('companyId', '==', cid), where('status', 'in', ['open', 'in_progress']));
export const companyIssuesQuery = (cid, n = 200) =>
  query(collectionGroup(db, 'issues'), where('companyId', '==', cid), orderBy('date', 'desc'), limit(n));
export const commentsQuery = (cid, sid, id) => query(collection(db, paths.issueComments(cid, sid, id)), orderBy('createdAt'));

export const uploadIssuePhotos = (cid, sid, issueId, files) => uploadWithThumbs(files, (name) => paths.issuePhoto(cid, sid, issueId, name));

// input: validated issueInput. assignedTo only for site managers (the rules check).
export function createIssue(cid, site, input, { id, uid, name, photos = [], thumbs = [], assignedTo = null, assignedToName = '', pin = null }) {
  const { photos: _p, ...fields } = input;
  return setDoc(issueRef(cid, site.id, id), {
    ...issueDoc(fields, { companyId: cid, siteId: site.id, siteName: site.name, uid, name, photos, thumbs, assignedTo, assignedToName, date: todayKey(), pin }),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp(),
  });
}

// A change to an issue (status, assignment, priority, details), with an optional note in the timeline
export function updateIssue(cid, sid, id, patch, { note = '', uid, name } = {}) {
  const b = writeBatch(db);
  const resolved = patch.status === 'resolved' ? { resolvedAt: serverTimestamp() } : {};
  b.update(issueRef(cid, sid, id), { ...patch, ...resolved, updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp() });
  if (note) b.set(doc(collection(db, paths.issueComments(cid, sid, id))), { text: note, kind: 'update', createdBy: uid, createdByName: name, createdAt: serverTimestamp() });
  return b.commit();
}

export function addComment(cid, sid, id, text, { uid, name }) {
  const b = writeBatch(db);
  b.set(doc(collection(db, paths.issueComments(cid, sid, id))), { text, kind: 'comment', createdBy: uid, createdByName: name, createdAt: serverTimestamp() });
  b.update(issueRef(cid, sid, id), { commentCount: increment(1), lastActivityAt: serverTimestamp() });
  return b.commit();
}

// ---------- milestones and progress ----------
export const milestonesQuery = (cid, sid) => query(sub(cid, sid, 'milestones'), orderBy('order'));
const milestoneRef = (cid, sid, id) => doc(db, paths.subDoc(cid, sid, 'milestones', id));
// The site's overall progress follows its milestones; written in the same batch as any milestone change
const syncSiteProgress = (b, cid, sid, milestones) => {
  const p = overallProgress(milestones);
  if (p != null) b.update(siteDoc(cid, sid), { progress: p });
};

// Site team: set a milestone's percentage (status and actual dates follow)
export function setMilestoneProgress(cid, sid, milestone, all, { percentDone, note = '', uid, name }) {
  const change = milestoneProgress(milestone, percentDone, todayKey());
  const b = writeBatch(db);
  b.update(milestoneRef(cid, sid, milestone.id), { ...change, note, updatedBy: uid, updatedByName: name, updatedAt: serverTimestamp() });
  syncSiteProgress(b, cid, sid, all.map((m) => (m.id === milestone.id ? { ...m, ...change } : m)));
  return b.commit();
}

// Site managers: set-up (input: validated milestoneInput)
const planFields = ({ name, weight, plannedStart, plannedEnd }) => ({ name, weight, plannedStart: plannedStart || null, plannedEnd: plannedEnd || null });
export function addMilestone(cid, sid, input, all) {
  const b = writeBatch(db);
  const m = { ...planFields(input), order: all.reduce((x, y) => Math.max(x, y.order || 0), 0) + 1, status: 'not_started', percentDone: 0, actualStart: null, actualEnd: null, note: '' };
  b.set(doc(sub(cid, sid, 'milestones')), { ...m, createdAt: serverTimestamp() });
  syncSiteProgress(b, cid, sid, [...all, m]);
  return b.commit();
}
export function updateMilestonePlan(cid, sid, id, input, all) {
  const b = writeBatch(db);
  b.update(milestoneRef(cid, sid, id), { ...planFields(input), updatedAt: serverTimestamp() });
  syncSiteProgress(b, cid, sid, all.map((m) => (m.id === id ? { ...m, ...planFields(input) } : m)));
  return b.commit();
}
export function deleteMilestone(cid, sid, id, all) {
  const b = writeBatch(db);
  b.delete(milestoneRef(cid, sid, id));
  syncSiteProgress(b, cid, sid, all.filter((m) => m.id !== id));
  return b.commit();
}
// Swap the order of two milestones
export function swapMilestones(cid, sid, a, c) {
  const b = writeBatch(db);
  b.update(milestoneRef(cid, sid, a.id), { order: c.order, updatedAt: serverTimestamp() });
  b.update(milestoneRef(cid, sid, c.id), { order: a.order, updatedAt: serverTimestamp() });
  return b.commit();
}
// The usual stages for a kind of work (building by default), spread over the site's planned dates
export function addStandardMilestones(cid, site, stages) {
  const b = writeBatch(db);
  const list = standardMilestones(site.planStart, site.planEnd, stages).map((m) => ({ ...m, status: 'not_started', percentDone: 0, actualStart: null, actualEnd: null, note: '' }));
  for (const m of list) b.set(doc(sub(cid, site.id, 'milestones')), { ...m, createdAt: serverTimestamp() });
  syncSiteProgress(b, cid, site.id, list);
  return b.commit();
}

// ---------- notifications ----------
// Owner: which notifications go out, by WhatsApp and/or email ({ kind: { whatsapp, email } })
// Report requests on a project (newest first), and the ones waiting for one person
export const reportRequestsQuery = (cid, sid, n = 20) => query(sub(cid, sid, 'reportRequests'), orderBy('createdAt', 'desc'), limit(n));
export const myReportRequestsQuery = (cid, sid, uid) => query(sub(cid, sid, 'reportRequests'), where('to', '==', uid), where('status', '==', 'open'));
export const updateNotifications = (cid, notifications) => updateDoc(companyDoc(cid), { notifications, updatedAt: serverTimestamp() });
export const notificationsQuery = (cid, n = 50) => query(collection(db, paths.notifications(cid)), orderBy('createdAt', 'desc'), limit(n));
