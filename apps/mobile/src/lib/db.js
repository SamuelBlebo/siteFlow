import firestore from '@react-native-firebase/firestore';
import { milestoneProgress, overallProgress, paths, stockDelta, todayKey } from '@siteflow/shared';
import { journaled, registerChecks, registerOps } from './sync';

// Firestore keeps working offline on React Native Firebase: writes apply on the phone instantly
// and sync when the signal returns. Every write goes through the write journal (sync.js), which
// keeps it until the server confirms it. Ids are made on the phone and kept with the change, so
// "Try again" and the server check always refer to the same records. All paths come from shared.
const now = () => firestore.FieldValue.serverTimestamp();
const inc = (n) => firestore.FieldValue.increment(n);
const newId = (path) => firestore().collection(path).doc().id;
// Server copy, ignoring the phone's cache (used to check whether a change arrived)
const serverDoc = async (path) => {
  const s = await firestore().doc(path).get({ source: 'server' });
  return exists(s) ? s.data() : null;
};

export const exists = (snap) => (typeof snap.exists === 'function' ? snap.exists() : snap.exists);
export const toList = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
export const userRef = (uid) => firestore().doc(paths.user(uid));
// A person's role and sites in one company (one login can belong to several)
export const memberRef = (cid, uid) => firestore().doc(paths.member(cid, uid));
// Look at another company this person belongs to (the rules check they are a member)
export const switchCompany = (uid, cid) => userRef(uid).update({ companyId: cid, updatedAt: firestore.FieldValue.serverTimestamp() });
export const companyRef = (cid) => firestore().doc(paths.company(cid));
export const sitesCol = (cid) => firestore().collection(paths.sites(cid));
export const siteRef = (cid, sid) => firestore().doc(paths.site(cid, sid));
export const sub = (cid, sid, name) => firestore().collection(paths.sub(cid, sid, name));
export const subRef = (cid, sid, name, id) => firestore().doc(paths.subDoc(cid, sid, name, id));
export const financeRef = (cid, sid) => firestore().doc(paths.finance(cid, sid));
export const attendanceRef = (cid, sid, date = todayKey()) => firestore().doc(paths.attendance(cid, sid, date));
export const todayLogsQuery = (cid, sid) => sub(cid, sid, 'materialLogs').where('date', '==', todayKey());

// Entry and stock change in one batch (the rules check they match). The entry id is fixed, so
// a repeat can never move stock twice (the rules refuse an entry that already exists).
export function logMaterial(cid, sid, input) {
  const args = { ...input, date: input.date || todayKey(), logId: input.logId || newId(paths.sub(cid, sid, 'materialLogs')) };
  const { material, type, qty, cost = 0, supplier = '', ref = '', note = '', uid, name, date, logId } = args;
  return journaled({ label: `${material.name} ${type === 'usage' ? 'used' : 'received'} (${qty} ${material.unit})`, op: 'logMaterial', args: [cid, sid, args] }, () => {
    const b = firestore().batch();
    b.set(subRef(cid, sid, 'materialLogs', logId), {
      materialId: material.id, materialName: material.name, unit: material.unit,
      type, qty, cost, supplier, ref, note, date, createdBy: uid, createdByName: name, createdAt: now(),
    });
    b.update(subRef(cid, sid, 'materials', material.id), { stock: inc(stockDelta({ type, qty })), lastLogId: logId });
    // A delivery cost (finance roles only) also records an expense; the server keeps the spending totals
    if (type === 'delivery' && cost > 0) {
      b.set(subRef(cid, sid, 'expenses', `${logId}-cost`), {
        date, category: 'Materials', amount: cost, payee: supplier, method: '', ref, createdBy: uid, createdByName: name, createdAt: now(),
        note: `${material.name}, ${qty} ${material.unit}`,
      });
    }
    return b.commit();
  });
}

