// Accounts, company settings and team management against the emulators
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, getDocs, terminate, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../src/firebase';
import { activityQuery, companyDoc, createSite, teamQuery, updateCompany, updateMyProfile, userDoc } from '../src/lib/db';
import { acceptInvite, changePassword, inviteInfo, setModule, team } from '../src/lib/account';
import { join, tokenOf } from './join';
import { save, SaveError } from '../src/lib/save';

globalThis.navigator ??= {};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

const run = `${Date.now()}-t`;
const email = (who) => `${who}-${run}@example.com`;
const pw = { owner: 'owner-pass-1' };
const ids = {};
const inv = {};
let cid, s1, s2;
const as = async (who, password = pw[who]) => { await signOut(auth); return (await signInWithEmailAndPassword(auth, email(who), password)).user; };
const code = (p) => p.then(() => 'ok', (e) => e.code);

beforeAll(async () => {
  const { user } = await createUserWithEmailAndPassword(auth, email('owner'), pw.owner);
  await httpsCallable(functions, 'createCompany')({ companyName: 'Asante Construction', name: 'Yaa Asante' });
  cid = user.uid;
  const a = createSite(cid, { name: 'Tema warehouse', location: 'Tema', stage: 'Foundation', budget: 500000 }); await a.done; s1 = a.id;
  const b = createSite(cid, { name: 'Kumasi school', location: 'Kumasi', stage: 'Foundation', budget: 800000 }); await b.done; s2 = b.id;
});
afterAll(async () => { await signOut(auth); await terminate(db); });

