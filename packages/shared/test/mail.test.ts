import { describe, expect, it } from 'vitest';
import {
  digestMail, digestMailTo, emailPrefsFor, issueMail, issueMailTo, reportMail, reportMailTo, reportSubject, reportThread, threadHeaders, weekOf,
  type MailPerson,
} from '../src';

const links = { open: 'https://app/x', settings: 'https://app/email-settings?t=abc', unsubscribe: 'https://fn/unsubscribe?t=abc' };
const p = (id: string, role: MailPerson['role'], extra: Partial<MailPerson> = {}): MailPerson => ({ id, name: `${id} name`, email: `${id}@x.com`, role, ...extra });
const team = [
  p('own', 'owner'), p('adm', 'admin', { emailPrefs: { reports: 'daily' } }), p('pm', 'manager'), p('fin', 'finance'),
  p('sup', 'supervisor', { siteIds: ['s1'] }), p('sup2', 'supervisor', { siteIds: ['s2'] }), p('view', 'viewer', { siteIds: ['s1'], emailPrefs: { reports: 'each', issues: 'all' } }),
  p('off', 'manager', { active: false }), p('noemail', 'manager', { email: '' }),
];

describe('email choices', () => {
  it('managers get everything by default; the site team only their own issues; finance nothing', () => {
    expect(emailPrefsFor(null, 'owner')).toEqual({ reports: 'each', issues: 'all' });
    expect(emailPrefsFor(undefined, 'supervisor')).toEqual({ reports: 'off', issues: 'mine' });
    expect(emailPrefsFor({}, 'finance')).toEqual({ reports: 'off', issues: 'off' });
    expect(emailPrefsFor({ reports: 'daily' }, 'manager')).toEqual({ reports: 'daily', issues: 'all' });
    expect(emailPrefsFor({ reports: 'nonsense' as never }, 'manager')).toEqual({ reports: 'each', issues: 'all' }); // bad value: default
  });
  it('report emails: people on the project who want each one, never the author, the switched-off or those without email', () => {
    expect(reportMailTo(team, 's1', 'pm').map((m) => m.id)).toEqual(['own', 'view']);
    expect(reportMailTo(team, 's2').map((m) => m.id)).toEqual(['own', 'pm']);
    expect(digestMailTo(team).map((m) => m.id)).toEqual(['adm']);
  });
  it('issue emails: "all" on the project, "mine" only when involved', () => {
    const issue = { siteId: 's1', createdBy: 'sup', assignedTo: null };
    expect(issueMailTo(team, issue, { actorId: 'sup' }).map((m) => m.id)).toEqual(['own', 'adm', 'pm', 'view']);
    expect(issueMailTo(team, issue, { actorId: 'pm' }).map((m) => m.id)).toEqual(['own', 'adm', 'sup', 'view']);
    expect(issueMailTo(team, { ...issue, siteId: 's2', createdBy: 'own', assignedTo: 'sup2' }, { actorId: 'own' }).map((m) => m.id)).toEqual(['adm', 'pm', 'sup2']);
    expect(issueMailTo(team, { ...issue, siteId: 's2', createdBy: 'own' }, { commenters: ['sup2'] }).map((m) => m.id)).toContain('sup2');
  });
});

describe('threads', () => {
  it('a project’s reports for one week share a thread and a subject', () => {
    expect(weekOf('2026-10-07')).toBe('2026-10-05'); // Wednesday -> Monday
    expect(weekOf('2026-10-11')).toBe('2026-10-05'); // Sunday stays in the same week
    expect(reportThread('c', 's', '2026-10-05')).toBe(reportThread('c', 's', '2026-10-10'));
    expect(reportThread('c', 's', '2026-10-12')).not.toBe(reportThread('c', 's', '2026-10-10'));
    expect(reportSubject('Adenta', '2026-10-08')).toBe(reportSubject('Adenta', '2026-10-06'));
  });
  it('replies point at the thread’s first message', () => {
    const first = threadHeaders('reports.c.s.2026-10-05', 'first');
    const next = threadHeaders('reports.c.s.2026-10-05', 'r2');
    expect(first['Message-ID']).toBe('<reports.c.s.2026-10-05@siteflow.app>');
    expect(first).not.toHaveProperty('In-Reply-To');
    expect(next['In-Reply-To']).toBe(first['Message-ID']);
    expect(next.References).toBe(first['Message-ID']);
    expect(next['Message-ID']).not.toBe(first['Message-ID']);
  });
});

describe('email bodies', () => {
  const report = {
    siteName: 'Adenta <residence>', date: '2026-10-08', time: '17:05', text: 'Blockwork to lintel level', issues: 'Crack above window',
    stage: 'Lintel level', progress: 55, workersPresent: 6, materialsUsed: [{ materialId: 'm', name: 'Cement', unit: 'bags', qty: 12 }],
    weather: 'Sunny', createdByName: 'Kwame Mensah', createdByRole: 'supervisor', thumbs: ['https://img/1.jpg'], photos: ['https://img/1-full.jpg'],
  };
  it('a report email carries the report itself, escaped, with settings and unsubscribe links', () => {
    const m = reportMail(report, links);
    expect(m.subject).toBe('Adenta <residence>: daily reports, week of Mon 5 Oct');
    expect(m.html).toContain('Adenta &lt;residence&gt;');
    expect(m.html).not.toContain('<residence>');
    for (const s of ['Kwame Mensah, Site supervisor', 'Blockwork to lintel level', 'Crack above window', 'Cement: 12 bags', 'https://img/1.jpg', links.unsubscribe, links.settings, links.open]) expect(m.html).toContain(s);
    expect(m.text).toContain('Progress: 55% (stage: Lintel level)');
    expect(m.text).toContain(`Unsubscribe: ${links.unsubscribe}`);
  });
  it('clients get no app button (they have no login)', () => {
    const m = reportMail(report, { ...links, open: '' }, 'You get daily reports as the client.');
    expect(m.html).not.toContain('Open the report');
    expect(m.text).not.toContain('Open in SiteFlow');
  });
  it('issue emails say what happened, in one thread subject', () => {
    const i = { siteName: 'Legon', title: 'Stair slab thickness', description: '150 or 200?', priority: 'critical' as const, category: 'Design', location: 'Stair core',
      status: 'resolved' as const, assignedToName: 'Yaw', createdByName: 'Ama', dueDate: null, resolution: 'Engineer confirmed 200 mm.' };
    const a = issueMail(i, { kind: 'created' }, links);
    const b = issueMail(i, { kind: 'comment', by: 'Yaw', text: 'Asked the engineer.' }, links);
    const c = issueMail(i, { kind: 'status', by: 'Yaw', to: 'resolved' }, links);
    expect(a.subject).toBe(b.subject);
    expect(a.html).toContain('Ama raised an issue');
    expect(b.html).toContain('Asked the engineer.');
    expect(c.html).toContain('Yaw marked it resolved');
    expect(c.html).toContain('Engineer confirmed 200 mm.');
  });
  it('the evening summary lists each report and the missing projects', () => {
    const m = digestMail('Ama Owusu', 'Fri 9 Oct', [{ ...report, link: 'https://app/r1' }], ['Kasoa road'], links);
    expect(m.subject).toBe('Daily reports, Fri 9 Oct: 1 in, 1 missing');
    expect(m.html).toContain('Hi Ama');
    expect(m.html).toContain('No report yet:</b> Kasoa road');
  });
});