// Marks one or more workers for a day ({ workerId: 'present' | 'late' | 'absent' | 'leave' }).
// Merged per worker, so two phones marking different workers never overwrite each other;
// for the same worker, the last mark to reach the server wins.
export function markAttendance(cid, sid, input) {
  const args = { ...input, date: input.date || todayKey() };
  const { marks, label = 'Attendance', uid, date } = args;
  return journaled({ label, op: 'markAttendance', args: [cid, sid, args] },
    () => attendanceRef(cid, sid, date).set({ date, marks, markedBy: uid, updatedAt: now() }, { merge: true }));
}
export const attendanceRangeQuery = (cid, sid, from, to) =>
  sub(cid, sid, 'attendance').where('date', '>=', from).where('date', '<=', to).orderBy('date', 'desc');

// Pay goes to workerPay, which only finance roles may write
export function addWorker(cid, sid, input) {
  const args = { ...input, workerId: input.workerId || newId(paths.sub(cid, sid, 'workers')) };
  const { name, trade, phone = '', dailyRate = 0, uid, workerId } = args;
  return journaled({ label: `New worker ${name}`, op: 'addWorker', args: [cid, sid, args] }, () => {
    const b = firestore().batch();
    b.set(subRef(cid, sid, 'workers', workerId), { name, trade, phone, active: true, createdBy: uid, createdAt: now() });
    if (dailyRate > 0) b.set(firestore().doc(paths.workerPay(cid, sid, workerId)), { dailyRate, updatedAt: now() });
    return b.commit();
  });
}

// The site team can fix a worker's name, trade and phone
export function updateWorker(cid, sid, input) {
  const { id, name, trade, phone = '' } = input;
  return journaled({ label: `Changes to ${name}`, op: 'updateWorker', args: [cid, sid, input] },
    () => subRef(cid, sid, 'workers', id).update({ name, trade, phone, updatedAt: now() }));
}

// Daily reports are sent through the report outbox (reportOutbox.js), not here
export const reportRef = (cid, sid, rid) => firestore().doc(paths.subDoc(cid, sid, 'reports', rid));
export const siteReportsQuery = (cid, sid, n = 10) => sub(cid, sid, 'reports').orderBy('date', 'desc').limit(n);

// Issues: new ones go through the outbox (queueIssue); changes and comments are journaled writes
export const issueRef = (cid, sid, id) => firestore().doc(paths.subDoc(cid, sid, 'issues', id));
export const siteIssuesQuery = (cid, sid, n = 100) => sub(cid, sid, 'issues').orderBy('date', 'desc').limit(n);
// Every open issue in the company (roles that see every site)
export const openIssuesQuery = (cid) => firestore().collectionGroup('issues').where('companyId', '==', cid).where('status', 'in', ['open', 'in_progress']);
export const commentsQuery = (cid, sid, id) => firestore().collection(paths.issueComments(cid, sid, id)).orderBy('createdAt');

// A change to an issue (start, resolve), with a note in its timeline. If someone else changed the
// issue meanwhile (say a manager closed it), the rules refuse this one and it shows as not saved.
export function updateIssue(cid, sid, input) {
  const args = { ...input, noteId: input.note ? (input.noteId || newId(paths.issueComments(cid, sid, input.id))) : '' };
  const { id, patch, note = '', uid, name, noteId } = args;
  const refused = 'Someone else may have changed this issue first (for example, a manager closed it). Open it to see where it stands.';
  return journaled({ label: 'Issue update', op: 'updateIssue', args: [cid, sid, args], refused }, () => {
    const b = firestore().batch();
    const resolved = patch.status === 'resolved' ? { resolvedAt: now() } : {};
    const who = uid ? { updatedBy: uid, updatedByName: name } : {}; // named in the issue's emails
    b.update(issueRef(cid, sid, id), { ...patch, ...resolved, ...who, updatedAt: now(), lastActivityAt: now() });
    if (note) b.set(firestore().doc(`${paths.issueComments(cid, sid, id)}/${noteId}`), { text: note, kind: 'update', createdBy: uid, createdByName: name, createdAt: now() });
    return b.commit();
  });
}

