// Attendance and workers against the emulators
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { attendanceTotals, dailyWages, dateRange, markAllPresent, siteInput, validate, wageSheet } from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import {
  addWorker, attendanceDoc, attendanceRangeQuery, createSite, markAttendance, setWorkerActive, setWorkerRate, sub, subDoc, updateWorker,
} from '../src/lib/db';
import { changePassword, team } from '../src/lib/account';
import { save, SaveError } from '../src/lib/save';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-a`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
let cid, sid;
const W = {};
const as = async (who) => { await signOut(auth); return (await signInWithEmailAndPassword(auth, email(who), pw[who])).user; };
const code = (p) => p.then(() => 'ok', (e) => e.code);
const marksOn = async (date) => (await getDoc(attendanceDoc(cid, sid, date))).data()?.marks || {};
const workerList = async () => (await getDocs(sub(cid, sid, 'workers'))).docs.map((d) => ({ id: d.id, ...d.data() }));

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Amoah Builders', name: 'Kwame Amoah' });
  cid = user.uid;
  const v = validate(siteInput, { name: 'Kasoa clinic', location: 'Kasoa', stage: 'Blockwork', budget: 300000 });
  const r = createSite(cid, v.data); await r.done; sid = r.id;
  const people = [['super', 'supervisor', [sid]], ['super2', 'supervisor', [sid]], ['finance', 'finance', []], ['viewer', 'viewer', [sid]], ['manager', 'manager', []]];
  for (const [who, role, sites] of people) {
    const res = await team.invite({ name: `${who} person`, email: email(who), role, siteIds: sites });
    pw[who] = res.tempPassword;
  }
  for (const [who] of people) { await as(who); await changePassword(pw[who], `${who}-own-pass`); pw[who] = `${who}-own-pass`; }
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('workers', () => {
  it('a supervisor adds workers (no pay) and fixes their details, but cannot switch them off or set pay', async () => {
    const u = await as('super');
    for (const [name, trade] of [['Ama Owusu', 'Mason'], ['Yaw Boateng', 'Labourer'], ['Kojo Asare', 'Carpenter']]) {
      await save(addWorker(cid, sid, { name, trade, phone: '' }, u.uid));
    }
    for (const w of await workerList()) W[w.name.split(' ')[0]] = w.id;
    await save(updateWorker(cid, sid, W.Yaw, { name: 'Yaw Boateng', trade: 'Steel bender', phone: '0241234567' }));
    expect((await getDoc(subDoc(cid, sid, 'workers', W.Yaw))).data()).toMatchObject({ trade: 'Steel bender', phone: '0241234567' });
    await expect(save(setWorkerActive(cid, sid, W.Kojo, false))).rejects.toBeInstanceOf(SaveError);
    await expect(save(setWorkerRate(cid, sid, W.Ama, 200))).rejects.toBeInstanceOf(SaveError);
  });
  it('finance sets daily rates; a manager switches a worker off', async () => {
    await as('finance');
    await save(setWorkerRate(cid, sid, W.Ama, 150));
    await save(setWorkerRate(cid, sid, W.Yaw, 100));
    await as('manager');
    await save(setWorkerActive(cid, sid, W.Kojo, false));
    expect((await getDoc(subDoc(cid, sid, 'workers', W.Kojo))).data().active).toBe(false);
  });
});

describe('marking attendance', () => {
  const day = '2026-06-15';
  it('one tap per worker, and two supervisors marking at once do not clash', async () => {
    const u = await as('super');
    await save(markAttendance(cid, sid, { marks: { [W.Ama]: 'late' }, uid: u.uid, date: day }));
    const u2 = await as('super2');
    await save(markAttendance(cid, sid, { marks: { [W.Yaw]: 'absent' }, uid: u2.uid, date: day }));
    expect(await marksOn(day)).toEqual({ [W.Ama]: 'late', [W.Yaw]: 'absent' });
  });
  it('changing a mark replaces only that worker', async () => {
    const u = await as('super');
    await save(markAttendance(cid, sid, { marks: { [W.Yaw]: 'present' }, uid: u.uid, date: day }));
    expect(await marksOn(day)).toEqual({ [W.Ama]: 'late', [W.Yaw]: 'present' });
  });
  it('"mark everyone present" fills only the unmarked', async () => {
    const u = await as('super');
    const d2 = '2026-06-16';
    await save(markAttendance(cid, sid, { marks: { [W.Ama]: 'leave' }, uid: u.uid, date: d2 }));
    const active = [{ id: W.Ama }, { id: W.Yaw }];
    await save(markAttendance(cid, sid, { marks: markAllPresent(active, await marksOn(d2)), uid: u.uid, date: d2 }));
    expect(await marksOn(d2)).toEqual({ [W.Ama]: 'leave', [W.Yaw]: 'present' });
  });
  it('viewers and finance cannot mark; bad statuses are refused', async () => {
    const v = await as('viewer');
    await expect(save(markAttendance(cid, sid, { marks: { [W.Ama]: 'present' }, uid: v.uid, date: day }))).rejects.toBeInstanceOf(SaveError);
    const f = await as('finance');
    await expect(save(markAttendance(cid, sid, { marks: { [W.Ama]: 'present' }, uid: f.uid, date: day }))).rejects.toBeInstanceOf(SaveError);
    const u = await as('super');
    await expect(save(markAttendance(cid, sid, { marks: { [W.Ama]: 'sick' }, uid: u.uid, date: day }))).rejects.toBeInstanceOf(SaveError);
  });
});

describe('history and wages', () => {
  it('a date range returns the days in order, with totals per worker', async () => {
    await as('super');
    const records = (await getDocs(attendanceRangeQuery(cid, sid, '2026-06-15', '2026-06-17'))).docs.map((d) => d.data());
    expect(records.map((r) => r.date)).toEqual(['2026-06-15', '2026-06-16']);
    const workers = await workerList();
    const t = attendanceTotals(workers, records, dateRange('2026-06-15', '2026-06-17'));
    expect(t.find((x) => x.workerId === W.Ama)).toMatchObject({ worked: 1, late: 1, leave: 1, unmarked: 1 });
    expect(t.find((x) => x.workerId === W.Yaw)).toMatchObject({ worked: 2, present: 2, unmarked: 1 });
  });
  it('finance sees wages; the supervisor cannot read pay', async () => {
    await as('finance');
    const pay = Object.fromEntries((await getDocs(sub(cid, sid, 'workerPay'))).docs.map((d) => [d.id, d.data()]));
    const records = (await getDocs(attendanceRangeQuery(cid, sid, '2026-06-15', '2026-06-16'))).docs.map((d) => d.data());
    const workers = await workerList();
    expect(wageSheet(workers, pay, records).total).toBe(150 * 1 + 100 * 2); // Ama late once (paid), Yaw present twice
    expect(dailyWages(workers, pay, records[0].marks)).toBe(250);
    await as('super');
    expect(await code(getDocs(sub(cid, sid, 'workerPay')))).toBe('permission-denied');
  });
});
