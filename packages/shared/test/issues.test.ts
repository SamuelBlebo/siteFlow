import { describe, expect, it } from 'vitest';
import { commentInput, filterIssues, issueActions, issueDoc, issueInput, resolveInput, siteAlerts, sortIssues, validate, type Issue } from '../src';

const base = { status: 'open' as const, assignedTo: 'a1', createdBy: 'r1' };

describe('who can do what', () => {
  it('site managers can do everything; finance and viewers nothing', () => {
    expect(issueActions(base, { uid: 'm', role: 'manager' })).toMatchObject({ comment: true, edit: true, assign: true, setPriority: true, start: true, resolve: true });
    for (const role of ['finance', 'viewer'] as const) {
      expect(Object.values(issueActions(base, { uid: 'x', role })).some(Boolean)).toBe(false);
    }
  });
  it('the assignee starts and resolves; cannot assign, close or reopen', () => {
    const a = issueActions(base, { uid: 'a1', role: 'supervisor' });
    expect(a).toMatchObject({ start: true, resolve: true, assign: false, close: false, edit: false, comment: true });
    expect(issueActions({ ...base, status: 'resolved' }, { uid: 'a1', role: 'supervisor' })).toMatchObject({ resolve: false, reopen: false });
  });
  it('the reporter fixes details while it is open; other supervisors only comment', () => {
    expect(issueActions(base, { uid: 'r1', role: 'supervisor' })).toMatchObject({ edit: true, resolve: false });
    expect(issueActions({ ...base, status: 'in_progress' }, { uid: 'r1', role: 'supervisor' }).edit).toBe(false);
    expect(issueActions(base, { uid: 'other', role: 'supervisor' })).toMatchObject({ comment: true, edit: false, start: false });
  });
  it('managers close resolved issues and reopen finished ones', () => {
    expect(issueActions({ ...base, status: 'resolved' }, { uid: 'm', role: 'admin' })).toMatchObject({ close: true, reopen: true, resolve: false });
    expect(issueActions({ ...base, status: 'closed' }, { uid: 'm', role: 'owner' })).toMatchObject({ reopen: true, assign: false, close: false });
  });
  it('nothing on a closed site', () => {
    expect(Object.values(issueActions(base, { uid: 'm', role: 'owner' }, false)).some(Boolean)).toBe(false);
  });
});

describe('sorting and filtering', () => {
  const t = (s: number) => ({ seconds: s });
  const issues = [
    { id: '1', title: 'Cracked lintel', priority: 'medium', status: 'open', lastActivityAt: t(5), siteId: 'a', category: 'Other', assignedTo: 'u1' },
    { id: '2', title: 'Scaffold unsafe', priority: 'critical', status: 'in_progress', lastActivityAt: t(1), siteId: 'b', category: 'Safety', assignedTo: null },
    { id: '3', title: 'No water on site', priority: 'high', status: 'resolved', lastActivityAt: t(9), siteId: 'a', category: 'Utilities', resolution: 'Tanker came' },
    { id: '4', title: 'Late cement', priority: 'medium', status: 'open', lastActivityAt: t(8), siteId: 'a', category: 'Materials', assignedTo: 'u1' },
  ] as unknown as Issue[];
  it('open first, most urgent first, then most recently active', () => {
    expect(sortIssues(issues).map((i) => i.id)).toEqual(['2', '4', '1', '3']);
  });
  it('filters by open, status, priority, site, assignee, category and text', () => {
    const ids = (f: Parameters<typeof filterIssues>[1]) => filterIssues(issues, f).map((i) => i.id);
    expect(ids({ status: 'open' })).toEqual(['1', '2', '4']);
    expect(ids({ status: 'resolved' })).toEqual(['3']);
    expect(ids({ status: 'all' })).toHaveLength(4);
    expect(ids({ priority: 'critical' })).toEqual(['2']);
    expect(ids({ siteId: 'a', assignedTo: 'u1' })).toEqual(['1', '4']);
    expect(ids({ category: 'Safety' })).toEqual(['2']);
    expect(ids({ q: 'tanker' })).toEqual(['3']);
  });
});

describe('alerts', () => {
  const site = { id: 's', name: 'S', location: 'L', stage: 'x', progress: 0, status: 'active' as const, lastReportDate: '2026-06-15' };
  it('critical issues are bad, high are warnings, others and finished ones are not alerted', () => {
    const a = siteAlerts(site, [], {}, { now: new Date('2026-06-15T10:00:00'), openIssues: [
      { title: 'Scaffold unsafe', priority: 'critical', status: 'open', assignedToName: '' },
      { title: 'Water', priority: 'high', status: 'in_progress', assignedToName: 'Kofi' },
      { title: 'Paint', priority: 'low', status: 'open', assignedToName: '' },
      { title: 'Old', priority: 'critical', status: 'resolved', assignedToName: '' },
    ] });
    expect(a.map((x) => [x.severity, x.title])).toEqual([['bad', 'Critical issue: Scaffold unsafe'], ['warn', 'High priority issue: Water']]);
    expect(a[0].detail).toBe('Not assigned to anyone yet.');
  });
});

describe('forms and the stored document', () => {
  it('needs a title, a priority and a category', () => {
    expect(validate(issueInput, { title: 'No', priority: 'high', category: 'Other' }).ok).toBe(false);
    expect(validate(issueInput, { title: 'Water pipe burst', priority: 'urgent', category: 'Other' })).toEqual({ ok: false, error: 'Choose how urgent it is.' });
    expect(validate(issueInput, { title: 'Water pipe burst', priority: 'critical', category: 'Utilities' })).toMatchObject({ ok: true, data: { description: '', location: '', dueDate: '' } });
    expect(validate(resolveInput, { resolution: '' }).ok).toBe(false);
    expect(validate(commentInput, { text: '  ' }).ok).toBe(false);
  });
  it('a new issue starts open, unresolved, with no comments', () => {
    const d = issueDoc({ title: 'Burst pipe', priority: 'critical', category: 'Utilities' },
      { companyId: 'c', siteId: 's', siteName: 'S', uid: 'u', name: 'Kofi', date: '2026-06-15', photos: ['p'] });
    expect(d).toMatchObject({ status: 'open', assignedTo: null, resolution: '', resolvedBy: null, commentCount: 0, photoCount: 1, dueDate: null, createdByName: 'Kofi' });
  });
});