export function addComment(cid, sid, input) {
  const args = { ...input, commentId: input.commentId || newId(paths.issueComments(cid, sid, input.id)) };
  const { id, text, uid, name, commentId } = args;
  return journaled({ label: 'Comment', op: 'addComment', args: [cid, sid, args] }, () => {
    const b = firestore().batch();
    b.set(firestore().doc(`${paths.issueComments(cid, sid, id)}/${commentId}`), { text, kind: 'comment', createdBy: uid, createdByName: name, createdAt: now() });
    b.update(issueRef(cid, sid, id), { commentCount: inc(1), lastActivityAt: now() });
    return b.commit();
  });
}

// Milestones: the site team sets a milestone's percentage; the site's overall progress follows in the same batch
export const milestonesQuery = (cid, sid) => sub(cid, sid, 'milestones').orderBy('order');
export function setMilestoneProgress(cid, sid, input) {
  const args = { ...input, today: input.today || todayKey() };
  const { milestone, all, percentDone, uid, name, today } = args;
  return journaled({ label: `${milestone.name} progress`, op: 'setMilestoneProgress', args: [cid, sid, args] }, () => {
    const change = milestoneProgress(milestone, percentDone, today);
    const b = firestore().batch();
    b.update(subRef(cid, sid, 'milestones', milestone.id), { ...change, note: '', updatedBy: uid, updatedByName: name, updatedAt: now() });
    const overall = overallProgress(all.map((m) => (m.id === milestone.id ? { ...m, ...change } : m)));
    if (overall != null) b.update(siteRef(cid, sid), { progress: overall });
    return b.commit();
  });
}

registerOps({ logMaterial, markAttendance, addWorker, updateWorker, updateIssue, addComment, setMilestoneProgress });

// How to tell, on the server, that each kind of change arrived. When the record is there but
// holds something else, someone has probably changed it since: say so, so nobody resends an
// older value over a newer one without looking.
const differs = (what) => `The office has a different ${what} now. Someone may have changed it since. Check it before you try again.`;
const same = (doc, fields, what) => (!doc ? false : Object.entries(fields).every(([k, v]) => doc[k] === v) || differs(what));
registerChecks({
  logMaterial: async (cid, sid, a) => !!(await serverDoc(paths.subDoc(cid, sid, 'materialLogs', a.logId))),
  markAttendance: async (cid, sid, a) => {
    const d = await serverDoc(paths.attendance(cid, sid, a.date));
    if (!d) return false;
    const marks = Object.entries(a.marks);
    if (marks.every(([w, st]) => d.marks?.[w] === st)) return true;
    // A worker marked differently on the server: likely re-marked by someone else afterwards
    return marks.some(([w]) => d.marks?.[w] !== undefined) ? differs('attendance mark') : false;
  },
  addWorker: async (cid, sid, a) => !!(await serverDoc(paths.subDoc(cid, sid, 'workers', a.workerId))),
  updateWorker: async (cid, sid, a) => same(await serverDoc(paths.subDoc(cid, sid, 'workers', a.id)), { name: a.name, trade: a.trade, phone: a.phone || '' }, 'record for this worker'),
  updateIssue: async (cid, sid, a) => (a.noteId
    ? !!(await serverDoc(`${paths.issueComments(cid, sid, a.id)}/${a.noteId}`))
    : same(await serverDoc(paths.subDoc(cid, sid, 'issues', a.id)), a.patch, 'status or details for this issue')),
  addComment: async (cid, sid, a) => !!(await serverDoc(`${paths.issueComments(cid, sid, a.id)}/${a.commentId}`)),
  setMilestoneProgress: async (cid, sid, a) => {
    const d = await serverDoc(paths.subDoc(cid, sid, 'milestones', a.milestone.id));
    return same(d, { percentDone: milestoneProgress(a.milestone, a.percentDone, a.today).percentDone }, `progress for ${a.milestone.name}`);
  },
});
