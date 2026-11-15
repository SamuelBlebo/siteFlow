import { describe, expect, it } from 'vitest';
import { activityTabs, navItems, projectMenu, projectTabs, resolveProjectAddress, settingsTabs, type NavContext, type Role } from '../src';

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

describe('projectTabs', () => {
  const shape = (c: NavContext) => projectTabs(c).map((t) => [t.key, t.sections.map((s) => s.key)]);
  it('owner with every module on', () => {
    expect(shape(ctx('owner'))).toEqual([
      ['today', []], ['reports', ['reports', 'photos']], ['progress', ['programme', 'issues']],
      ['resources', ['materials', 'labour', 'drawings']], ['money', []],
    ]);
  });
  it('modules off hide their sections; drawings always show; no Money', () => {
    expect(shape(ctx('owner', ALL_OFF))).toEqual([
      ['today', []], ['reports', ['reports', 'photos']], ['progress', ['programme', 'issues']], ['resources', ['drawings']],
    ]);
  });
  it('site staff never get Money', () => {
    for (const r of ['supervisor', 'viewer', null] as const) expect(projectTabs(ctx(r)).map((t) => t.key)).not.toContain('money');
  });
  it('finance gets Money', () => {
    expect(projectTabs(ctx('finance')).map((t) => t.key)).toContain('money');
  });
});

describe('projectMenu', () => {
  it('per role', () => {
    expect(projectMenu(ctx('owner'))).toEqual(['team', 'settings']);
    expect(projectMenu(ctx('manager'))).toEqual(['team', 'settings']);
    for (const r of ['finance', 'supervisor', 'viewer', null] as const) expect(projectMenu(ctx(r))).toEqual([]);
  });
});

describe('resolveProjectAddress', () => {
  const go = (tab: string | null, view: string | null = null, c = ctx('owner')) => resolveProjectAddress(c, tab, view);
  it('opens on Today', () => {
    expect(go(null)).toEqual({ tab: 'today', view: null });
    expect(go('today')).toEqual({ tab: 'today', view: null });
  });
  it.each([
    ['overview', 'today', null], ['drawing', 'resources', 'drawings'],
    ['reports', 'reports', 'reports'], ['report', 'reports', 'reports'], ['history', 'reports', 'reports'],
    ['photos', 'reports', 'photos'], ['progress', 'progress', 'programme'], ['issues', 'progress', 'issues'],
    ['materials', 'resources', 'materials'], ['labour', 'resources', 'labour'], ['workers', 'resources', 'labour'],
    ['budget', 'money', null], ['team', 'team', null], ['settings', 'settings', null],
  ])('old ?tab=%s goes to %s / %s', (old, tab, view) => {
    expect(go(old)).toEqual({ tab, view });
  });
  it('new addresses keep their view', () => {
    expect(go('progress', 'issues')).toEqual({ tab: 'progress', view: 'issues' });
    expect(go('resources', 'labour')).toEqual({ tab: 'resources', view: 'labour' });
  });
  it('garbage falls back, never errors', () => {
    expect(go('xyz')).toEqual({ tab: 'today', view: null });
    expect(go('reports', 'xyz')).toEqual({ tab: 'reports', view: 'reports' });
    expect(go('money', 'photos')).toEqual({ tab: 'money', view: null });
  });
  it('switched-off modules and missing permissions fall back to Today', () => {
    expect(go('labour', null, ctx('owner', ALL_OFF))).toEqual({ tab: 'resources', view: 'drawings' });
    expect(go('budget', null, ctx('supervisor'))).toEqual({ tab: 'today', view: null });
    expect(go('money', null, ctx('owner', null))).toEqual({ tab: 'today', view: null });
    expect(go('settings', null, ctx('supervisor'))).toEqual({ tab: 'today', view: null });
    expect(go('team', null, ctx(null))).toEqual({ tab: 'today', view: null });
  });
});
