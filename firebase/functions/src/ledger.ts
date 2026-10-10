import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  onDocumentDeletedWithAuthContext, onDocumentUpdatedWithAuthContext, onDocumentWrittenWithAuthContext,
} from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import {
  can, companyLocale, datesIn, isManualLabour, money, paths, periodsOverlap, prettyDate, round2, validate, wagePeriodInput, wageSheet,
  type Attendance, type Company, type Expense, type Worker, type WorkerPay,
} from '@siteflow/shared';
import { actorOf } from './members';
import { checkLimit } from './limits';

// Money and labour records that can be trusted:
//  - expenses are never deleted; edits and voids keep a history (expenses/{id}/history) and show in
//    the activity log, with who did it (from the signed-in user, not from what the app says);
//  - attendance keeps every change of a mark (attendance/{date}/changes);
//  - wages are worked out here from attendance and daily rates, a period can only be paid once (even
//    when two people press Record at the same moment), and its attendance is locked (paidBy) until
//    that wage expense is voided;
//  - Labour entered by hand needs a reason, is marked as such and goes to the activity log;
//  - budget changes and deleted daily reports are written to the activity log.
// Only changes made by people in the apps are recorded by the triggers (writes by the server, like
// loading the sample projects, are not). The triggers are retried when they fail, and everything they
// write is keyed by the event, so a retry or a repeated delivery never writes anything twice.

const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
// A change made from an app (not by the server's own service account or the system, e.g. TTL)
const fromApp = (t: string) => t !== 'service_account' && t !== 'system';
// Retries stop after a day: by then something is wrong that a retry won't fix (it is logged)
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const tooOld = (time: string, now = Date.now()) => now - Date.parse(time) > MAX_EVENT_AGE_MS;
const FIELDS = ['date', 'category', 'amount', 'note', 'payee', 'method', 'ref', 'labourReason'] as const;
const snapshotOf = (e: Partial<Expense> | undefined) => Object.fromEntries(FIELDS.map((k) => [k, e?.[k] ?? null]));
// One per project: the wage periods paid (expense id -> period). Every wage recording reads and writes
// it inside its transaction, so two recordings for a project can never both pass the overlap check.
const registerOf = (db: Firestore, cid: string, sid: string) => db.doc(paths.subDoc(cid, sid, 'finance', 'wages'));

async function personName(db: Firestore, cid: string, uid: string | undefined) {
  if (!uid) return 'Someone';
  return ((await db.doc(paths.member(cid, uid)).get()).data()?.name as string) || 'Someone';
}
async function companyOf(db: Firestore, cid: string) {
  return { id: cid, ...(await db.doc(paths.company(cid)).get()).data() } as Company;
}
// Writes a document once: a repeat of the same event finds it there and leaves it alone
export async function once(ref: DocumentReference, data: Record<string, unknown>) {
  try {
    await ref.create(data);
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 6) return false; // ALREADY_EXISTS
    throw e;
  }
}
// An activity-log line written once per event (key), so a retried trigger doesn't log it twice
const logOnce = (db: Firestore, cid: string, key: string, who: string, whoId: string | undefined, what: string) =>
  once(db.doc(`${paths.activity(cid)}/${key}`), { who, whoId: whoId || null, what, at: FieldValue.serverTimestamp() });

// ---------- wages ----------
type Actor = { id: string; name: string; role: string; companyId: string };

