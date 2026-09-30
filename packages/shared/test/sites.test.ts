import { describe, expect, it } from 'vitest';
import { isSiteOpen, siteDetailsInput, siteFields, siteFormValues, siteInput, siteStatusInput, siteTeam, validate } from '../src';

const base = { name: 'Adenta house', location: 'Adenta, Accra', stage: 'Foundation' };

describe('site forms', () => {
  it('details: only name, location and stage are required', () => {
    expect(validate(siteDetailsInput, base)).toMatchObject({ ok: true, data: { planStart: '', clientEmail: '' } });
  });
  it('planned finish must come after the start', () => {
    expect(validate(siteDetailsInput, { ...base, planStart: '2026-06-01', planEnd: '2026-05-01' }))
      .toEqual({ ok: false, error: 'The planned finish must be after the start.' });
    expect(validate(siteDetailsInput, { ...base, planStart: '2026-06-01', planEnd: '2026-12-01' }).ok).toBe(true);
  });
  it('checks emails and phones', () => {
    expect(validate(siteDetailsInput, { ...base, foremanEmail: 'nope' }).ok).toBe(false);
    expect(validate(siteDetailsInput, { ...base, clientPhone: '123' }).ok).toBe(false);
    expect(validate(siteDetailsInput, { ...base, clientEmail: 'Client@Example.com' })).toMatchObject({ ok: true, data: { clientEmail: 'client@example.com' } });
  });
  it('a new site needs a budget', () => {
    expect(validate(siteInput, base).ok).toBe(false);
    expect(validate(siteInput, { ...base, budget: '250000' })).toMatchObject({ ok: true, data: { budget: 250000 } });
  });
  it('status values', () => {
    expect(validate(siteStatusInput, 'on_hold').ok).toBe(true);
    expect(validate(siteStatusInput, 'deleted').ok).toBe(false);
  });
});

describe('site storage shape', () => {
  it('empty optional fields become null and client details are grouped', () => {
    const v = validate(siteDetailsInput, { ...base, clientName: 'Mr Mensah', clientPhone: '0241234567' });
    if (!v.ok) throw new Error(v.error);
    expect(siteFields(v.data)).toEqual({
      ...base, foremanName: '', foremanPhone: '', foremanEmail: '', planStart: null, planEnd: null,
      client: { name: 'Mr Mensah', phone: '0241234567', email: '' },
    });
    expect(siteFields({ ...base }).client).toBeNull();
  });
  it('round-trips through the edit form', () => {
    const stored = siteFields({ ...base, planStart: '2026-01-05', clientName: 'Ama', clientEmail: 'a@b.com' });
    expect(siteFields(siteFormValues(stored))).toEqual(stored);
  });
});

describe('site team', () => {
  const members = [
    { id: 'o', role: 'owner' as const, siteIds: [] },
    { id: 'm', role: 'manager' as const, siteIds: [] },
    { id: 's1', role: 'supervisor' as const, siteIds: ['a'] },
    { id: 's2', role: 'supervisor' as const, siteIds: ['b'] },
    { id: 'v', role: 'viewer' as const, siteIds: ['a', 'b'] },
    { id: 'off', role: 'supervisor' as const, siteIds: ['a'], active: false },
  ];
  it('splits people who see all sites, people assigned here, and people who could be', () => {
    const t = siteTeam(members, 'a');
    expect(t.allSites.map((m) => m.id)).toEqual(['o', 'm']);
    expect(t.assigned.map((m) => m.id)).toEqual(['s1', 'v']);
    expect(t.available.map((m) => m.id)).toEqual(['s2']);
  });
  it('open sites', () => {
    expect(isSiteOpen({ status: 'active' })).toBe(true);
    expect(isSiteOpen({ status: 'on_hold' })).toBe(true);
    expect(isSiteOpen({ status: 'closed' })).toBe(false);
    expect(isSiteOpen(null)).toBe(false);
  });
});
