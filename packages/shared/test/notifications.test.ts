import { describe, expect, it } from 'vitest';
import { NOTIFICATIONS, NOTIFICATION_KINDS, maskContact, notificationRule, notificationText, recipientsFor, templateParams, type Member } from '../src';

const members: Member[] = [
  { id: 'o', name: 'Owner', role: 'owner' }, { id: 'ad', name: 'Admin', role: 'admin' }, { id: 'm', name: 'Manager', role: 'manager' },
  { id: 'f', name: 'Finance', role: 'finance' }, { id: 's1', name: 'Sup A', role: 'supervisor', siteIds: ['a'] },
  { id: 's2', name: 'Sup B', role: 'supervisor', siteIds: ['b'] }, { id: 'v', name: 'Viewer', role: 'viewer', siteIds: ['a'] },
  { id: 'off', name: 'Off', role: 'manager', active: false },
];
const ids = (r: Member[]) => r.map((m) => m.id);

describe('who gets what', () => {
  it('critical issues and low stock: managers plus that site’s supervisors, not viewers, finance or the switched-off', () => {
    expect(ids(recipientsFor('critical_issue', members, { siteId: 'a' }))).toEqual(['o', 'ad', 'm', 's1']);
    expect(ids(recipientsFor('low_stock', members, { siteId: 'b' }))).toEqual(['o', 'ad', 'm', 's2']);
  });
  it('the person who caused it is not told about it', () => {
    expect(ids(recipientsFor('critical_issue', members, { siteId: 'a', actorId: 's1' }))).toEqual(['o', 'ad', 'm']);
  });
  it('assignment goes to the assignee only; reminders to the site’s supervisors; digest to owner and admins', () => {
    expect(ids(recipientsFor('issue_assigned', members, { assignedTo: 's2', actorId: 'm' }))).toEqual(['s2']);
    expect(ids(recipientsFor('issue_assigned', members, { assignedTo: 'm', actorId: 'm' }))).toEqual([]);
    expect(ids(recipientsFor('report_missing', members, { siteId: 'a' }))).toEqual(['s1']);
    expect(ids(recipientsFor('report_submitted', members, { siteId: 'a', actorId: 's1' }))).toEqual(['o', 'ad', 'm']);
    expect(ids(recipientsFor('weekly_digest', members))).toEqual(['o', 'ad']);
  });
});

describe('settings', () => {
  it('company choices override the defaults per channel', () => {
    expect(notificationRule(null, 'critical_issue')).toEqual({ whatsapp: true, email: true });
    expect(notificationRule({ notifications: { critical_issue: { whatsapp: false, email: true } } }, 'critical_issue')).toEqual({ whatsapp: false, email: true });
    expect(notificationRule({}, 'report_submitted')).toEqual({ whatsapp: false, email: false });
  });
});

describe('messages', () => {
  it('every template has numbered placeholders matching its parameters', () => {
    for (const k of NOTIFICATION_KINDS) {
      const t = NOTIFICATIONS[k].template;
      const nums = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(nums).toEqual(t.params.map((_, i) => i + 1));
      expect(t.name).toMatch(/^[a-z0-9_]+$/); // Meta template names: lower case and underscores
    }
  });
  it('fills parameters in order, tidies them and limits their length', () => {
    expect(templateParams('low_stock', { material: 'Cement', site: 'Adenta', stock: 4, reorder: 10 })).toEqual(['Cement', 'Adenta', '4', '10']);
    expect(templateParams('critical_issue', { site: 'A', title: 'x'.repeat(300), who: '' })[1]).toHaveLength(200);
    expect(templateParams('critical_issue', { site: 'A', title: 'Line\nbreak', who: '' })).toEqual(['A', 'Line break', '–']);
  });
  it('plain text uses the same wording', () => {
    expect(notificationText('critical_issue', { site: 'Adenta', title: 'Scaffold unsafe', who: 'Kofi' }))
      .toBe('SiteFlow: critical issue at Adenta: Scaffold unsafe. Reported by Kofi. Open SiteFlow to assign it.');
  });
  it('contacts are masked in the log', () => {
    expect(maskContact('0241234567')).toBe('…4567');
    expect(maskContact('kofi.mensah@example.com')).toBe('ko…@example.com');
  });
});