describe('invites and first sign-in', () => {
  it('owner invites an admin and a supervisor; each gets a one-time link, no password is shown', async () => {
    inv.admin = await team.invite({ name: 'Kwame Admin', email: email('admin'), role: 'admin' });
    inv.super = await team.invite({ name: 'Kofi Supervisor', email: email('super'), phone: '024 123 4567', role: 'supervisor', siteIds: [s1] });
    ids.admin = inv.admin.uid; ids.super = inv.super.uid;
    expect(inv.super.link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(inv.super.tempPassword).toBeUndefined();
    expect(inv.super.email).toBe('skipped'); // the emulator never sends email
    expect((await getDoc(userDoc(inv.super.uid))).data()).toMatchObject({ role: 'supervisor', siteIds: [s1], phone: '0241234567', invitePending: true, inviteKind: 'invite' });
  });

  it('the link shows who invited them, sets their password once, and then stops working', async () => {
    await signOut(auth);
    expect(await inviteInfo({ token: tokenOf(inv.super) })).toMatchObject({ kind: 'invite', name: 'Kofi Supervisor', email: email('super'), companyName: 'Asante Construction', expired: false });
    expect(await code(acceptInvite({ token: tokenOf(inv.super), password: 'short' }))).toBe('functions/invalid-argument');
    pw.super = await join(inv.super, 'kofi-own-pass');
    const u = await as('super');
    expect((await getDoc(userDoc(u.uid))).data()).toMatchObject({ invitePending: false });
    expect((await getDoc(userDoc(u.uid))).data().joinedAt).toBeTruthy();
    expect(await code(acceptInvite({ token: tokenOf(inv.super), password: 'hijack-pass-1' }))).toBe('functions/not-found');
    expect(await code(inviteInfo({ token: 'x'.repeat(43) }))).toBe('functions/not-found');
  });

  it('a wrong current password is refused', async () => {
    await as('super');
    expect(await code(changePassword('not-it', 'another-pass'))).toMatch(/auth\/(invalid-credential|wrong-password)/);
  });

  it('people edit their own details', async () => {
    const u = await as('super');
    await save(updateMyProfile(u.uid, { name: 'Kofi Asante', phone: '0209876543' }));
    expect((await getDoc(userDoc(u.uid))).data()).toMatchObject({ name: 'Kofi Asante', phone: '0209876543' });
  });

  it('non-managers cannot use team functions', async () => {
    await as('super');
    expect(await code(team.invite({ name: 'Sneaky', email: email('sneaky'), role: 'admin' }))).toBe('functions/permission-denied');
    expect(await code(team.update({ uid: ids.super, role: 'manager' }))).toBe('functions/permission-denied');
    expect(await code(team.resetPassword({ uid: ids.admin }))).toBe('functions/permission-denied');
  });
});

describe('admin limits', () => {
  it('admin sets their password and invites staff, but not admins', async () => {
    pw.admin = await join(inv.admin, 'admin-own-pass');
    await as('admin');
    const fin = await team.invite({ name: 'Efua Finance', email: email('finance'), role: 'finance' });
    ids.finance = fin.uid;
    expect(await code(team.invite({ name: 'Another Admin', email: email('admin2'), role: 'admin' }))).toBe('functions/permission-denied');
    expect(await code(team.invite({ name: 'Owner Two', email: email('owner2'), role: 'owner' }))).toBe('functions/invalid-argument');
  });

  it('admin changes staff but not themselves, the owner or other admins', async () => {
    await as('admin');
    await expect(team.update({ uid: ids.super, role: 'supervisor', siteIds: [s1, s2, 'made-up'] })).resolves.toEqual({ role: 'supervisor', siteIds: [s1, s2] });
    expect(await code(team.update({ uid: ids.super, role: 'admin' }))).toBe('functions/permission-denied');
    expect(await code(team.update({ uid: ids.admin, role: 'manager' }))).toBe('functions/failed-precondition');
    expect(await code(team.update({ uid: cid, role: 'manager' }))).toBe('functions/permission-denied');
  });

  it('only the owner changes company details', async () => {
    await as('admin');
    await expect(save(updateCompany(cid, { name: 'Hijacked Ltd', phone: '', location: '' }))).rejects.toBeInstanceOf(SaveError);
    await as('owner');
    await save(updateCompany(cid, { name: 'Asante Construction Ltd', phone: '0302123456', location: 'Accra' }));
    expect((await getDoc(companyDoc(cid))).data()).toMatchObject({ name: 'Asante Construction Ltd', location: 'Accra' });
  });

  it('only the owner switches modules, only built ones, and the plan follows', async () => {
    await as('admin');
    expect(await code(setModule({ key: 'labour', on: false }))).toBe('functions/permission-denied');
    await as('owner');
    expect(await code(setModule({ key: 'rfis', on: true }))).toBe('functions/failed-precondition'); // not built yet
    expect(await code(setModule({ key: 'reports', on: false }))).toBe('functions/failed-precondition'); // core
    await setModule({ key: 'labour', on: false });
    let c = (await getDoc(companyDoc(cid))).data();
    expect(c.modules.labour).toBe(false);
    expect(c.modules.materials).toBe(true); // others untouched
    await setModule({ key: 'labour', on: true });
    await setModule({ key: 'budget', on: true });
    c = (await getDoc(companyDoc(cid))).data();
    expect(c).toMatchObject({ plan: 'professional', modules: { labour: true, budget: true } });
    // Apps still cannot write modules or plan directly
    expect(await code(updateDoc(companyDoc(cid), { modules: { ...c.modules, rfis: true } }))).toBe('permission-denied');
  });
});

describe('switch off, reset, remove', () => {
  it('a switched-off member cannot sign in until switched back on', async () => {
    await as('owner');
    await team.setActive({ uid: ids.super, active: false });
    await signOut(auth);
    expect(await code(signInWithEmailAndPassword(auth, email('super'), pw.super))).toBe('auth/user-disabled');
    await as('owner');
    await team.setActive({ uid: ids.super, active: true });
    await expect(as('super')).resolves.toBeTruthy();
  });

  it('a password link: the old password works until it is used, and only the newest link works', async () => {
    await as('owner');
    const first = await team.resetPassword({ uid: ids.super });
    const second = await team.resetPassword({ uid: ids.super });
    expect((await getDoc(userDoc(ids.super))).data()).toMatchObject({ invitePending: true, inviteKind: 'reset' });
    await expect(as('super')).resolves.toBeTruthy(); // not locked out while the link is waiting
    expect(await code(acceptInvite({ token: tokenOf(first), password: 'older-link-pass' }))).toBe('functions/not-found');
    await signOut(auth);
    const old = pw.super;
    pw.super = await join(second, 'kofi-new-pass');
    expect(await code(signInWithEmailAndPassword(auth, email('super'), old))).toMatch(/auth\/(invalid-credential|wrong-password)/);
    await expect(as('super')).resolves.toBeTruthy();
  });

  it('removing someone who has not joined yet also cancels their invitation link', async () => {
    await as('owner');
    const r = await team.invite({ name: 'Ama Late', email: email('late'), role: 'viewer', siteIds: [s1] });
    await team.remove({ uid: r.uid });
    expect(await code(acceptInvite({ token: tokenOf(r), password: 'too-late-pass' }))).toBe('functions/not-found');
  });

  it('removing a member deletes their login and profile', async () => {
    await as('owner');
    await team.remove({ uid: ids.finance });
    const members = (await getDocs(teamQuery(cid))).docs.map((d) => d.id);
    expect(members).not.toContain(ids.finance);
    expect(members).toContain(ids.super);
    await signOut(auth);
    expect(await code(signInWithEmailAndPassword(auth, email('finance'), 'anything1'))).toMatch(/auth\/(user-not-found|invalid-credential)/);
  });

  it('another company cannot touch our members', async () => {
    await signOut(auth);
    await createUserWithEmailAndPassword(auth, email('rival'), 'rival-pass-1');
    await httpsCallable(functions, 'createCompany')({ companyName: 'Rival Co', name: 'Rival Owner' });
    expect(await code(team.update({ uid: ids.super, role: 'viewer' }))).toBe('functions/not-found');
    expect(await code(team.setActive({ uid: ids.super, active: false }))).toBe('functions/not-found');
    expect(await code(team.remove({ uid: ids.admin }))).toBe('functions/not-found');
  });
});

describe('activity log', () => {
  it('records every team change for owners and admins only', async () => {
    await as('owner');
    const log = (await getDocs(activityQuery(cid, 50))).docs.map((d) => d.data().what).join('\n');
    for (const what of ['invited Kofi Supervisor as site supervisor', 'accepted their invitation', 'switched off Kofi', 'switched on Kofi', 'a link to set a new password', 'set a new password from a link', 'removed Efua Finance']) {
      expect(log).toContain(what);
    }
    await as('super');
    await expect(getDocs(activityQuery(cid))).rejects.toThrow();
  });
});
