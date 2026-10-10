// Wage periods paid once (even when two people record at the same moment), and the history
// triggers: a retry or a repeated delivery never writes anything twice, and a failed run is finished
// by the retry.
import { beforeEach, describe, expect, it } from 'vitest';
import '../src/setup';
import { getFirestore } from 'firebase-admin/firestore';
import { paths, type Expense } from '@siteflow/shared';
import { attendanceChanged, expenseChanged, recordWagesFor, releaseWagePeriod } from '../src/ledger';

const db = () => getFirestore();
const cid = 'ledger-c1';
let sid = '';
let n = 0;
const fin = { id: 'ledger-fin', name: 'Efua Finance', role: 'finance', companyId: cid };
const days = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'];

async function seedSite() {
  sid = `ledger-s${++n}`;
  await db().doc(paths.company(cid)).set({ name: 'Ledger Works', country: 'GH' });
  await db().doc(paths.member(cid, fin.id)).set({ name: fin.name, role: 'finance', active: true, siteIds: [] });
  await db().doc(paths.site(cid, sid)).set({ name: `Block ${n}`, status: 'active' });
  await db().doc(paths.subDoc(cid, sid, 'workers', 'w1')).set({ name: 'Yaw Mensah', trade: 'Mason', active: true });
  await db().doc(paths.subDoc(cid, sid, 'workers', 'w2')).set({ name: 'Ama Owusu', trade: 'Labourer', active: true });
  await db().doc(paths.workerPay(cid, sid, 'w1')).set({ dailyRate: 150 });
  await db().doc(paths.workerPay(cid, sid, 'w2')).set({ dailyRate: 100 });
  for (const date of days) await db().doc(paths.attendance(cid, sid, date)).set({ date, marks: { w1: 'present', w2: 'present' }, markedBy: 'sup' });
}
const expenses = async () => (await db().collection(paths.sub(cid, sid, 'expenses')).get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Expense & { id: string });
const attendance = async () => (await db().collection(paths.sub(cid, sid, 'attendance')).get()).docs.map((d) => d.data());
const register = async () => (await db().doc(paths.subDoc(cid, sid, 'finance', 'wages')).get()).data()?.periods || {};
const voided = (e: Expense) => ({ ...e, voided: true, amount: 0, voidedAmount: e.amount, voidReason: 'Wrong rates', updatedBy: fin.id });

beforeEach(seedSite);

