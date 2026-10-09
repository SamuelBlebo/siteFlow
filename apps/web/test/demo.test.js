// Sample projects (Explore with sample data) against the emulators
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { SAMPLE_PREFIX } from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import { createSite, financeDoc, notificationsQuery, siteDoc, sitesCol, sub } from '../src/lib/db';
import { changePassword, loadDemo, removeDemo, team } from '../src/lib/account';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-s`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
const as = async (who) => { await signOut(auth); return (await signInWithEmailAndPassword(auth, email(who), pw[who])).user; };
const code = (p) => p.then(() => 'ok', (e) => e.code);
let cid, real;

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Boateng Builders', name: 'Ama Boateng' });
  cid = user.uid;
  const r = createSite(cid, { name: 'Real job, Tema', location: 'Tema', stage: 'Foundation', budget: 300000 }); await r.done; real = r.id;
  const admin = await team.invite({ name: 'Kojo Admin', email: email('admin'), role: 'admin' });
  pw.admin = admin.tempPassword;
  await as('admin'); await changePassword(pw.admin, 'admin-own-pass'); pw.admin = 'admin-own-pass';
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('sample projects', () => {
  it('only the owner adds them', async () => {
    await as('admin');
    expect(await code(loadDemo())).toBe('functions/permission-denied');
  });

  it('the owner adds three sample projects with history, totals and photos', async () => {
    await as('owner');
    expect(await loadDemo()).toMatchObject({ loaded: true });
    const sites = (await getDocs(sitesCol(cid))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const samples = sites.filter((s) => s.sample);
    expect(samples.map((s) => s.id).sort()).toEqual(['adenta', 'legon', 'road'].map((k) => `${SAMPLE_PREFIX}${k}`));
    const legon = `${SAMPLE_PREFIX}legon`;
    const f = (await getDoc(financeDoc(cid, legon))).data();
    expect(f.spent).toBeGreaterThan(0);
    expect(f.expenseCount).toBe((await getDocs(sub(cid, legon, 'expenses'))).size);
    const reports = (await getDocs(sub(cid, legon, 'reports'))).docs.map((d) => d.data());
    expect(reports.length).toBeGreaterThan(15);
    expect(reports.some((r) => r.photos.length)).toBe(true);
    // A second click doesn't add them twice
    expect(await loadDemo()).toMatchObject({ loaded: false, reason: 'already' });
  });

  it('sample projects never send messages', async () => {
    await new Promise((r) => setTimeout(r, 4000)); // give the triggers time to run
    const sent = (await getDocs(notificationsQuery(cid, 200))).docs.map((d) => d.data());
    expect(sent.filter((n) => (n.siteId || '').startsWith(SAMPLE_PREFIX))).toEqual([]);
  });

  it('removing them deletes only the samples', async () => {
    expect(await removeDemo()).toMatchObject({ removed: 3 });
    const left = (await getDocs(sitesCol(cid))).docs.map((d) => d.id);
    expect(left).toEqual([real]);
    expect((await getDocs(sub(cid, `${SAMPLE_PREFIX}legon`, 'reports'))).size).toBe(0);
    expect((await getDoc(siteDoc(cid, real))).exists()).toBe(true);
    expect((await getDoc(financeDoc(cid, `${SAMPLE_PREFIX}legon`))).exists()).toBe(false);
  });
});
