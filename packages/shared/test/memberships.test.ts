import { describe, expect, it } from 'vitest';
import { membershipSummary, type Site } from '../src';

const site = (id: string, status: Site['status'] = 'active') => ({ id, name: `Site ${id}`, status });

describe('membershipSummary', () => {
  it('an all-projects role counts every project', () => {
    expect(membershipSummary({ role: 'owner' }, [site('a'), site('b'), site('c')], {}))
      .toEqual({ roleLabel: 'Owner', state: 'ok', projects: 'All projects (3)' });
  });

  it('a site role lists its projects, open first, at most 5', () => {
    const sites = [site('1', 'closed'), site('2'), site('3'), site('4'), site('5'), site('6'), site('7')];
    const s = membershipSummary({ role: 'supervisor', siteIds: sites.map((x) => x.id) }, sites, null);
    expect(s.roleLabel).toBe('Site supervisor');
    expect(s.projects).toBe('Site 2, Site 3, Site 4, Site 5, Site 6 and 2 more');
  });

  it('a site role with no projects says so', () => {
    expect(membershipSummary({ role: 'supervisor', siteIds: [] }, [], null).projects).toBe('No projects yet');
  });

  it('a switched-off membership is off, a paused company is paused', () => {
    expect(membershipSummary({ role: 'manager', active: false }, [], {}).state).toBe('off');
    expect(membershipSummary({ role: 'manager' }, [], { suspended: { at: 1 } }).state).toBe('paused');
  });
});
