import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { SAMPLE_PREFIX, buildDemo, can, paths, round2, sampleTime } from '@siteflow/shared';
import { checkLimit } from './limits';
import { actorOf } from './members';

const callOpts = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
const APP_URL = process.env.APP_URL ?? 'https://siteflow.app';
const SAMPLE_IDS = ['adenta', 'legon', 'road'].map((k) => `${SAMPLE_PREFIX}${k}`);

// The signed-in owner (only the owner adds or removes sample data)
async function owner(uid: string | undefined) {
  const me = await actorOf(getFirestore(), uid);
  if (!can(me.role, 'company.settings')) throw new HttpsError('permission-denied', 'Only the owner can add or remove sample data.');
  return me;
}

const at = (date: string, time?: string) => Timestamp.fromMillis(sampleTime(date, time));

// "Explore with sample data": three sample projects with about six weeks of history.
// Written by the server (it is a lot of documents), marked sample: true, and silent: the
// notification triggers and scheduled reminders skip sample projects.
export const loadDemo = onCall({ ...callOpts, timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const me = await owner(req.auth?.uid);
  await checkLimit(me.id, 'demo');
  const db = getFirestore();
  const cid = me.companyId;
  if ((await db.doc(paths.site(cid, SAMPLE_IDS[0])).get()).exists) return { loaded: false, reason: 'already' };

  const company = (await db.doc(paths.company(cid)).get()).data();
  // In the company's own country: its cities and its currency
  const demo = buildDemo({ companyId: cid, photoBase: `${APP_URL}/demo`, country: company?.country });
  const w = db.bulkWriter();
  w.onWriteError((e) => e.failedAttempts < 3);
  for (const s of demo) {
    const sub = (name: Parameters<typeof paths.subDoc>[2], id: string) => db.doc(paths.subDoc(cid, s.id, name, id));
    w.set(db.doc(paths.site(cid, s.id)), { ...s.site, createdAt: at(s.attendance[s.attendance.length - 1]?.date ?? '') });
    for (const x of s.workers) {
      w.set(sub('workers', x.id), { ...x.doc, createdAt: FieldValue.serverTimestamp() });
      w.set(db.doc(paths.workerPay(cid, s.id, x.id)), { dailyRate: x.dailyRate, updatedAt: FieldValue.serverTimestamp() });
    }
    for (const a of s.attendance) w.set(db.doc(paths.attendance(cid, s.id, a.date)), { ...a.doc, updatedAt: at(a.date, '08:30') });
    for (const m of s.materials) w.set(sub('materials', m.id), { ...m.doc, createdAt: FieldValue.serverTimestamp() });
    for (const l of s.materialLogs) w.set(sub('materialLogs', l.id), { ...l.doc, createdAt: at(l.doc.date as string, '12:00') });
    // sample: true on the loader's own expenses tells recalcSiteSpending to leave them; the totals are written below
    for (const e of s.expenses) w.set(sub('expenses', e.id), { ...e.doc, sample: true, createdAt: at(e.doc.date as string, '15:00') });
    for (const r of s.reports) w.set(sub('reports', r.id), { ...r.doc, createdAt: at(r.doc.date as string, r.doc.time as string) });
    for (const i of s.issues) {
      const t = at(i.doc.date as string, '10:00');
      w.set(sub('issues', i.id), { ...i.doc, createdAt: t, updatedAt: t, lastActivityAt: t });
    }
    for (const m of s.milestones) w.set(sub('milestones', m.id), { ...m.doc, createdAt: FieldValue.serverTimestamp() });
    for (const d of s.drawings) w.set(sub('drawings', d.id), { ...d.doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    const byCategory: Record<string, number> = {};
    for (const e of s.expenses) byCategory[e.doc.category as string] = round2((byCategory[e.doc.category as string] || 0) + (e.doc.amount as number));
    w.set(db.doc(paths.finance(cid, s.id)), {
      ...s.finance, spent: round2(Object.values(byCategory).reduce((a, b) => a + b, 0)), byCategory, expenseCount: s.expenses.length,
      computedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await w.close();
  await db.collection(paths.activity(cid)).add({ who: me.name, whoId: me.id, what: 'added the sample projects', at: FieldValue.serverTimestamp() });
  logger.info('Sample projects loaded', { cid, sites: demo.length });
  return { loaded: true, sites: demo.map((s) => s.id) };
});

// Removes the sample projects and everything under them. Real projects are never touched:
// only the fixed sample ids are deleted.
export const removeDemo = onCall({ ...callOpts, timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const me = await owner(req.auth?.uid);
  await checkLimit(me.id, 'demo');
  const db = getFirestore();
  const cid = me.companyId;
  let removed = 0;
  for (const sid of SAMPLE_IDS) {
    const ref = db.doc(paths.site(cid, sid));
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.sample !== true) continue;
    await ref.update({ removing: true }); // the spending trigger skips deletes on a site being removed
    await db.recursiveDelete(ref);
    removed++;
  }
  // People who were assigned to a sample project keep their other projects
  const assigned = await db.collection(paths.members(cid)).get();
  for (const u of assigned.docs) {
    const ids = (u.data().siteIds || []) as string[];
    if (ids.some((x) => x.startsWith(SAMPLE_PREFIX))) await u.ref.update({ siteIds: ids.filter((x) => !x.startsWith(SAMPLE_PREFIX)) });
  }
  if (removed) await db.collection(paths.activity(cid)).add({ who: me.name, whoId: me.id, what: 'removed the sample projects', at: FieldValue.serverTimestamp() });
  return { removed };
});
