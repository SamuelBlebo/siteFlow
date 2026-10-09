// Daily reports end to end against the emulators: sending, duplicates, history and the company-wide page
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { filterReports, reportId, siteInput, validate } from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import {
  companyReportsQuery, createSite, myReportId, reportExists, reportRef, sendReport, siteDoc, siteReportsQuery, uploadPhotos,
} from '../src/lib/db';
import { team } from '../src/lib/account';
import { save, SaveError } from '../src/lib/save';
import { join } from './join';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-r`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
const ids = {};
let cid, a, b;
const as = async (who) => { await signOut(auth); return (await signInWithEmailAndPassword(auth, email(who), pw[who])).user; };
const code = (p) => p.then(() => 'ok', (e) => e.code);
const siteOf = async (sid) => ({ id: sid, ...(await getDoc(siteDoc(cid, sid))).data() });
const input = (extra = {}) => ({ text: 'Blockwork to lintel level', notes: '', issues: '', weather: 'Sunny', stage: 'Blockwork', progress: 25, workersPresent: 8, ...extra });
const names = { super: 'Kofi Mensah', super2: 'Esi Ofori' };

async function send(who, sid, extra = {}, opts = {}) {
  const u = auth.currentUser;
  const { done } = sendReport(cid, await siteOf(sid), input(extra), { uid: u.uid, name: names[who], ...opts });
  return save(done);
}

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Ofori Works', name: 'Kwesi Ofori' });
  cid = user.uid;
  const mk = async (name) => { const v = validate(siteInput, { name, location: 'Accra', stage: 'Foundation', budget: 100000 }); const r = createSite(cid, v.data); await r.done; return r.id; };
  a = await mk('Adenta house');
  b = await mk('Tema warehouse');
  for (const [who, sites] of [['super', [a]], ['super2', [a, b]]]) {
    const r = await team.invite({ name: names[who], email: email(who), role: 'supervisor', siteIds: sites });
    ids[who] = r.uid;
    pw[who] = await join(r, `${who}-own-pass`);
  }
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('sending', () => {
  it('a supervisor sends a full report with photos, weather, notes and materials', async () => {
    const u = await as('super');
    const rid = myReportId(u.uid);
    const { photos } = await uploadPhotos(cid, a, rid, [new File([new Uint8Array([0xff, 0xd8, 0xff])], 'p.jpg', { type: 'image/jpeg' })]);
    await send('super', a, { notes: 'Consultant visited', issues: 'Water tanker late' }, {
      photos, materials: [{ materialId: 'm1', name: 'Cement', unit: 'bags', qty: 12 }],
    });
    const r = (await getDoc(reportRef(cid, a, rid))).data();
    expect(r).toMatchObject({
      companyId: cid, siteId: a, siteName: 'Adenta house', weather: 'Sunny', workersPresent: 8, notes: 'Consultant visited',
      issues: 'Water tanker late', photoCount: 1, source: 'web', createdByName: 'Kofi Mensah',
      materialsUsed: [{ materialId: 'm1', name: 'Cement', unit: 'bags', qty: 12 }],
    });
    expect((await siteOf(a))).toMatchObject({ stage: 'Blockwork', progress: 25 });
  });

  it('sending twice the same day is refused instead of creating a duplicate', async () => {
    await as('super');
    const err = await send('super', a, { text: 'Second attempt' }).catch((e) => e);
    expect(err).toBeInstanceOf(SaveError);
    expect((await getDocs(siteReportsQuery(cid, a))).docs.filter((d) => d.data().createdBy === ids.super)).toHaveLength(1);
  });

  it('another supervisor on the same site sends their own report', async () => {
    const u = await as('super2');
    await send('super2', a, { progress: 30 });
    await send('super2', b, { text: 'Clearing done', stage: 'Site clearing', progress: 5 });
    expect(await reportExists(cid, a, reportId(new Date().toISOString().slice(0, 10), u.uid))).toBeDefined();
    expect((await getDocs(siteReportsQuery(cid, a))).size).toBe(2);
  });

  it('an older report does not move the site backwards', async () => {
    await as('super');
    await send('super', a, { progress: 5, stage: 'Foundation' }, { date: '2026-01-05', time: '16:00' });
    expect((await siteOf(a))).toMatchObject({ progress: 30 });
  });

  it('cannot send to a site you are not on', async () => {
    await as('super');
    expect(await code(getDoc(siteDoc(cid, b)))).toBe('permission-denied');
  });
});

describe('history and company-wide reports', () => {
  it('a site history lists newest first and can start from a date', async () => {
    await as('super2');
    const all = (await getDocs(siteReportsQuery(cid, a))).docs.map((d) => d.data().date);
    expect(all).toEqual([...all].sort().reverse());
    expect((await getDocs(siteReportsQuery(cid, a, 30, '2026-06-01'))).docs.every((d) => d.data().date >= '2026-06-01')).toBe(true);
  });

  it('the owner sees every report across sites, with site and date filters', async () => {
    await as('owner');
    const all = (await getDocs(companyReportsQuery(cid))).docs.map((d) => d.data());
    expect(all).toHaveLength(4);
    expect(new Set(all.map((r) => r.siteName))).toEqual(new Set(['Adenta house', 'Tema warehouse']));
    expect((await getDocs(companyReportsQuery(cid, { siteId: b }))).size).toBe(1);
    expect((await getDocs(companyReportsQuery(cid, { from: '2026-02-01' }))).size).toBe(3);
    expect((await getDocs(companyReportsQuery(cid, { to: '2026-02-01' }))).size).toBe(1);
    expect(filterReports(all, { q: 'tanker' })).toHaveLength(1);
    expect(filterReports(all, { withPhotos: true })).toHaveLength(1);
  });

  it('supervisors cannot use the company-wide query', async () => {
    await as('super2');
    expect(await code(getDocs(companyReportsQuery(cid)))).toBe('permission-denied');
  });
});
