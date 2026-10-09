// Asking people for reports against the emulators
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../src/firebase';
import { createSite, myReportRequestsQuery, reportRef, reportRequestsQuery, sendReport, siteDoc } from '../src/lib/db';
import { cancelReportRequest, requestReport, team } from '../src/lib/account';
import { save } from '../src/lib/save';
import { todayKey } from '@siteflow/shared';
import { join } from './join';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-q`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
const ids = {};
let cid, sid;
const as = async (who) => { await signOut(auth); return (await signInWithEmailAndPassword(auth, email(who), pw[who])).user; };
const code = (p) => p.then(() => 'ok', (e) => e.code);
const until = async (read, ok, ms = 15000) => { const end = Date.now() + ms; for (;;) { const v = await read(); if (ok(v) || Date.now() > end) return v; await new Promise((r) => setTimeout(r, 300)); } };

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Darko Contractors', name: 'Esi Darko' });
  cid = user.uid;
  const s = createSite(cid, { name: 'Spintex warehouse', location: 'Spintex', stage: 'Roofing', budget: 900000 }); await s.done; sid = s.id;
  for (const [who, role, sites] of [['super', 'supervisor', [sid]], ['viewer', 'viewer', [sid]], ['finance', 'finance', []]]) {
    const r = await team.invite({ name: `${who} person`, email: email(who), phone: '0241234567', role, siteIds: sites });
    ids[who] = r.uid; pw[who] = await join(r, `${who}-own-pass`);
  }
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('report requests', () => {
  it('only people who can send reports on the project can be asked, and only managers can ask', async () => {
    await as('owner');
    expect(await code(requestReport({ siteId: sid, uids: [ids.viewer], due: todayKey() }))).toBe('functions/failed-precondition');
    expect(await code(requestReport({ siteId: sid, uids: [ids.finance], due: todayKey() }))).toBe('functions/failed-precondition');
    await as('super');
    expect(await code(requestReport({ siteId: sid, uids: [ids.super], due: todayKey() }))).toBe('functions/permission-denied');
  });

  it('the owner asks the supervisor; the supervisor sees it; their report closes it', async () => {
    await as('owner');
    expect(await requestReport({ siteId: sid, uids: [ids.super], due: todayKey(), note: 'Photos of the roof please', whatsapp: true, email: true })).toEqual({ requested: 1 });
    const list = (await getDocs(reportRequestsQuery(cid, sid))).docs.map((d) => d.data());
    expect(list[0]).toMatchObject({ to: ids.super, toRole: 'supervisor', byName: 'Esi Darko', byRole: 'owner', status: 'open', note: 'Photos of the roof please' });
    const u = await as('super');
    expect((await getDocs(myReportRequestsQuery(cid, sid, u.uid))).size).toBe(1);
    const site = { id: sid, ...(await getDoc(siteDoc(cid, sid))).data() };
    const r = sendReport(cid, site, { text: 'Roof sheets on bay 2', stage: 'Roofing', progress: 40, workersPresent: 6 }, { uid: u.uid, name: 'super person', role: 'supervisor', email: email('super') });
    await save(r.done);
    expect((await getDoc(reportRef(cid, sid, r.id))).data()).toMatchObject({ createdByRole: 'supervisor', createdByEmail: email('super') });
    const after = await until(async () => (await getDocs(reportRequestsQuery(cid, sid))).docs.map((d) => d.data())[0], (x) => x.status === 'done');
    expect(after).toMatchObject({ status: 'done', reportId: r.id });
  });

  it('a report cannot claim someone else\x27s role', async () => {
    const u = await as('super');
    const site = { id: sid, ...(await getDoc(siteDoc(cid, sid))).data() };
    const r = sendReport(cid, site, { text: 'Gutters', stage: 'Roofing', progress: 41, workersPresent: 5 }, { uid: u.uid, name: 'super person', role: 'manager', date: '2026-01-05' });
    await expect(save(r.done)).rejects.toBeTruthy();
  });

  it('the person who asked can cancel an open request', async () => {
    await as('owner');
    await requestReport({ siteId: sid, uids: [ids.super], due: todayKey(), whatsapp: false, email: false });
    const open = (await getDocs(reportRequestsQuery(cid, sid))).docs.find((d) => d.data().status === 'open');
    expect(await cancelReportRequest({ siteId: sid, id: open.id })).toEqual({ cancelled: true });
    expect((await getDoc(open.ref)).data().status).toBe('cancelled');
  });
});
