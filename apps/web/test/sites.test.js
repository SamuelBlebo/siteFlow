// Site creation, details, status, budget and site assignment against the emulators
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { validate, siteDetailsInput, siteInput } from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import {
  createSite, financeDoc, sendReport, setBudget, setSiteStatus, siteDoc, sitesCol, updateSiteDetails,
} from '../src/lib/db';
import { changePassword, team } from '../src/lib/account';
import { save, SaveError } from '../src/lib/save';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-s`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
const ids = {};
let cid, s1, s2;
const as = async (who) => { await signOut(auth); return (await signInWithEmailAndPassword(auth, email(who), pw[who])).user; };
const code = (p) => p.then(() => 'ok', (e) => e.code);
const form = (schema, data) => { const v = validate(schema, data); if (!v.ok) throw new Error(v.error); return v.data; };
async function send(sid, uid, date) {
  const site = { id: sid, ...(await getDoc(siteDoc(cid, sid))).data() };
  return save(sendReport(cid, site, { text: 'Blockwork to lintel level', stage: 'Blockwork', progress: 20, workersPresent: 3 }, { uid, name: 'super person', date }).done);
}

async function invite(who, role, siteIds = []) {
  const r = await team.invite({ name: `${who} person`, email: email(who), role, siteIds });
  ids[who] = r.uid;
  await as('owner');
  pw[who] = r.tempPassword;
}
async function firstSignIn(who) {
  await as(who);
  await changePassword(pw[who], `${who}-own-pass`);
  pw[who] = `${who}-own-pass`;
}

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Boateng Builders', name: 'Ama Boateng' });
  cid = user.uid;
  await invite('manager', 'manager');
  await invite('finance', 'finance');
  await invite('super', 'supervisor');
  for (const who of ['manager', 'finance', 'super']) await firstSignIn(who);
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('creating and editing sites', () => {
  it('a project manager creates a site with dates, foreman and client', async () => {
    await as('manager');
    const data = form(siteInput, {
      name: 'East Legon villa', location: 'East Legon, Accra', stage: 'Foundation', budget: '900000',
      planStart: '2026-02-01', planEnd: '2026-11-30', foremanName: 'Yaw', foremanPhone: '024 111 2222',
      clientName: 'Dr Owusu', clientEmail: 'Owusu@Example.com',
    });
    const r = createSite(cid, data);
    await save(r.done);
    s1 = r.id;
    const site = (await getDoc(siteDoc(cid, s1))).data();
    expect(site).toMatchObject({
      status: 'active', progress: 0, planStart: '2026-02-01', planEnd: '2026-11-30', foremanPhone: '0241112222',
      client: { name: 'Dr Owusu', phone: '', email: 'owusu@example.com' },
    });
    expect(site.budget).toBeUndefined();
    const r2 = createSite(cid, form(siteInput, { name: 'Spintex shops', location: 'Spintex', stage: 'Site clearing', budget: 400000 }));
    await save(r2.done);
    s2 = r2.id;
  });

  it('details can be changed and cleared', async () => {
    await as('manager');
    await save(updateSiteDetails(cid, s1, form(siteDetailsInput, { name: 'East Legon villa', location: 'East Legon', stage: 'Blockwork', planStart: '', planEnd: '' })));
    expect((await getDoc(siteDoc(cid, s1))).data()).toMatchObject({ stage: 'Blockwork', planStart: null, planEnd: null, client: null });
  });

  it('finance and site roles cannot change site details or the budget', async () => {
    await as('finance');
    await expect(save(updateSiteDetails(cid, s1, form(siteDetailsInput, { name: 'Renamed', location: 'X Y', stage: 'Roofing' })))).rejects.toBeInstanceOf(SaveError);
    await expect(save(setBudget(cid, s1, 1))).rejects.toBeInstanceOf(SaveError);
    await as('super');
    await expect(save(setSiteStatus(cid, s1, 'closed'))).rejects.toBeInstanceOf(SaveError);
  });

  it('a project manager changes the budget', async () => {
    await as('manager');
    await save(setBudget(cid, s1, 950000));
    expect((await getDoc(financeDoc(cid, s1))).data().budget).toBe(950000);
  });
});

describe('assigning people to sites', () => {
  it('a supervisor sees only the sites they are assigned to', async () => {
    await as('super');
    expect(await code(getDoc(siteDoc(cid, s1)))).toBe('permission-denied');
    await as('manager');
    await team.assignToSite({ sid: s1, uid: ids.super, assigned: true });
    await as('super');
    expect((await getDoc(siteDoc(cid, s1))).data().name).toBe('East Legon villa');
    expect(await code(getDoc(siteDoc(cid, s2)))).toBe('permission-denied');
    expect(await code(getDocs(sitesCol(cid)))).toBe('permission-denied');
  });

  it('only site managers assign, only site-scoped people can be assigned', async () => {
    await as('super');
    expect(await code(team.assignToSite({ sid: s2, uid: ids.super, assigned: true }))).toBe('functions/permission-denied');
    await as('finance');
    expect(await code(team.assignToSite({ sid: s2, uid: ids.super, assigned: true }))).toBe('functions/permission-denied');
    await as('manager');
    expect(await code(team.assignToSite({ sid: s2, uid: ids.finance, assigned: true }))).toBe('functions/failed-precondition');
    expect(await code(team.assignToSite({ sid: 'no-such-site', uid: ids.super, assigned: true }))).toBe('functions/not-found');
  });

  it('taking someone off a site removes their access', async () => {
    await as('manager');
    await team.assignToSite({ sid: s2, uid: ids.super, assigned: true });
    await team.assignToSite({ sid: s2, uid: ids.super, assigned: false });
    await as('super');
    expect(await code(getDoc(siteDoc(cid, s2)))).toBe('permission-denied');
  });
});

describe('site status', () => {
  it('on hold still takes reports; closed does not; reopening restores it', async () => {
    await as('manager');
    await save(setSiteStatus(cid, s1, 'on_hold'));
    const u = await as('super');
    await send(s1, u.uid, '2026-06-01');

    await as('manager');
    await save(setSiteStatus(cid, s1, 'closed'));
    await as('super');
    await expect(send(s1, u.uid, '2026-06-02')).rejects.toBeInstanceOf(SaveError);
    expect((await getDoc(siteDoc(cid, s1))).data().status).toBe('closed'); // still readable

    await as('manager');
    await save(setSiteStatus(cid, s1, 'active'));
    await as('super');
    await send(s1, u.uid, '2026-06-03');
  });

  it('sites cannot be deleted, only closed', async () => {
    await as('owner');
    const { deleteDoc } = await import('firebase/firestore');
    expect(await code(deleteDoc(siteDoc(cid, s2)))).toBe('permission-denied');
  });
});
