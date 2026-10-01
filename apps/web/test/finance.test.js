// Budgets, expenses and server-computed totals against the emulators (Cloud Function included)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, increment, terminate, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { budgetVariance, siteFinanceSummary, siteInput, validate, wageSheet } from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import {
  addExpense, addWorker, attendanceRangeQuery, createSite, deleteExpense, expensesQuery, financeDoc, markAttendance, recordWages, setBudget,
  setWorkerRate, sub, updateExpense,
} from '../src/lib/db';
import { changePassword, team } from '../src/lib/account';
import { save, SaveError } from '../src/lib/save';
import { waitFor } from './wait';

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
    pw[who] = res.tempPassword;
  }
  for (const who of ['finance', 'manager', 'super']) { await as(who); await changePassword(pw[who], `${who}-own-pass`); pw[who] = `${who}-own-pass`; }
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
  it('correcting and deleting an expense keeps the totals right', async () => {
    const me = await as('finance');
    const [first] = (await getDocs(expensesQuery(cid, sid))).docs.filter((d) => d.data().category === 'Transport');
    await save(updateExpense(cid, sid, first.id, expense({ category: 'Transport', amount: 800, note: 'Corrected' })));
    await until((x) => x.byCategory?.Transport === 800);
    await save(deleteExpense(cid, sid, first.id));
    const f = await until((x) => x.expenseCount === 1);
    expect(f.spent).toBe(45000.5);
    expect(f.byCategory.Transport ?? 0).toBe(0);
    void me;
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
  it('wages from attendance are recorded as a Labour expense', async () => {
    const sup = await as('super');
    await save(addWorker(cid, sid, { name: 'Kojo Badu', trade: 'Mason', phone: '' }, sup.uid));
    await save(addWorker(cid, sid, { name: 'Esi Arthur', trade: 'Labourer', phone: '' }, sup.uid));
    const workers = (await getDocs(sub(cid, sid, 'workers'))).docs.map((d) => ({ id: d.id, ...d.data() }));
    await save(markAttendance(cid, sid, { marks: { [workers[0].id]: 'present', [workers[1].id]: 'late' }, uid: sup.uid, date: '2026-06-08' }));
    await save(markAttendance(cid, sid, { marks: { [workers[0].id]: 'present', [workers[1].id]: 'absent' }, uid: sup.uid, date: '2026-06-09' }));
    const me = await as('finance');
    await save(setWorkerRate(cid, sid, workers[0].id, 150));
    await save(setWorkerRate(cid, sid, workers[1].id, 90));
    const pay = Object.fromEntries((await getDocs(sub(cid, sid, 'workerPay'))).docs.map((d) => [d.id, d.data()]));
    const att = (await getDocs(attendanceRangeQuery(cid, sid, '2026-06-08', '2026-06-14'))).docs.map((d) => d.data());
    const sheet = wageSheet(workers, pay, att);
    expect(sheet.total).toBe(150 * 2 + 90);
    await save(recordWages(cid, sid, { from: '2026-06-08', to: '2026-06-14', amount: sheet.total, date: '2026-06-15' }, me));
    const f = await until((x) => x.byCategory?.Labour === 390);
    const v = budgetVariance(f);
    expect(v.rows.find((r) => r.category === 'Labour')).toMatchObject({ budget: 40000, actual: 390 });
    expect(v.total).toMatchObject({ budget: 120000, actual: 45390.5 });
  });
  it('summary: used, remaining and the expected final cost', async () => {
    await as('owner');
    const s = siteFinanceSummary(await fin(), 25);
    expect(s).toMatchObject({ budget: 120000, spent: 45390.5, remaining: 74609.5, usedPct: 38, forecast: 181562 });
    expect(s.overspendRisk).toBe(false); // 38% used vs 25% done is a 13-point gap, under the 15-point threshold
    expect(siteFinanceSummary(await fin(), 20).overspendRisk).toBe(true);
  });
});
