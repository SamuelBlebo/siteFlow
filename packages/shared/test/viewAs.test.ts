import { describe, expect, it } from 'vitest';
import { applyViewAs, canViewAs, isNarrower, shapedRole, viewAsPeople, viewAsRoles } from '../src';

describe('who can view as', () => {
  it('owners and admins only', () => {
    expect(canViewAs('owner')).toBe(true);
    expect(canViewAs('admin')).toBe(true);
    for (const r of ['manager', 'finance', 'supervisor', 'viewer', null, undefined] as const) expect(canViewAs(r)).toBe(false);
  });
  it('the roles follow the role-giving rule: never the owner, admins only for the owner', () => {
    expect(viewAsRoles('owner')).toEqual(['admin', 'manager', 'finance', 'supervisor', 'viewer']);
    expect(viewAsRoles('admin')).toEqual(['manager', 'finance', 'supervisor', 'viewer']);
    expect(viewAsRoles('manager')).toEqual([]);
  });
});

describe('who can be picked', () => {
  const members = [
    { id: 'me', name: 'Owner', role: 'owner' },
    { id: 'a', name: 'Zed Admin', role: 'admin' },
    { id: 'k', name: 'Kofi Mensah', role: 'supervisor', siteIds: ['s1'] },
    { id: 'off', name: 'Off Person', role: 'viewer', active: false },
    { id: 'odd', name: 'Odd Role', role: 'boss' },
  ];
  it('switched-on members with a role the person could give, sorted, never themselves', () => {
    expect(viewAsPeople('owner', members, 'me').map((m) => m.id)).toEqual(['k', 'a']);
    expect(viewAsPeople('admin', members, 'a').map((m) => m.id)).toEqual(['k']);
    expect(viewAsPeople('supervisor', members, 'k')).toEqual([]);
  });
});

describe('the override', () => {
  const owner = { role: 'owner' as const, siteIds: [], companyId: 'c1', name: 'Ama' };
  const all = ['s1', 's2', 's3'];
  it('by role: the role, and every project for site-scoped roles', () => {
    const r = applyViewAs(owner, { kind: 'role', role: 'supervisor', cid: 'c1' }, all);
    expect(r).toEqual({ previewing: true, profile: { ...owner, role: 'supervisor', siteIds: all } });
  });
  it("by person: their role and their projects", () => {
    const r = applyViewAs(owner, { kind: 'person', uid: 'k', name: 'Kofi', role: 'supervisor', siteIds: ['s2'], cid: 'c1' }, all);
    expect(r.profile).toMatchObject({ role: 'supervisor', siteIds: ['s2'], name: 'Ama' });
  });
  it('ends on a company switch', () => {
    expect(applyViewAs({ ...owner, companyId: 'c2' }, { kind: 'role', role: 'viewer', cid: 'c1' }, all)).toEqual({ profile: { ...owner, companyId: 'c2' }, previewing: false });
  });
  it('is ignored for a role the person may not use', () => {
    const admin = { ...owner, role: 'admin' as const };
    expect(applyViewAs(admin, { kind: 'role', role: 'admin', cid: 'c1' }, all).previewing).toBe(false);
    expect(applyViewAs({ ...owner, role: 'manager' as const }, { kind: 'role', role: 'viewer', cid: 'c1' }, all).previewing).toBe(false);
  });
  it('no preview leaves the profile as it is', () => {
    expect(applyViewAs(owner, null, all)).toEqual({ profile: owner, previewing: false });
  });
});

describe('server answers', () => {
  it('only ever narrow', () => {
    expect(isNarrower('supervisor', 'owner')).toBe(true);
    expect(isNarrower('finance', 'manager')).toBe(true);
    expect(isNarrower('manager', 'finance')).toBe(false); // site setup and daily work
    expect(shapedRole('finance', 'supervisor')).toBe('finance'); // daily work is not finance's
    expect(shapedRole('owner', 'supervisor')).toBe('supervisor');
    expect(shapedRole('supervisor', 'owner')).toBe('supervisor');
    expect(shapedRole('manager', 'nonsense')).toBe('manager');
    expect(shapedRole('admin', undefined)).toBe('admin');
  });
});
