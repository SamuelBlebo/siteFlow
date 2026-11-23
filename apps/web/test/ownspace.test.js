// Every account has its own space: accepting an invitation gives the person a company they own,
// alongside the one that invited them. Runs against the emulators (npm run test:web).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, terminate } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { TERMS_VERSION } from '@siteflow/shared';
import { auth, db, functions } from '../src/firebase';
import { companyDoc, memberDoc, switchCompany, userDoc } from '../src/lib/db';
import { acceptInvite } from '../src/lib/account';
import { tokenOf } from './join';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = Date.now();
const email = (who) => `${who}-own-${run}@example.com`;
const call = (name, data) => httpsCallable(functions, name)(data).then((r) => r.data);
const as = async (who, pw) => { await signOut(auth); return (await signInWithEmailAndPassword(auth, email(who), pw)).user; };
let cid;

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), 'password123');
  await call('createCompany', { acceptTerms: true, companyName: 'Darko Builders', name: 'Efua Darko' });
  cid = user.uid;
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('own space', () => {
  it('refuses an invitation accepted without agreeing to the Terms', async () => {
    await as('owner', 'password123');
    const res = await call('inviteMember', { name: 'Kofi Mensah', email: email('kofi'), role: 'supervisor', siteIds: [] });
    await expect(acceptInvite({ token: tokenOf(res), password: 'kofi-pass-1' })).rejects.toThrow(/Terms/);
    // The link still works once they agree
    await acceptInvite({ token: tokenOf(res), password: 'kofi-pass-1', acceptTerms: true });
  });

  it('accepting creates the invitee\'s own company once and keeps them in the inviting one', async () => {
    const kofi = await as('kofi', 'kofi-pass-1');
    expect((await getDoc(companyDoc(kofi.uid))).data()).toMatchObject({
      name: "Kofi's projects", ownerId: kofi.uid, country: 'GH', terms: { version: TERMS_VERSION, acceptedBy: kofi.uid },
    });
    expect((await getDoc(memberDoc(kofi.uid, kofi.uid))).data()).toMatchObject({ role: 'owner', active: true });
    const account = (await getDoc(userDoc(kofi.uid))).data();
    expect(account.companyId).toBe(cid);
    expect([...account.companyIds].sort()).toEqual([cid, kofi.uid].sort());
  });

  it('a password-reset link needs no Terms and creates no other company', async () => {
    const kofi = await as('kofi', 'kofi-pass-1');
    await as('owner', 'password123');
    const reset = await call('resetMemberPassword', { uid: kofi.uid });
    await acceptInvite({ token: tokenOf(reset), password: 'kofi-pass-2' });
    await as('kofi', 'kofi-pass-2');
    expect([...(await getDoc(userDoc(kofi.uid))).data().companyIds].sort()).toEqual([cid, kofi.uid].sort());
  });

  it('someone who already owns a company keeps it unchanged when they accept', async () => {
    const { user } = await createUserWithEmailAndPassword(auth, email('ama'), 'ama-pass-1');
    await call('createCompany', { acceptTerms: true, companyName: 'Ama Works', name: 'Ama Boakye' });
    await as('owner', 'password123');
    await call('inviteMember', { name: 'Ama Boakye', email: email('ama'), role: 'viewer', siteIds: [] }); // added straight away
    await as('ama', 'ama-pass-1');
    expect((await getDoc(companyDoc(user.uid))).data().name).toBe('Ama Works');
  });

  it('a manager can still send a password link to someone whose own space is empty', async () => {
    await as('owner', 'password123');
    const kofi = (await call('inviteMember', { name: 'Yaw Kofi', email: email('yaw'), role: 'supervisor', siteIds: [] }));
    await acceptInvite({ token: tokenOf(kofi), password: 'yaw-pass-1', acceptTerms: true });
    await as('owner', 'password123');
    await expect(call('resetMemberPassword', { uid: kofi.uid })).resolves.toMatchObject({ link: expect.any(String) });
  });
  it("a manager can't send a password link once the person's own space has a team", async () => {
    const kofi = await as('kofi', 'kofi-pass-2');
    await switchCompany(kofi.uid, kofi.uid);
    await call('inviteMember', { name: 'Akos Kofi', email: email('akos'), role: 'viewer', siteIds: [] }); // no projects yet, but a team
    await switchCompany(kofi.uid, cid);
    await as('owner', 'password123');
    await expect(call('resetMemberPassword', { uid: kofi.uid })).rejects.toThrow(/another company/);
  });

  it('switched off, then removed: the login opens again for their own space', async () => {
    await as('owner', 'password123');
    const r = await call('inviteMember', { name: 'Esi Mensah', email: email('esi'), role: 'viewer', siteIds: [] });
    await acceptInvite({ token: tokenOf(r), password: 'esi-pass-1', acceptTerms: true });
    await as('owner', 'password123');
    await call('setMemberActive', { uid: r.uid, active: false }); // own space is empty, so the login is locked
    await call('removeMember', { uid: r.uid });
    const esi = await as('esi', 'esi-pass-1');
    expect((await getDoc(userDoc(esi.uid))).data()).toMatchObject({ companyIds: [esi.uid], companyId: esi.uid });
  });
});
