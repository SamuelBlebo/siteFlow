import { can, isSiteScoped } from '../permissions';
import type { Company, NotificationRule, Role } from '../types';

// Every message SiteFlow sends: who gets it, how by default, and its WhatsApp template.
// WhatsApp messages started by a business must use a template Meta has approved; the template
// names and wording here are what to submit (see docs/WHATSAPP_TEMPLATES.md).

export type NotificationKind = 'report_submitted' | 'report_missing' | 'critical_issue' | 'issue_assigned' | 'low_stock' | 'weekly_digest' | 'report_request';
export type Channel = 'whatsapp' | 'email';

export interface NotificationDef {
  label: string; description: string; who: string;
  defaults: NotificationRule;
  chosenEachTime?: boolean; // the sender picks WhatsApp and/or email each time (not a company setting)
  emailByThread?: boolean;  // email goes as a report or issue thread, by each person's email settings (logic/mail)
  template: { name: string; body: string; params: string[] }; // {{1}}, {{2}} ... in body, named in params
}

export const NOTIFICATIONS: Record<NotificationKind, NotificationDef> = {
  critical_issue: {
    emailByThread: true,
    label: 'Critical issue reported', description: 'When an issue is reported as critical, or raised to critical.',
    who: 'Owner, admins, project managers and the site’s supervisors',
    defaults: { whatsapp: true, email: true },
    template: { name: 'siteflow_critical_issue', body: 'SiteFlow: critical issue at {{1}}: {{2}}. Reported by {{3}}. Open SiteFlow to assign it.', params: ['site', 'title', 'who'] },
  },
  issue_assigned: {
    emailByThread: true,
    label: 'Issue given to someone', description: 'Tells the person an issue has been given to.',
    who: 'The person it is given to',
    defaults: { whatsapp: true, email: false },
    template: { name: 'siteflow_issue_assigned', body: 'SiteFlow: {{1}} gave you an issue at {{2}}: {{3}} ({{4}} priority).', params: ['who', 'site', 'title', 'priority'] },
  },
  report_missing: {
    label: 'Daily report missing', description: 'At 6pm, Monday to Saturday, if an active site has not sent today’s report.',
    who: 'The site’s foreman and supervisors',
    defaults: { whatsapp: true, email: true },
    template: { name: 'siteflow_report_reminder', body: 'Hi {{1}}, today’s daily report for {{2}} has not come in yet. Please send it from the SiteFlow app before 7pm. Thank you.', params: ['name', 'site'] },
  },
  low_stock: {
    label: 'Material running low', description: 'When a material drops below its reorder level (once each time it drops).',
    who: 'Owner, admins, project managers and the site’s supervisors',
    defaults: { whatsapp: false, email: true },
    template: { name: 'siteflow_low_stock', body: 'SiteFlow: {{1}} is running low at {{2}}: {{3}} left (reorder below {{4}}).', params: ['material', 'site', 'stock', 'reorder'] },
  },
  report_submitted: {
    emailByThread: true,
    label: 'Daily report sent', description: 'Each time a daily report comes in. Can be a lot of messages with many sites.',
    who: 'Owner, admins and project managers',
    defaults: { whatsapp: false, email: false },
    template: { name: 'siteflow_report_sent', body: 'SiteFlow: {{1}} sent the daily report for {{2}}: {{3}}% done, {{4}} workers. {{5}}', params: ['who', 'site', 'progress', 'workers', 'issues'] },
  },
  report_request: {
    label: 'Report requested', description: 'When a manager asks someone for a report. The person asking picks WhatsApp, email or both.',
    who: 'The person asked', chosenEachTime: true,
    defaults: { whatsapp: true, email: true },
    template: { name: 'siteflow_report_request', body: 'Hi {{1}}, {{2}} ({{3}}) has asked you for the daily report for {{4}} by {{5}}. {{6}} Please send it from the SiteFlow app.', params: ['name', 'who', 'role', 'site', 'due', 'note'] },
  },
  weekly_digest: {
    label: 'Weekly summary', description: 'Friday at 5pm: progress, spending and what needs attention.',
    who: 'Owner and admins',
    defaults: { whatsapp: true, email: true },
    template: { name: 'siteflow_weekly_summary', body: 'SiteFlow weekly summary for {{1}}: {{2}} sites, {{3}} behind. Spent this week: {{4}}. Needs attention: {{5}}. Full summary: {{6}}', params: ['company', 'sites', 'behind', 'spent', 'attention', 'link'] },
  },
};
export const NOTIFICATION_KINDS = Object.keys(NOTIFICATIONS) as NotificationKind[];
// The ones a company switches on or off (Reminders page); the rest are chosen each time they are sent
export const COMPANY_NOTIFICATION_KINDS = NOTIFICATION_KINDS.filter((k) => !NOTIFICATIONS[k].chosenEachTime);

// The company's choice for a notification, or its default
export function notificationRule(company: Pick<Company, 'notifications'> | null | undefined, kind: NotificationKind): NotificationRule {
  return { ...NOTIFICATIONS[kind].defaults, ...(company?.notifications?.[kind] || {}) };
}

export interface Member { id: string; name: string; role: Role; phone?: string; email?: string; siteIds?: string[]; active?: boolean }

// Who receives a notification. actorId (the person who caused it) is left out.
export function recipientsFor(kind: NotificationKind, members: Member[], ctx: { siteId?: string; assignedTo?: string | null; actorId?: string } = {}): Member[] {
  const on = members.filter((m) => m.active !== false && m.id !== ctx.actorId);
  const managers = on.filter((m) => can(m.role, 'sites.manage'));
  const siteSupervisors = on.filter((m) => isSiteScoped(m.role) && can(m.role, 'site.work') && !!ctx.siteId && m.siteIds?.includes(ctx.siteId));
  switch (kind) {
    case 'critical_issue':
    case 'low_stock': return [...managers, ...siteSupervisors];
    case 'issue_assigned':
    case 'report_request': return on.filter((m) => m.id === ctx.assignedTo);
    case 'report_missing': return siteSupervisors;
    case 'report_submitted': return managers;
    case 'weekly_digest': return on.filter((m) => m.role === 'owner' || m.role === 'admin');
  }
}

// Fills a template's parameters in order, trimmed to WhatsApp's limit
export function templateParams(kind: NotificationKind, values: Record<string, string | number>) {
  return NOTIFICATIONS[kind].template.params.map((p) => String(values[p] ?? '–').replace(/\s+/g, ' ').trim().slice(0, 200) || '–');
}

// The same message as plain text (email, notification log), from the template wording
export function notificationText(kind: NotificationKind, values: Record<string, string | number>) {
  const params = templateParams(kind, values);
  return NOTIFICATIONS[kind].template.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '');
}

// For the notification log: show enough of a phone or email to recognise it, not all of it
export function maskContact(c: string) {
  if (c.includes('@')) { const [u, d] = c.split('@'); return `${u.slice(0, 2)}…@${d}`; }
  const digits = c.replace(/\D/g, '');
  return digits.length > 4 ? `…${digits.slice(-4)}` : '…';
}
