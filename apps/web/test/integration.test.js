// End-to-end check of the web data layer against the Firebase emulators:
// real sign-in, real Cloud Functions, real security rules.
//   npm run test:web   (from the repo root; starts the emulators)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../src/firebase';
import {
  addExpense, addMaterial, addWorker, attendanceDoc, createSite, financeDoc, logMaterial, markAttendance, myReportId,
  sendReport, siteDoc, sub, subDoc, uploadPhotos, userDoc,
} from '../src/lib/db';
import { save, SaveError } from '../src/lib/save';
import { waitFor } from './wait';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = Date.now();
const ownerEmail = `owner-${run}@example.com`;
let cid, sid, cementId, supervisorPw, viewerPw;
const call = (name, data) => httpsCallable(functions, name)(data).then((r) => r.data);
const as = async (email, pw) => { await signOut(auth); return (await signInWithEmailAndPassword(auth, email, pw)).user; };

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, ownerEmail, 'password123');
  await call('createCompany', { companyName: 'Mensah Builders', name: 'Ama Mensah' });
  cid = user.uid;
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('owner', () => {
  it('sign-up creates the company and owner profile on the server', async () => {
    const p = (await getDoc(userDoc(cid))).data();
    expect(p).toMatchObject({ companyId: cid, role: 'owner', name: 'Ama Mensah', active: true });
    // Calling again is harmless (retry after a half-finished sign-up)
    await expect(call('createCompany', { companyName: 'Mensah Builders', name: 'Ama Mensah' })).resolves.toEqual({ companyId: cid });
  });

  it('creates a site with its budget kept apart', async () => {
    const r = createSite(cid, { name: 'Adenta house', location: 'Accra', foremanName: 'Kofi', foremanPhone: '0241234567', stage: 'Foundation', budget: 250000 });
    await save(r.done);
    sid = r.id;
    const site = (await getDoc(siteDoc(cid, sid))).data();
    expect(site.budget).toBeUndefined();
    expect((await getDoc(financeDoc(cid, sid))).data()).toMatchObject({ budget: 250000, spent: 0 });
  });

  it('sets up materials, logs a costed delivery and an expense', async () => {
    await save(addMaterial(cid, sid, { name: 'Cement', unit: 'bags', stock: 10, reorderLevel: 5, avgDaily: 4 }));
    cementId = (await getDocs(sub(cid, sid, 'materials'))).docs[0].id;
    const material = { id: cementId, name: 'Cement', unit: 'bags' };
    await save(logMaterial(cid, sid, { material, type: 'delivery', qty: 40, cost: 3000, supplier: 'Ghacem', uid: cid, name: 'Ama Mensah' }));
    await save(addExpense(cid, sid, { date: '2026-06-01', category: 'Transport', note: 'Truck', amount: 500, payee: '', method: 'Cash', ref: '' }, { uid: cid, name: 'Ama Mensah' }));
    expect((await getDoc(subDoc(cid, sid, 'materials', cementId))).data().stock).toBe(50);
    await waitFor(async () => (await getDoc(financeDoc(cid, sid))).data(), (f) => f.spent === 3500); // worked out by the server
  });

  it('adds a worker with pay kept apart', async () => {
    await save(addWorker(cid, sid, { name: 'Yaw Boateng', trade: 'Mason', dailyRate: 150 }, cid));
    const w = (await getDocs(sub(cid, sid, 'workers'))).docs[0];
    expect(w.data().dailyRate).toBeUndefined();
    expect((await getDocs(sub(cid, sid, 'workerPay'))).docs[0].data().dailyRate).toBe(150);
  });

  it('invites a supervisor and a viewer', async () => {
    const s = await call('inviteMember', { name: 'Kofi Asante', email: `super-${run}@example.com`, role: 'supervisor', siteIds: [sid, 'not-a-site'] });
    const v = await call('inviteMember', { name: 'Esi Viewer', email: `viewer-${run}@example.com`, role: 'viewer', siteIds: [sid] });
    supervisorPw = s.tempPassword; viewerPw = v.tempPassword;
    expect((await getDoc(userDoc(s.uid))).data()).toMatchObject({ role: 'supervisor', siteIds: [sid] });
    await expect(call('inviteMember', { name: 'Bad', email: `bad-${run}@example.com`, role: 'owner' })).rejects.toThrow();
  });
});

describe('supervisor', () => {
  let uid;
  beforeAll(async () => { uid = (await as(`super-${run}@example.com`, supervisorPw)).uid; });

  it('marks attendance per worker', async () => {
    const workers = (await getDocs(sub(cid, sid, 'workers'))).docs;
    await save(markAttendance(cid, sid, { marks: { [workers[0].id]: 'present' }, uid }));
    expect((await getDoc(attendanceDoc(cid, sid))).data().marks).toEqual({ [workers[0].id]: 'present' });
  });

  it('logs usage; stock moves with it', async () => {
    await save(logMaterial(cid, sid, { material: { id: cementId, name: 'Cement', unit: 'bags' }, type: 'usage', qty: 6, uid, name: 'Kofi Asante' }));
    expect((await getDoc(subDoc(cid, sid, 'materials', cementId))).data().stock).toBe(44);
  });

  it('cannot record costs, and gets a friendly message instead of a raw error', async () => {
    const material = { id: cementId, name: 'Cement', unit: 'bags' };
    const err = await save(logMaterial(cid, sid, { material, type: 'delivery', qty: 1, cost: 100, uid, name: 'Kofi Asante' })).catch((e) => e);
    expect(err).toBeInstanceOf(SaveError);
    expect(err.message).toMatch(/permission/i);
    expect(err.message).not.toMatch(/PERMISSION_DENIED|FirebaseError/);
  });

  it('cannot read the budget or pay', async () => {
    await expect(getDoc(financeDoc(cid, sid))).rejects.toThrow();
    await expect(getDocs(sub(cid, sid, 'workerPay'))).rejects.toThrow();
  });

  it('sends the daily report with a photo', async () => {
    const rid = myReportId(uid);
    const { photos } = await uploadPhotos(cid, sid, rid, [new File([new Uint8Array([0xff, 0xd8, 0xff])], 'site.jpg', { type: 'image/jpeg' })]);
    const site = { id: sid, ...(await getDoc(siteDoc(cid, sid))).data() };
    await save(sendReport(cid, site, { text: 'Cast lintels', stage: 'Lintel level', progress: 35, workersPresent: 1 }, { uid, name: 'Kofi Asante', photos }).done);
    expect((await getDoc(siteDoc(cid, sid))).data()).toMatchObject({ stage: 'Lintel level', progress: 35 });
    expect((await getDoc(subDoc(cid, sid, 'reports', rid))).data().photos).toHaveLength(1);
  });
});

describe('viewer', () => {
  it('reads the site but cannot change anything', async () => {
    const uid = (await as(`viewer-${run}@example.com`, viewerPw)).uid;
    expect((await getDoc(siteDoc(cid, sid))).data().name).toBe('Adenta house');
    const material = { id: cementId, name: 'Cement', unit: 'bags' };
    await expect(save(logMaterial(cid, sid, { material, type: 'usage', qty: 1, uid, name: 'Esi Viewer' }))).rejects.toBeInstanceOf(SaveError);
    await expect(save(addWorker(cid, sid, { name: 'Sneaky', trade: 'Mason' }, uid))).rejects.toBeInstanceOf(SaveError);
  });
});
