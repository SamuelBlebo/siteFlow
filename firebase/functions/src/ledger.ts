import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  onDocumentDeletedWithAuthContext, onDocumentUpdatedWithAuthContext, onDocumentWrittenWithAuthContext,
} from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  can, companyLocale, datesIn, money, paths, periodsOverlap, prettyDate, round2, validate, wagePeriodInput, wageSheet,
  type Attendance, type Company, type Expense, type Worker, type WorkerPay,
} from '@siteflow/shared';
import { actorOf } from './members';
import { checkLimit } from './limits';

// Money and labour records that can be trusted:
//  - expenses are never deleted; edits and voids keep a history (expenses/{id}/history) and show in
//    the activity log, with who did it (from the signed-in user, not from what the app says);
//  - attendance keeps every change of a mark (attendance/{date}/changes);
//  - wages are worked out here from attendance and daily rates, a period can only be paid once,
//    and its attendance is locked (paidBy) until that wage expense is voided;
//  - budget changes and deleted daily reports are written to the activity log.
// Only changes made by people in the apps are recorded here (writes by the server, like loading the
// sample projects, are not).

const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
// A change made from an app (not by the server's own service account or the system, e.g. TTL)
const fromApp = (t: string) => t !== 'service_account' && t !== 'system';
const FIELDS = ['date', 'category', 'amount', 'note', 'payee', 'method', 'ref'] as const;
const snapshotOf = (e: Partial<Expense> | undefined) => Object.fromEntries(FIELDS.map((k) => [k, e?.[k] ?? null]));

async function personName(db: Firestore, cid: string, uid: string | undefined) {
  if (!uid) return 'Someone';
  return ((await db.doc(paths.member(cid, uid)).get()).data()?.name as string) || 'Someone';
}
async function companyOf(db: Firestore, cid: string) {
  return { id: cid, ...(await db.doc(paths.company(cid)).get()).data() } as Company;
}
const activity = (db: Firestore, cid: string, who: string, whoId: string | undefined, what: string) =>
  db.collection(paths.activity(cid)).add({ who, whoId: whoId || null, what, at: FieldValue.serverTimestamp() }).catch((e) => logger.warn('Activity log write failed', e));

