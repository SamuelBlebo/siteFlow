import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, assignableRoles, can, canAccessSite, canChangeMember, isRole, isSiteScoped, type Permission } from '../src';

describe('permissions', () => {
  it('owner can do everything', () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) expect(can('owner', p)).toBe(true);
  });

  it('site roles never see money', () => {
    for (const r of ['supervisor', 'viewer'] as const) {
      expect(can(r, 'finance.view')).toBe(false);
      expect(can(r, 'finance.edit')).toBe(false);
      expect(can(r, 'sites.manage')).toBe(false);
      expect(can(r, 'team.manage')).toBe(false);
    }
  });

  it('viewer is read-only', () => {
    expect(can('viewer', 'site.work')).toBe(false);
    expect(can('supervisor', 'site.work')).toBe(true);
  });

  it('finance sees money on all sites but does not do site work', () => {
    expect(can('finance', 'finance.edit')).toBe(true);
    expect(can('finance', 'sites.all')).toBe(true);
    expect(can('finance', 'site.work')).toBe(false);
  });

  it('only the owner changes company settings', () => {
    expect(ROLES.filter((r) => can(r, 'company.settings'))).toEqual(['owner']);
  });

  it('handles missing and legacy roles', () => {
    expect(can(null, 'site.work')).toBe(false);
    expect(can(undefined, 'finance.view')).toBe(false);
    expect(isRole('site')).toBe(false);
    expect(isRole('manager')).toBe(true);
  });

  it('site-scoped roles', () => {
    expect(ROLES.filter(isSiteScoped)).toEqual(['supervisor', 'viewer']);
  });

  it('nobody can create an owner; only the owner can create admins', () => {
    for (const r of ROLES) expect(assignableRoles(r)).not.toContain('owner');
    expect(assignableRoles('owner')).toContain('admin');
    expect(assignableRoles('admin')).not.toContain('admin');
    for (const r of ['manager', 'finance', 'supervisor', 'viewer'] as const) expect(assignableRoles(r)).toEqual([]);
  });

  it('admins cannot change other admins', () => {
    expect(canChangeMember('admin', 'admin', 'viewer')).toBe(false);
    expect(canChangeMember('admin', 'supervisor', 'manager')).toBe(true);
    expect(canChangeMember('owner', 'admin', 'viewer')).toBe(true);
    expect(canChangeMember('owner', 'owner', 'admin')).toBe(false);
  });

  it('site access', () => {
    expect(canAccessSite({ role: 'manager' }, 's1')).toBe(true);
    expect(canAccessSite({ role: 'supervisor', siteIds: ['s1'] }, 's1')).toBe(true);
    expect(canAccessSite({ role: 'supervisor', siteIds: ['s1'] }, 's2')).toBe(false);
    expect(canAccessSite(null, 's1')).toBe(false);
  });
});
