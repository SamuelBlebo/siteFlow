// View as: while previewing, writes to company data are refused; the person's own settings still save
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../src/firebase';
import { createSite, setClientReports, setSiteStatus, siteDoc, togglePin, updateSiteDetails, uploadPhotos, userDoc } from '../src/lib/db';
import { inviteInfo, team } from '../src/lib/account';
import { previewing, setPreview } from '../src/lib/preview';
import { save, SaveError } from '../src/lib/save';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-va`;
let cid, uid, sid;

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, `owner-${run}@example.com`, 'owner-pass-1');
  await httpsCallable(functions, 'createCompany')({ acceptTerms: true, companyName: 'Preview Builders', name: 'Ama Boateng' });
  cid = user.uid; uid = user.uid;
  const r = createSite(cid, { name: 'Airport villa', location: 'Airport, Accra', stage: 'Foundation', budget: 500000 });
  await r.done;
  sid = r.id;
});
afterEach(() => setPreview(null));
afterAll(async () => { await signOut(auth); await terminate(db); });

const refused = (p) => p.then(() => 'saved', (e) => (e.code === 'preview' || e instanceof SaveError ? e.message : `other: ${e.code}`));

describe('writes while previewing', () => {
  it('company writes are refused with the message, and nothing changes', async () => {
    setPreview('Site supervisor');
    expect(previewing()).toBe('Site supervisor');
    const msg = "You're viewing as Site supervisor. Go back to your view to make changes.";
    expect(await refused(setSiteStatus(cid, sid, 'paused'))).toBe(msg);
    expect(await refused(save(updateSiteDetails(cid, sid, { name: 'Renamed' }), 'Project'))).toBe(msg);
    expect(await refused(createSite(cid, { name: 'Another', location: 'Tema', stage: 'Foundation', budget: 1 }).done)).toBe(msg);
    expect(await refused(uploadPhotos(cid, sid, 'r1', []))).toBe(msg);
    expect(await refused(team.invite({ name: 'Kofi Mensah', email: `kofi-${run}@example.com`, role: 'supervisor', siteIds: [] }))).toBe(msg);
    const site = (await getDoc(siteDoc(cid, sid))).data();
    expect(site.status).toBe('active');
    expect(site.name).toBe('Airport villa');
  });

  it("the person's own settings still save, and reading callables still work", async () => {
    setPreview('Kofi Mensah (Site supervisor)');
    await togglePin(uid, [], `site:${sid}`, true);
    expect((await getDoc(userDoc(uid))).data().pinned).toContain(`site:${sid}`);
    // A reading callable is sent to the server (it answers about the made-up link, not the preview)
    expect(await inviteInfo({ token: 'not-a-real-token' }).then(() => 'ok', (e) => (e.code === 'preview' ? 'preview' : 'server'))).toBe('server');
  });

  it('back to my view: writes go through again', async () => {
    setPreview('Viewer');
    setPreview(null);
    await setClientReports(cid, sid, true);
    expect((await getDoc(siteDoc(cid, sid))).data().clientReports).toBe(true);
  });
});
