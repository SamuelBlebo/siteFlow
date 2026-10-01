// Materials against the emulators: entries, stock counts, set-up, history and permissions
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { materialTotals, siteInput, validate } from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import {
  addMaterial, createSite, financeDoc, logMaterial, materialLogsQuery, setMaterialActive, stockCount, sub, subDoc, updateMaterial,
} from '../src/lib/db';
import { changePassword, team } from '../src/lib/account';
import { save, SaveError } from '../src/lib/save';
import { waitFor } from './wait';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-m`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
const names = { owner: 'Efua Quaye', super: 'super person', manager: 'manager person' };
let cid, sid, cementId;
const as = async (who) => { await signOut(auth); return (await signInWithEmailAndPassword(auth, email(who), pw[who])).user; };
const cement = async () => ({ id: cementId, ...(await getDoc(subDoc(cid, sid, 'materials', cementId))).data() });
const entry = async (who, o) => {
  const u = auth.currentUser;
  return save(logMaterial(cid, sid, { material: await cement(), uid: u.uid, name: names[who], ...o }));
};

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Quaye Construction', name: names.owner });
  cid = user.uid;
  const v = validate(siteInput, { name: 'Ho school block', location: 'Ho', stage: 'Foundation', budget: 500000 });
  const r = createSite(cid, v.data); await r.done; sid = r.id;
  for (const [who, role, sites] of [['super', 'supervisor', [sid]], ['manager', 'manager', []]]) {
    const res = await team.invite({ name: names[who], email: email(who), role, siteIds: sites });
    pw[who] = res.tempPassword;
  }
  for (const who of ['super', 'manager']) { await as(who); await changePassword(pw[who], `${who}-own-pass`); pw[who] = `${who}-own-pass`; }
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('set-up', () => {
  it('a project manager adds and edits materials; the supervisor cannot', async () => {
    await as('manager');
    await save(addMaterial(cid, sid, { name: 'Cement', unit: 'bags', stock: 20, reorderLevel: 10, avgDaily: 5 }));
    cementId = (await getDocs(sub(cid, sid, 'materials'))).docs[0].id;
    await save(updateMaterial(cid, sid, cementId, { name: 'Cement (50kg)', unit: 'bags', reorderLevel: 15, avgDaily: 6 }));
    expect((await cement())).toMatchObject({ name: 'Cement (50kg)', reorderLevel: 15, stock: 20, active: true });
    await as('super');
    await expect(save(updateMaterial(cid, sid, cementId, { name: 'X', unit: 'bags', reorderLevel: 0, avgDaily: 0 }))).rejects.toBeInstanceOf(SaveError);
  });
});

describe('entries', () => {
  it('the supervisor records a delivery with supplier and waybill, and usage with a note', async () => {
    await as('super');
    await entry('super', { type: 'delivery', qty: 100, supplier: 'Ghacem Tema', ref: 'WB-5521' });
    await entry('super', { type: 'usage', qty: 30, note: 'Foundation footings' });
    expect((await cement()).stock).toBe(90);
  });
  it('usage beyond the recorded stock is kept (balance goes below zero)', async () => {
    await as('super');
    await entry('super', { type: 'usage', qty: 95, note: 'Slab' });
    expect((await cement()).stock).toBe(-5);
  });
  it('the supervisor cannot record cost or a stock count', async () => {
    await as('super');
    await expect(entry('super', { type: 'delivery', qty: 1, cost: 90 })).rejects.toBeInstanceOf(SaveError);
    await expect(entry('super', { type: 'adjustment', qty: 5, note: 'Found more' })).rejects.toBeInstanceOf(SaveError);
  });
});

describe('stock counts', () => {
  it('a project manager counts stock; the difference is recorded with the reason', async () => {
    await as('manager');
    await save(stockCount(cid, sid, { material: await cement(), counted: 12, note: 'Monthly count', uid: auth.currentUser.uid, name: names.manager }));
    expect((await cement()).stock).toBe(12);
    expect(stockCount(cid, sid, { material: await cement(), counted: 12, note: 'Same', uid: auth.currentUser.uid, name: names.manager })).toBeNull();
  });
  it('a costed delivery by a manager also adds to spending', async () => {
    await as('manager');
    await entry('manager', { type: 'delivery', qty: 50, cost: 4500, supplier: 'Ghacem' });
    await waitFor(async () => (await getDoc(financeDoc(cid, sid))).data(), (f) => f.spent === 4500 && f.byCategory?.Materials === 4500);
  });
});

describe('history', () => {
  it('entries are newest first, can be filtered by material, and total up', async () => {
    await as('super');
    const logs = (await getDocs(materialLogsQuery(cid, sid, { materialId: cementId }))).docs.map((d) => d.data());
    expect(logs).toHaveLength(5);
    expect(logs.every((l) => l.createdByName)).toBe(true);
    const [t] = materialTotals(logs);
    expect(t).toMatchObject({ received: 150, used: 125, adjusted: 17, entries: 5 });
    expect(t.received - t.used + t.adjusted + 20).toBe((await cement()).stock); // opening 20 + movements = balance
  });
  it('archiving keeps the history', async () => {
    await as('manager');
    await save(setMaterialActive(cid, sid, cementId, false));
    expect((await cement()).active).toBe(false);
    expect((await getDocs(materialLogsQuery(cid, sid, { materialId: cementId }))).size).toBe(5);
  });
});