// Finance roles record a period's wages. The amount comes from attendance and daily rates here, not
// from the app; a period overlapping one already paid (and not voided) is refused; the period's
// attendance is locked so it can't change after payment. All of it happens in one transaction.
export async function recordWagesFor(db: Firestore, me: Actor, data: unknown) {
  const v = validate(wagePeriodInput, data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const { siteId, from, to, method } = v.data;
  if (!can(me.role as Parameters<typeof can>[0], 'finance.edit')) throw new HttpsError('permission-denied', 'Only finance roles can record wages.');
  const cid = me.companyId;
  const sub = (name: Parameters<typeof paths.sub>[2]) => db.collection(paths.sub(cid, siteId, name));
  const site = (await db.doc(paths.site(cid, siteId)).get()).data();
  if (!site) throw new HttpsError('not-found', 'That project was not found.');
  const register = registerOf(db, cid, siteId);
  const ref = sub('expenses').doc();

  const result = await db.runTransaction(async (tx) => {
    // Reads first (all of them lock what they read until the transaction ends)
    await tx.get(register);
    const [labourSnap, workersSnap, paySnap, attSnap] = await Promise.all([
      tx.get(sub('expenses').where('category', '==', 'Labour')),
      tx.get(sub('workers')), tx.get(sub('workerPay')),
      tx.get(sub('attendance').where('date', '>=', from).where('date', '<=', to)),
    ]);
    const labour = labourSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense & { id: string });
    const paid = labour.filter((e) => e.period && !e.voided && periodsOverlap(e.period, { from, to }));
    if (paid.length) {
      const p = paid[0].period!;
      throw new HttpsError('already-exists', `Wages for ${prettyDate(p.from)} to ${prettyDate(p.to)} are already recorded, and overlap this period. Void that wage payment first if it was wrong.`);
    }
    const workers = workersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Worker);
    const pay = Object.fromEntries(paySnap.docs.map((d) => [d.id, d.data() as WorkerPay]));
    const sheet = wageSheet(workers, pay, attSnap.docs.map((d) => d.data() as Attendance));
    if (!(sheet.total > 0)) throw new HttpsError('failed-precondition', 'No paid days in this period (or no daily rates set), so there is nothing to record.');
    // Labour paid by hand in the same days: not blocked (it may be for other work), but reported back
    const manual = labour.filter((e) => isManualLabour(e) && e.date >= from && e.date <= to);

    const amount = round2(sheet.total);
    const note = `Wages ${from} to ${to}`;
    tx.set(ref, {
      date: to, category: 'Labour', amount, note, payee: 'Site workers', method, ref: '',
      period: { from, to }, createdBy: me.id, createdByName: me.name, updatedBy: me.id, updatedByName: me.name,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(ref.collection('history').doc('recorded'), {
      action: 'created', by: me.id, byName: me.name, at: FieldValue.serverTimestamp(), after: snapshotOf({ date: to, category: 'Labour', amount, note }),
      detail: `${sheet.rows.length} workers, ${sheet.rows.reduce((n, r) => n + r.days, 0)} days`,
    });
    // Lock every day of the period, including days nobody marked (so they can't be added later)
    for (const date of datesIn(from, to)) {
      tx.set(db.doc(paths.attendance(cid, siteId, date)), { date, paidBy: ref.id, paidAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    tx.set(register, { periods: { [ref.id]: { from, to } } }, { merge: true });
    return {
      id: ref.id, amount, workers: sheet.rows.length,
      manual: { count: manual.length, total: round2(manual.reduce((s, e) => s + (Number(e.amount) || 0), 0)) },
    };
  });
  const company = await companyOf(db, cid);
  await logOnce(db, cid, `wages-${result.id}`, me.name, me.id, `recorded wages of ${money(result.amount, companyLocale(company).currency)} for ${site.name}, ${prettyDate(from)} to ${prettyDate(to)}`)
    .catch((e) => logger.warn('Activity log write failed', e));
  return result;
}

export const recordWages = onCall(callOpts, async (req) => {
  const db = getFirestore();
  const me = await actorOf(db, req.auth?.uid);
  await checkLimit(me.id, 'teamChange');
  return recordWagesFor(db, me, req.data);
});

// A voided wage payment frees its period: its attendance is unlocked (only days still locked by that
// payment, in a transaction, so it can't undo a newer payment's lock) and it leaves the register.
// Safe to run any number of times.
export async function releaseWagePeriod(db: Firestore, cid: string, sid: string, eid: string) {
  const register = registerOf(db, cid, sid);
  await db.runTransaction(async (tx) => {
    const reg = await tx.get(register);
    const locked = await tx.get(db.collection(paths.sub(cid, sid, 'attendance')).where('paidBy', '==', eid));
    for (const d of locked.docs) tx.update(d.ref, { paidBy: FieldValue.delete(), paidAt: FieldValue.delete() });
    if (reg.exists) tx.update(register, { [`periods.${eid}`]: FieldValue.delete() });
  });
}

// ---------- the triggers' work (exported for the tests) ----------
export interface Change<T> { id: string; cid: string; sid: string; docId: string; before?: T; after?: T; authId?: string }
// fault: tests make a step fail, to check that a retry finishes the job without doubling anything
type Fault = (step: string) => void;

export async function expenseChanged(db: Firestore, ev: Change<Expense>, fault?: Fault) {
  const { cid, sid, docId: eid, before, after } = ev;
  if (!after) return; // deletes are refused by the rules; the server's own clean-up is not history
  // Who: the rules make apps write updatedBy as themselves; the event's identity backs it up
  const by = after.updatedBy || (before ? undefined : after.createdBy) || ev.authId;
  const byName = await personName(db, cid, by);
  const action = !before ? 'created' : (!before.voided && after.voided) ? 'voided' : 'edited';
  const changed = before ? FIELDS.filter((k) => (before[k] ?? null) !== (after[k] ?? null)) : [...FIELDS];
  if (action === 'edited' && !changed.length) return; // nothing that matters changed
  const ref = db.doc(paths.subDoc(cid, sid, 'expenses', eid));
  await once(ref.collection('history').doc(ev.id), {
    action, by: by || null, byName, at: FieldValue.serverTimestamp(),
    before: before ? snapshotOf(before) : null, after: snapshotOf(after),
    ...(action === 'voided' ? { reason: after.voidReason || '', amount: after.voidedAmount ?? before?.amount ?? 0 } : {}),
    ...(action === 'edited' ? { changed } : {}),
  });
  fault?.('history');
  const manual = isManualLabour(after);
  if (action === 'created' && !manual) return;
  const cur = companyLocale(await companyOf(db, cid)).currency;
  const site = (await db.doc(paths.site(cid, sid)).get()).data()?.name ?? 'a project';
  if (action === 'created') {
    await logOnce(db, cid, `ev-${ev.id}`, byName, by, `entered ${money(after.amount, cur)} of labour by hand on ${site} (not from attendance): ${after.labourReason || 'no reason given'}`);
    return;
  }
  if (action === 'voided') {
    await logOnce(db, cid, `ev-${ev.id}`, byName, by, `voided a ${money(after.voidedAmount ?? before?.amount ?? 0, cur)} ${after.category} expense on ${site}: ${after.voidReason || 'no reason given'}`);
    fault?.('activity');
    if (after.period) await releaseWagePeriod(db, cid, sid, eid);
    return;
  }
  const amounts = changed.includes('amount') ? ` (amount ${money(before?.amount ?? 0, cur)} → ${money(after.amount, cur)})` : '';
  const kind = manual ? 'labour expense entered by hand' : `${after.category} expense`;
  await logOnce(db, cid, `ev-${ev.id}`, byName, by, `edited a ${kind} on ${site}: ${changed.join(', ')}${amounts}`);
}

export async function attendanceChanged(db: Firestore, ev: Change<Partial<Attendance>>) {
  const before = (ev.before?.marks || {}) as Record<string, string>;
  const after = (ev.after?.marks || {}) as Record<string, string>;
  const changes = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((w) => before[w] !== after[w]).map((w) => ({ workerId: w, from: before[w] ?? null, to: after[w] ?? null }));
  if (!changes.length && ev.after) return;
  const by = ev.after?.markedBy || ev.authId;
  await once(db.doc(`${paths.attendance(ev.cid, ev.sid, ev.docId)}/changes/${ev.id}`), {
    by: by || null, byName: await personName(db, ev.cid, by), at: FieldValue.serverTimestamp(),
    changes: changes.slice(0, 500), ...(ev.after ? {} : { deleted: true }),
  });
}

type Budget = { budget?: number; budgetByCategory?: Record<string, number>; updatedBy?: string };
export async function budgetChanged(db: Firestore, ev: Change<Budget>) {
  const { before, after } = ev;
  if (!before || !after) return;
  const total = before.budget !== after.budget;
  const cats = JSON.stringify(before.budgetByCategory || {}) !== JSON.stringify(after.budgetByCategory || {});
  if (!total && !cats) return;
  const cur = companyLocale(await companyOf(db, ev.cid)).currency;
  const site = (await db.doc(paths.site(ev.cid, ev.sid)).get()).data()?.name ?? 'a project';
  const what = total
    ? `changed the budget of ${site} from ${money(before.budget || 0, cur)} to ${money(after.budget || 0, cur)}${cats ? ' (and the amounts per category)' : ''}`
    : `changed the budget per category of ${site}`;
  const by = after.updatedBy || ev.authId;
  await logOnce(db, ev.cid, `ev-${ev.id}`, await personName(db, ev.cid, by), by, what);
}

// ---------- the triggers (retried on failure; see the top of the file) ----------
const opts = (document: string) => ({ document, retry: true });
function skip(event: { authType: string; time: string; id: string }, what: string) {
  if (!fromApp(event.authType)) return true; // the server records its own changes
  if (tooOld(event.time)) {
    logger.error(`Gave up recording ${what} after a day of retries`, { eventId: event.id });
    return true;
  }
  return false;
}

export const onExpenseChanged = onDocumentWrittenWithAuthContext(opts('companies/{cid}/sites/{sid}/expenses/{eid}'), async (event) => {
  if (skip(event, 'an expense change')) return;
  const { cid, sid, eid } = event.params;
  await expenseChanged(getFirestore(), {
    id: event.id, cid, sid, docId: eid, authId: event.authId,
    before: event.data?.before.exists ? (event.data.before.data() as Expense) : undefined,
    after: event.data?.after.exists ? (event.data.after.data() as Expense) : undefined,
  });
});

export const onAttendanceChanged = onDocumentWrittenWithAuthContext(opts('companies/{cid}/sites/{sid}/attendance/{date}'), async (event) => {
  if (skip(event, 'an attendance change')) return; // locking by recordWages etc. is the server's
  const { cid, sid, date } = event.params;
  await attendanceChanged(getFirestore(), {
    id: event.id, cid, sid, docId: date, authId: event.authId,
    before: event.data?.before.exists ? (event.data.before.data() as Attendance) : undefined,
    after: event.data?.after.exists ? (event.data.after.data() as Attendance) : undefined,
  });
});

export const onBudgetChanged = onDocumentUpdatedWithAuthContext(opts('companies/{cid}/sites/{sid}/finance/{docId}'), async (event) => {
  if (skip(event, 'a budget change')) return; // spending totals and the wage register are the server's
  const { cid, sid, docId } = event.params;
  await budgetChanged(getFirestore(), {
    id: event.id, cid, sid, docId, authId: event.authId,
    before: event.data?.before.data() as Budget | undefined, after: event.data?.after.data() as Budget | undefined,
  });
});

// ---------- deleted daily reports ----------
export const onReportDeleted = onDocumentDeletedWithAuthContext(opts('companies/{cid}/sites/{sid}/reports/{rid}'), async (event) => {
  if (skip(event, 'a deleted report')) return; // project deletion and sample clean-up remove reports on the server
  const { cid } = event.params;
  const r = event.data?.data();
  if (!r) return;
  const db = getFirestore();
  await logOnce(db, cid, `ev-${event.id}`, await personName(db, cid, event.authId), event.authId,
    `deleted the daily report by ${r.createdByName} for ${r.siteName} on ${prettyDate(r.date)}`);
});
