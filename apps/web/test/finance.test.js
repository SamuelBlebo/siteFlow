// Budgets, expenses and server-computed totals against the emulators (Cloud Function included)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { deleteDoc, getDoc, getDocs, increment, terminate, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { budgetVariance, expenseInput, siteFinanceSummary, siteInput, todayKey, validate, wageSheet } from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import {
  addExpense, addWorker, attendanceDoc, attendanceRangeQuery, createSite, expenseHistoryQuery, expensesQuery, financeDoc, markAttendance, setBudget,
  setWorkerRate, sub, subDoc, updateExpense, voidExpense,
} from '../src/lib/db';
import { recordWages, team } from '../src/lib/account';
import { save, SaveError } from '../src/lib/save';
import { waitFor } from './wait';
import { join } from './join';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-f`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
const names = { owner: 'Nana Agyeman', finance: 'finance person', manager: 'manager person', super: 'super person' };
let cid, sid;
const as = async (who) => { await signOut(auth); const u = (await signInWithEmailAndPassword(auth, email(who), pw[who])).user; return { uid: u.uid, name: names[who] }; };
const fin = async () => (await getDoc(financeDoc(cid, sid))).data();
const until = (check) => waitFor(fin, check);
const expense = (extra = {}) => ({ date: '2026-06-10', category: 'Materials', amount: 1000, note: '', payee: '', method: 'Cash', ref: '', ...extra });

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Agyeman Works', name: names.owner });
  cid = user.uid;
  const v = validate(siteInput, { name: 'Takoradi office', location: 'Takoradi', stage: 'Foundation', budget: 100000 });
  const r = createSite(cid, v.data); await r.done; sid = r.id;
  for (const [who, role] of [['finance', 'finance'], ['manager', 'manager'], ['super', 'supervisor']]) {
    const res = await team.invite({ name: names[who], email: email(who), role, siteIds: role === 'supervisor' ? [sid] : [] });
    pw[who] = await join(res, `${who}-own-pass`);
  }
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('budget', () => {
  it('a project manager sets the total and category budgets; finance cannot', async () => {
    await as('manager');
    await save(setBudget(cid, sid, 120000, { Materials: 60000, Labour: 40000 }));
    expect(await fin()).toMatchObject({ budget: 120000, budgetByCategory: { Materials: 60000, Labour: 40000 }, spent: 0 });
    await as('finance');
    await expect(save(setBudget(cid, sid, 1))).rejects.toBeInstanceOf(SaveError);
  });
});

describe('expenses and server totals', () => {
  it('finance records expenses; the server works out spent and category totals', async () => {
    const me = await as('finance');
    await save(addExpense(cid, sid, expense({ amount: 45000.5, payee: 'Ghacem', ref: 'INV-1' }), me));
    await save(addExpense(cid, sid, expense({ category: 'Transport', amount: 1200 }), me));
    const f = await until((x) => x.expenseCount === 2);
    expect(f).toMatchObject({ spent: 46200.5, byCategory: { Materials: 45000.5, Transport: 1200 } });
  });
  it('correcting and voiding an expense keeps the totals right, and both are in its history', async () => {
    const me = await as('finance');
    const [first] = (await getDocs(expensesQuery(cid, sid))).docs.filter((d) => d.data().category === 'Transport');
    await save(updateExpense(cid, sid, first.id, expense({ category: 'Transport', amount: 800, note: 'Corrected' }), me));
    await until((x) => x.byCategory?.Transport === 800);
    await save(voidExpense(cid, sid, { id: first.id, amount: 800 }, 'Entered twice', me));
    const f = await until((x) => x.spent === 45000.5);
    expect(f.byCategory.Transport ?? 0).toBe(0);
    const x = (await getDoc(subDoc(cid, sid, 'expenses', first.id))).data();
    expect(x).toMatchObject({ voided: true, amount: 0, voidedAmount: 800, voidReason: 'Entered twice', voidedBy: me.uid });
    const history = await waitFor(async () => (await getDocs(expenseHistoryQuery(cid, sid, first.id))).docs.map((d) => d.data()), (h) => h.some((x) => x.action === 'voided'));
    expect(history.map((h) => h.action)).toEqual(expect.arrayContaining(['edited', 'voided']));
    expect(history.find((h) => h.action === 'edited')).toMatchObject({ byName: names.finance, before: { amount: 1200 }, after: { amount: 800 } });
  });
  it('expenses are never deleted; a void is final; every change names its author', async () => {
    const me = await as('finance');
    const docs = (await getDocs(expensesQuery(cid, sid))).docs;
    const live = docs.find((d) => !d.data().voided);
    const dead = docs.find((d) => d.data().voided);
    await expect(deleteDoc(subDoc(cid, sid, 'expenses', live.id))).rejects.toThrow();
    await expect(updateDoc(subDoc(cid, sid, 'expenses', dead.id), { note: 'Un-void it', updatedBy: me.uid, updatedByName: me.name })).rejects.toThrow();
    await expect(updateDoc(subDoc(cid, sid, 'expenses', live.id), { amount: 1 })).rejects.toThrow(); // unsigned
    const owner = await as('owner');
    await expect(updateDoc(subDoc(cid, sid, 'expenses', live.id), { amount: 1, updatedBy: me.uid, updatedByName: me.name })).rejects.toThrow(); // signed as someone else
    void owner;
  });
  it('a double save of the same new expense does not create two', async () => {
    const me = await as('finance');
    const id = 'dup-check-1';
    await save(addExpense(cid, sid, expense({ category: 'Other', amount: 5 }), me, id));
    await expect(save(addExpense(cid, sid, expense({ category: 'Other', amount: 5 }), me, id))).rejects.toBeInstanceOf(SaveError);
    await save(voidExpense(cid, sid, { id, amount: 5 }, 'Test entry', me));
    await until((x) => x.spent === 45000.5);
  });
  it('labour paid by hand needs a reason, is marked as such, and is logged', async () => {
    const me = await as('finance');
    await expect(save(addExpense(cid, sid, expense({ category: 'Labour', amount: 7 }), me, 'hand-1'))).rejects.toBeInstanceOf(SaveError);
    const v = validate(expenseInput, expense({ category: 'Labour', amount: 7, labourReason: 'Casual labourers, paid by the day' }));
    await save(addExpense(cid, sid, v.data, me, 'hand-2'));
    expect((await getDoc(subDoc(cid, sid, 'expenses', 'hand-2'))).data()).toMatchObject({ category: 'Labour', labourReason: 'Casual labourers, paid by the day' });
    await save(voidExpense(cid, sid, { id: 'hand-2', amount: 7 }, 'Test entry', me));
    await until((x) => x.spent === 45000.5);
  });
  it('nobody can write the totals from the app, not even the owner', async () => {
    await as('owner');
    await expect(updateDoc(financeDoc(cid, sid), { spent: increment(-45000) })).rejects.toThrow();
    await as('finance');
    await expect(updateDoc(financeDoc(cid, sid), { byCategory: { Materials: 0 } })).rejects.toThrow();
  });
  it('the supervisor cannot see or record money', async () => {
    const me = await as('super');
    await expect(getDoc(financeDoc(cid, sid))).rejects.toThrow();
    await expect(save(addExpense(cid, sid, expense(), me))).rejects.toBeInstanceOf(SaveError);
  });
});

describe('labour cost and summaries', () => {
  it('wages are worked out on the server, a period is paid once, and its attendance is locked until voided', async () => {
    const sup = await as('super');
    await save(addWorker(cid, sid, { name: 'Kojo Badu', trade: 'Mason', phone: '' }, sup.uid));
    await save(addWorker(cid, sid, { name: 'Esi Arthur', trade: 'Labourer', phone: '' }, sup.uid));
    const workers = (await getDocs(sub(cid, sid, 'workers'))).docs.map((d) => ({ id: d.id, ...d.data() }));
    // The site team marks today and yesterday (the rules allow recent days only)
    const today = todayKey();
    const yesterday = todayKey(new Date(Date.now() - 86400000));
    await save(markAttendance(cid, sid, { marks: { [workers[0].id]: 'present', [workers[1].id]: 'late' }, uid: sup.uid, date: yesterday }));
    await save(markAttendance(cid, sid, { marks: { [workers[0].id]: 'present', [workers[1].id]: 'absent' }, uid: sup.uid, date: today }));
    await as('finance');
    await save(setWorkerRate(cid, sid, workers[0].id, 150));
    await save(setWorkerRate(cid, sid, workers[1].id, 90));
    const pay = Object.fromEntries((await getDocs(sub(cid, sid, 'workerPay'))).docs.map((d) => [d.id, d.data()]));
    const att = (await getDocs(attendanceRangeQuery(cid, sid, yesterday, today))).docs.map((d) => d.data());
    expect(wageSheet(workers, pay, att).total).toBe(150 * 2 + 90);
    const paid = await recordWages({ siteId: sid, from: yesterday, to: today });
    expect(paid).toMatchObject({ amount: 390, workers: 2 });
    // The same days can't be paid twice
    await expect(recordWages({ siteId: sid, from: today, to: today })).rejects.toMatchObject({ code: 'functions/already-exists' });
    // Paid attendance is locked for everyone, managers included
    const sup2 = await as('super');
    await expect(save(markAttendance(cid, sid, { marks: { [workers[1].id]: 'present' }, uid: sup2.uid, date: today }))).rejects.toBeInstanceOf(SaveError);
    const pm = await as('manager');
    await expect(save(markAttendance(cid, sid, { marks: { [workers[1].id]: 'present' }, uid: pm.uid, date: today }))).rejects.toBeInstanceOf(SaveError);
    expect((await getDoc(attendanceDoc(cid, sid, today))).data().paidBy).toBe(paid.id);
    // Wage payments can be voided (not edited); voiding unlocks their attendance
    const fin2 = await as('finance');
    await expect(updateDoc(subDoc(cid, sid, 'expenses', paid.id), { amount: 1, updatedBy: fin2.uid, updatedByName: fin2.name })).rejects.toThrow();
    await save(voidExpense(cid, sid, { id: paid.id, amount: 390 }, 'Wrong rates', fin2));
    await waitFor(async () => (await getDoc(attendanceDoc(cid, sid, today))).data().paidBy, (p) => p === undefined);
    const sup3 = await as('super');
    await save(markAttendance(cid, sid, { marks: { [workers[1].id]: 'present' }, uid: sup3.uid, date: today }));
    // ... and the period can be paid again
    await as('finance');
    const again = await recordWages({ siteId: sid, from: yesterday, to: today });
    expect(again.amount).toBe(150 * 2 + 90 * 2);
    const f = await until((x) => x.byCategory?.Labour === 480);
    const v = budgetVariance(f);
    expect(v.rows.find((r) => r.category === 'Labour')).toMatchObject({ budget: 40000, actual: 480 });
    expect(v.total).toMatchObject({ budget: 120000, actual: 45480.5 });
  });
  it('summary: used, remaining and the expected final cost', async () => {
    await as('owner');
    const s = siteFinanceSummary(await fin(), 25);
    expect(s).toMatchObject({ budget: 120000, spent: 45480.5, remaining: 74519.5, usedPct: 38, forecast: 181922 });
    expect(s.overspendRisk).toBe(false); // 38% used vs 25% done is a 13-point gap, under the 15-point threshold
    expect(siteFinanceSummary(await fin(), 20).overspendRisk).toBe(true);
  });
});

// Last, because it changes the running totals the tests above check
describe('busy moments', () => {
  it('expenses saved at the same moment are all counted, including a custom category', async () => {
    const me = await as('finance');
    const before = await fin();
    await Promise.all([
      save(addExpense(cid, sid, expense({ category: 'Equipment', amount: 300 }), me)),
      save(addExpense(cid, sid, expense({ category: 'Permits', amount: 200 }), me)),
      save(addExpense(cid, sid, expense({ category: 'Security', amount: 150 }), me)),
      save(addExpense(cid, sid, expense({ category: 'Materials', amount: 50 }), me)),
    ]);
    const f = await until((x) => x.expenseCount === before.expenseCount + 4 && x.byCategory?.Security === 150 && x.byCategory?.Equipment === 300 && x.byCategory?.Permits === 200);
    expect(f.spent).toBe(before.spent + 700);
    expect(f.byCategory.Materials).toBe((before.byCategory.Materials || 0) + 50);
  });
});
