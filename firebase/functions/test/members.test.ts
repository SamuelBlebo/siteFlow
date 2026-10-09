// Moving accounts from the old layout (role on users/{uid}) to company memberships
import { describe, expect, it } from 'vitest';
import '../src/setup';
import { getFirestore } from 'firebase-admin/firestore';
import { paths } from '@siteflow/shared';
import { joinCompany, leaveCompany, membershipOf, migrateCompany } from '../src/members';
import { companyMembers } from '../src/deliver';

const db = () => getFirestore();

describe('moving older accounts to memberships', () => {
  it('moves everyone in the company, keeps their role, sites and invitation, and is safe to repeat', async () => {
    const cid = 'mig-c1';
    await db().doc(paths.user('mig-owner')).set({ companyId: cid, role: 'owner', name: 'Ama Owner', email: 'a@x.com', siteIds: [], active: true });
    await db().doc(paths.user('mig-super')).set({
      companyId: cid, role: 'supervisor', name: 'Kofi Site', email: 'k@x.com', phone: '0241234567', siteIds: ['s1'],
      invitePending: true, inviteKind: 'invite', inviteHash: 'h1', mustChangePassword: false,
    });
    expect(await migrateCompany(db(), cid)).toBe(2);
    expect(await migrateCompany(db(), cid)).toBe(0);

    const m = (await db().doc(paths.member(cid, 'mig-super')).get()).data();
    expect(m).toMatchObject({ role: 'supervisor', siteIds: ['s1'], name: 'Kofi Site', phone: '0241234567', invitePending: true, inviteHash: 'h1' });
    const u = (await db().doc(paths.user('mig-super')).get()).data()!;
    expect(u).toMatchObject({ companyId: cid, companyIds: [cid], name: 'Kofi Site', mustChangePassword: false });
    expect(u.role).toBeUndefined();
    expect(u.siteIds).toBeUndefined();
    expect(u.inviteHash).toBeUndefined();
    expect(await membershipOf(db(), 'mig-owner')).toMatchObject({ role: 'owner', companyId: cid, id: 'mig-owner' });
  });

  it('scheduled jobs move a company nobody has signed in to yet', async () => {
    await db().doc(paths.user('mig-late')).set({ companyId: 'mig-c2', role: 'manager', name: 'Late Manager', email: 'l@x.com', siteIds: [] });
    expect((await companyMembers('mig-c2')).map((m) => m.id)).toEqual(['mig-late']);
  });
});

describe('joining and leaving companies', () => {
  it('a second company is added without changing the one they look at; leaving one keeps the other', async () => {
    const uid = 'jl-1';
    await joinCompany(db(), uid, 'jl-a', { name: 'Ebo Mensah', email: 'e@x.com' });
    await joinCompany(db(), uid, 'jl-b', { name: 'Ignored', email: 'e@x.com' });
    let u = (await db().doc(paths.user(uid)).get()).data()!;
    expect(u).toMatchObject({ name: 'Ebo Mensah', companyId: 'jl-a', companyIds: ['jl-a', 'jl-b'] });
    expect(await leaveCompany(db(), uid, 'jl-a')).toEqual(['jl-b']);
    u = (await db().doc(paths.user(uid)).get()).data()!;
    expect(u).toMatchObject({ companyId: 'jl-b', companyIds: ['jl-b'] });
    expect(await leaveCompany(db(), uid, 'jl-b')).toEqual([]);
    expect((await db().doc(paths.user(uid)).get()).data()?.companyId).toBeUndefined();
  });
});