// ---------- wages ----------
// Finance roles record a period's wages. The amount comes from attendance and daily rates here, not
// from the app; a period overlapping one already paid (and not voided) is refused; the period's
// attendance is locked so it can't change after payment.
export const recordWages = onCall(callOpts, async (req) => {
  const v = validate(wagePeriodInput, req.data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const { siteId, from, to, method } = v.data;
  const db = getFirestore();
  const me = await actorOf(db, req.auth?.uid);
  if (!can(me.role, 'finance.edit')) throw new HttpsError('permission-denied', 'Only finance roles can record wages.');
  await checkLimit(me.id, 'teamChange');
  const cid = me.companyId;
  const sub = (name: Parameters<typeof paths.sub>[2]) => db.collection(paths.sub(cid, siteId, name));
  const site = (await db.doc(paths.site(cid, siteId)).get()).data();
  if (!site) throw new HttpsError('not-found', 'That project was not found.');

  const paid = (await sub('expenses').where('category', '==', 'Labour').get()).docs
    .map((d) => ({ id: d.id, ...d.data() }) as Expense & { id: string })
    .filter((e) => e.period && !e.voided && periodsOverlap(e.period, { from, to }));
  if (paid.length) {
    const p = paid[0].period!;
    throw new HttpsError('already-exists', `Wages for ${prettyDate(p.from)} to ${prettyDate(p.to)} are already recorded, and overlap this period. Void that wage payment first if it was wrong.`);
  }
  const [workersSnap, paySnap, attSnap] = await Promise.all([
    sub('workers').get(), sub('workerPay').get(), sub('attendance').where('date', '>=', from).where('date', '<=', to).get(),
  ]);
  const workers = workersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Worker);
  const pay = Object.fromEntries(paySnap.docs.map((d) => [d.id, d.data() as WorkerPay]));
  const sheet = wageSheet(workers, pay, attSnap.docs.map((d) => d.data() as Attendance));
  if (!(sheet.total > 0)) throw new HttpsError('failed-precondition', 'No paid days in this period (or no daily rates set), so there is nothing to record.');

  const company = await companyOf(db, cid);
  const ref = sub('expenses').doc();
  const batch = db.batch();
  batch.set(ref, {
    date: to, category: 'Labour', amount: round2(sheet.total), note: `Wages ${from} to ${to}`, payee: 'Site workers', method, ref: '',
    period: { from, to }, createdBy: me.id, createdByName: me.name, updatedBy: me.id, updatedByName: me.name,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(ref.collection('history').doc(), {
    action: 'created', by: me.id, byName: me.name, at: FieldValue.serverTimestamp(), after: snapshotOf({ date: to, category: 'Labour', amount: round2(sheet.total), note: `Wages ${from} to ${to}` }),
    detail: `${sheet.rows.length} workers, ${sheet.rows.reduce((n, r) => n + r.days, 0)} days`,
  });
  // Lock every day of the period, including days nobody marked (so they can't be added later)
  for (const date of datesIn(from, to)) {
    batch.set(db.doc(paths.attendance(cid, siteId, date)), { date, paidBy: ref.id, paidAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
  await activity(db, cid, me.name, me.id, `recorded wages of ${money(sheet.total, companyLocale(company).currency)} for ${site.name}, ${prettyDate(from)} to ${prettyDate(to)}`);
  return { id: ref.id, amount: round2(sheet.total), workers: sheet.rows.length };
});

// ---------- expense history ----------
export const onExpenseChanged = onDocumentWrittenWithAuthContext('companies/{cid}/sites/{sid}/expenses/{eid}', async (event) => {
  if (!fromApp(event.authType)) return; // the server records its own history (recordWages)
  const { cid, sid, eid } = event.params;
  const before = event.data?.before.exists ? (event.data.before.data() as Expense) : undefined;
  const after = event.data?.after.exists ? (event.data.after.data() as Expense) : undefined;
  if (!after) return; // deletes are refused by the rules; the server's own clean-up is not history
  const db = getFirestore();
  // Who: the rules make apps write updatedBy as themselves; the event's identity backs it up
  const by = after.updatedBy || (before ? undefined : after.createdBy) || event.authId;
  const byName = await personName(db, cid, by);
  const action = !before ? 'created' : (!before.voided && after.voided) ? 'voided' : 'edited';
  const changed = before ? FIELDS.filter((k) => (before[k] ?? null) !== (after[k] ?? null)) : [...FIELDS];
  if (action === 'edited' && !changed.length) return; // nothing that matters changed
  const ref = db.doc(paths.subDoc(cid, sid, 'expenses', eid));
  await ref.collection('history').add({
    action, by: by || null, byName, at: FieldValue.serverTimestamp(),
    before: before ? snapshotOf(before) : null, after: snapshotOf(after),
    ...(action === 'voided' ? { reason: after.voidReason || '', amount: after.voidedAmount ?? before?.amount ?? 0 } : {}),
    ...(action === 'edited' ? { changed } : {}),
  });
  if (action === 'created') return;
  const company = await companyOf(db, cid);
  const cur = companyLocale(company).currency;
  const site = (await db.doc(paths.site(cid, sid)).get()).data();
  if (action === 'voided') {
    await activity(db, cid, byName, by, `voided a ${money(after.voidedAmount ?? before?.amount ?? 0, cur)} ${after.category} expense on ${site?.name ?? 'a project'}: ${after.voidReason || 'no reason given'}`);
    // A voided wage payment frees its period: unlock that attendance so it can be corrected and paid again
    if (after.period) {
      const locked = await db.collection(paths.sub(cid, sid, 'attendance')).where('paidBy', '==', eid).get();
      const b = db.batch();
      for (const d of locked.docs) b.update(d.ref, { paidBy: FieldValue.delete(), paidAt: FieldValue.delete() });
      await b.commit();
    }
    return;
  }
  const amounts = changed.includes('amount') ? ` (amount ${money(before?.amount ?? 0, cur)} → ${money(after.amount, cur)})` : '';
  await activity(db, cid, byName, by, `edited a ${after.category} expense on ${site?.name ?? 'a project'}: ${changed.join(', ')}${amounts}`);
});

// ---------- attendance history ----------
export const onAttendanceChanged = onDocumentWrittenWithAuthContext('companies/{cid}/sites/{sid}/attendance/{date}', async (event) => {
  if (!fromApp(event.authType)) return; // locking by recordWages etc.
  const { cid, sid, date } = event.params;
  const before = (event.data?.before.data()?.marks || {}) as Record<string, string>;
  const after = (event.data?.after.data()?.marks || {}) as Record<string, string>;
  const changes = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((w) => before[w] !== after[w]).map((w) => ({ workerId: w, from: before[w] ?? null, to: after[w] ?? null }));
  if (!changes.length && event.data?.after.exists) return;
  const db = getFirestore();
  await db.collection(`${paths.attendance(cid, sid, date)}/changes`).add({
    by: event.data?.after.data()?.markedBy || event.authId || null, byName: await personName(db, cid, event.data?.after.data()?.markedBy || event.authId), at: FieldValue.serverTimestamp(),
    changes: changes.slice(0, 500), ...(event.data?.after.exists ? {} : { deleted: true }),
  });
});

// ---------- budget changes ----------
export const onBudgetChanged = onDocumentUpdatedWithAuthContext('companies/{cid}/sites/{sid}/finance/{docId}', async (event) => {
  if (!fromApp(event.authType)) return; // spending totals are recalculated by the server
  const { cid, sid } = event.params;
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const total = before.budget !== after.budget;
  const cats = JSON.stringify(before.budgetByCategory || {}) !== JSON.stringify(after.budgetByCategory || {});
  if (!total && !cats) return;
  const db = getFirestore();
  const cur = companyLocale(await companyOf(db, cid)).currency;
  const site = (await db.doc(paths.site(cid, sid)).get()).data();
  const what = total
    ? `changed the budget of ${site?.name ?? 'a project'} from ${money(before.budget || 0, cur)} to ${money(after.budget || 0, cur)}${cats ? ' (and the amounts per category)' : ''}`
    : `changed the budget per category of ${site?.name ?? 'a project'}`;
  const by = after.updatedBy || event.authId;
  await activity(db, cid, await personName(db, cid, by), by, what);
});

// ---------- deleted daily reports ----------
export const onReportDeleted = onDocumentDeletedWithAuthContext('companies/{cid}/sites/{sid}/reports/{rid}', async (event) => {
  if (!fromApp(event.authType)) return; // project deletion and sample clean-up remove reports on the server
  const { cid } = event.params;
  const r = event.data?.data();
  if (!r) return;
  const db = getFirestore();
  await activity(db, cid, await personName(db, cid, event.authId), event.authId, `deleted the daily report by ${r.createdByName} for ${r.siteName} on ${prettyDate(r.date)}`);
});
