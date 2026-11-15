import { describe, expect, it } from 'vitest';
import { activityTabs, navItems, settingsTabs, type NavContext, type Role } from '../src';

const ALL_ON = { modules: { materials: true, labour: true, budget: true } };
const ALL_OFF = { modules: {} };
const ctx = (role: Role | null | undefined, company: { modules: object } | null = ALL_ON) => ({ role, company } as NavContext);

describe('navItems', () => {
  const keys = (c: NavContext) => navItems(c).map((i) => i.key);
  it('owner with every module on sees everything, in order', () => {
    expect(keys(ctx('owner'))).toEqual(['home', 'projects', 'activity', 'money', 'team']);
    expect(navItems(ctx('owner')).map((i) => i.label)).toEqual(['Home', 'Projects', 'Site activity', 'Money', 'Team']);
  });
  it('per role', () => {
    expect(keys(ctx('admin'))).toEqual(['home', 'projects', 'activity', 'money', 'team']);
    expect(keys(ctx('manager'))).toEqual(['home', 'projects', 'activity', 'money']);
    expect(keys(ctx('finance'))).toEqual(['home', 'projects', 'activity', 'money']);
    expect(keys(ctx('supervisor'))).toEqual(['projects']);
    expect(keys(ctx('viewer'))).toEqual(['projects']);
  });
  it('site staff see "My projects"', () => {
    expect(navItems(ctx('supervisor'))[0]).toEqual({ key: 'projects', to: '/sites', label: 'My projects' });
  });
  it('Money hides when Budget is off', () => {
    expect(keys(ctx('owner', ALL_OFF))).not.toContain('money');
  });
  it('missing role or company never throws and shows the least', () => {
    for (const r of [null, undefined, 'site' as Role]) expect(keys(ctx(r))).toEqual(['projects']);
    expect(keys(ctx('owner', null))).toEqual(['home', 'projects', 'activity', 'team']);
  });
});

describe('settingsTabs', () => {
  it('owner only', () => {
    expect(settingsTabs(ctx('owner')).map((t) => t.to)).toEqual(['/company', '/modules', '/reminders']);
    for (const r of ['admin', 'manager', 'finance', 'supervisor', 'viewer', null] as const) expect(settingsTabs(ctx(r))).toEqual([]);
  });
});

describe('activityTabs', () => {
  it('roles that see every project', () => {
    expect(activityTabs(ctx('finance')).map((t) => t.to)).toEqual(['/reports', '/issues']);
    expect(activityTabs(ctx('supervisor'))).toEqual([]);
  });
});