describe('recording wages', () => {
  it('works out the amount on the server, locks the days and notes the period', async () => {
    const r = await recordWagesFor(db(), fin, { siteId: sid, from: days[0], to: days[4] });
    expect(r).toMatchObject({ amount: 1250, workers: 2, manual: { count: 0, total: 0 } });
    expect((await attendance()).every((a) => a.paidBy === r.id)).toBe(true);
    expect(await register()).toEqual({ [r.id]: { from: days[0], to: days[4] } });
  });

  it('two people recording overlapping periods at the same moment: exactly one is paid', async () => {
    const results = await Promise.allSettled([
      recordWagesFor(db(), fin, { siteId: sid, from: days[0], to: days[4] }),
      recordWagesFor(db(), fin, { siteId: sid, from: days[2], to: days[4] }),
      recordWagesFor(db(), fin, { siteId: sid, from: days[1], to: days[3] }), // all three overlap each other
    ]);
    const ok = results.filter((x) => x.status === 'fulfilled');
    const refused = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(refused).toHaveLength(2);
    for (const x of refused) expect(x.reason).toMatchObject({ code: 'already-exists' });
    const paid = (await expenses()).filter((e) => e.period);
    expect(paid).toHaveLength(1);
    // every locked day points at the one payment
    const id = (ok[0] as PromiseFulfilledResult<{ id: string }>).value.id;
    expect((await attendance()).filter((a) => a.paidBy).every((a) => a.paidBy === id)).toBe(true);
    expect(Object.keys(await register())).toEqual([id]);
  });

  it('the same period twice at the same moment (a double click) is paid once', async () => {
    const input = { siteId: sid, from: days[0], to: days[4] };
    const results = await Promise.allSettled([recordWagesFor(db(), fin, input), recordWagesFor(db(), fin, input)]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await expenses()).filter((e) => e.period)).toHaveLength(1);
  });

  it('labour entered by hand in the same days is reported back, not hidden', async () => {
    await db().doc(paths.subDoc(cid, sid, 'expenses', 'hand1')).set({ date: days[1], category: 'Labour', amount: 400, note: 'Tiling', labourReason: 'Tiling gang, by the job', createdBy: fin.id });
    await db().doc(paths.subDoc(cid, sid, 'expenses', 'hand2')).set({ date: '2026-07-01', category: 'Labour', amount: 90, note: 'Later', labourReason: 'Other week', createdBy: fin.id });
    const r = await recordWagesFor(db(), fin, { siteId: sid, from: days[0], to: days[4] });
    expect(r.manual).toEqual({ count: 1, total: 400 });
  });

  it('only finance roles, and never an empty period', async () => {
    await expect(recordWagesFor(db(), { ...fin, role: 'supervisor' }, { siteId: sid, from: days[0], to: days[4] })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(recordWagesFor(db(), fin, { siteId: sid, from: '2026-05-01', to: '2026-05-03' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('history triggers: retries and repeats', () => {
  it('a voided wage payment unlocks its days and can be paid again; running the void twice changes nothing', async () => {
    const r = await recordWagesFor(db(), fin, { siteId: sid, from: days[0], to: days[4] });
    const e = (await expenses()).find((x) => x.id === r.id)!;
    await db().doc(paths.subDoc(cid, sid, 'expenses', r.id)).set(voided(e));
    const ev = { id: 'evt-void-1', cid, sid, docId: r.id, before: e, after: voided(e), authId: fin.id };
    await expenseChanged(db(), ev);
    await expenseChanged(db(), ev); // delivered twice
    expect((await attendance()).some((a) => a.paidBy)).toBe(false);
    expect(await register()).toEqual({});
    const hist = await db().collection(`${paths.subDoc(cid, sid, 'expenses', r.id)}/history`).get();
    expect(hist.docs.filter((d) => d.data().action === 'voided')).toHaveLength(1);
    const log = await db().collection(paths.activity(cid)).where('what', '>=', 'voided').get();
    expect(log.docs.filter((d) => d.id === 'ev-evt-void-1')).toHaveLength(1);
    // and the period can be recorded again
    await expect(recordWagesFor(db(), fin, { siteId: sid, from: days[0], to: days[4] })).resolves.toMatchObject({ amount: 1250 });
  });

  it('a run that fails half way is finished by the retry, without doubling the history', async () => {
    const r = await recordWagesFor(db(), fin, { siteId: sid, from: days[0], to: days[4] });
    const e = (await expenses()).find((x) => x.id === r.id)!;
    await db().doc(paths.subDoc(cid, sid, 'expenses', r.id)).set(voided(e));
    const ev = { id: 'evt-void-2', cid, sid, docId: r.id, before: e, after: voided(e), authId: fin.id };
    // first run: history and log written, then it fails before unlocking
    await expect(expenseChanged(db(), ev, (step) => { if (step === 'activity') throw new Error('network'); })).rejects.toThrow('network');
    expect((await attendance()).every((a) => a.paidBy === r.id)).toBe(true); // still locked
    // the retry finishes the job
    await expenseChanged(db(), ev);
    expect((await attendance()).some((a) => a.paidBy)).toBe(false);
    const hist = await db().collection(`${paths.subDoc(cid, sid, 'expenses', r.id)}/history`).get();
    expect(hist.docs.filter((d) => d.data().action === 'voided')).toHaveLength(1);
  });

  it('unlocking an old payment never removes a newer payment\'s lock', async () => {
    const r1 = await recordWagesFor(db(), fin, { siteId: sid, from: days[0], to: days[4] });
    const e1 = (await expenses()).find((x) => x.id === r1.id)!;
    await db().doc(paths.subDoc(cid, sid, 'expenses', r1.id)).set(voided(e1));
    // the period is paid again before the (late) unlock of the first payment runs
    const r2 = await recordWagesFor(db(), fin, { siteId: sid, from: days[0], to: days[4] });
    await releaseWagePeriod(db(), cid, sid, r1.id);
    expect((await attendance()).every((a) => a.paidBy === r2.id)).toBe(true);
    expect(Object.keys(await register())).toEqual([r2.id]);
  });

  it('an edit repeated by a retry is in the history once', async () => {
    const before = { date: days[0], category: 'Materials', amount: 300, note: 'Cement', createdBy: fin.id } as Expense;
    const after = { ...before, amount: 320, updatedBy: fin.id };
    const ev = { id: 'evt-edit-1', cid, sid, docId: 'x1', before, after, authId: fin.id };
    await expenseChanged(db(), ev, (step) => { if (step === 'history') throw new Error('timeout'); }).catch(() => {});
    await expenseChanged(db(), ev);
    await expenseChanged(db(), ev);
    const hist = await db().collection(`${paths.subDoc(cid, sid, 'expenses', 'x1')}/history`).get();
    expect(hist.size).toBe(1);
    expect(hist.docs[0].data()).toMatchObject({ action: 'edited', changed: ['amount'], byName: fin.name });
  });

  it('labour entered by hand goes to the activity log with its reason, once', async () => {
    const after = { date: days[0], category: 'Labour', amount: 400, note: 'Tiling', labourReason: 'Tiling gang, by the job', createdBy: fin.id } as Expense;
    const ev = { id: 'evt-hand-1', cid, sid, docId: 'h1', after, authId: fin.id };
    await expenseChanged(db(), ev);
    await expenseChanged(db(), ev);
    const line = await db().doc(`${paths.activity(cid)}/ev-evt-hand-1`).get();
    expect(line.data()?.what).toMatch(/labour by hand .*not from attendance.*Tiling gang, by the job/);
  });

  it('an attendance change delivered twice is kept once', async () => {
    const ev = { id: 'evt-att-1', cid, sid, docId: days[0], before: { marks: { w1: 'present' } }, after: { marks: { w1: 'absent' }, markedBy: fin.id }, authId: fin.id };
    await attendanceChanged(db(), ev);
    await attendanceChanged(db(), ev);
    const c = await db().collection(`${paths.attendance(cid, sid, days[0])}/changes`).get();
    expect(c.size).toBe(1);
    expect(c.docs[0].data()).toMatchObject({ changes: [{ workerId: 'w1', from: 'present', to: 'absent' }], byName: fin.name });
  });
});
