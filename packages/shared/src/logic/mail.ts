import { z } from 'zod';
import { can, isSiteScoped } from '../permissions';
import { prettyDate } from '../dates';
import type { Issue, IssueStatus, Report, Role } from '../types';
import { ISSUE_PRIORITY_LABELS, ISSUE_STATUS_LABELS } from './issues';
import { reportAuthor } from './reports';

// Reports and issues by email, as threads. Each project's daily reports for a week are one email
// conversation; each issue is one conversation (raised, comments, given to someone, resolved).
// People choose what they get (emailPrefs on users/{uid}); every email has an unsubscribe link.

export type ReportMail = 'each' | 'daily' | 'off';
export type IssueMail = 'all' | 'mine' | 'off';
export interface EmailPrefs { reports: ReportMail; issues: IssueMail }

export const REPORT_MAIL_LABELS: Record<ReportMail, string> = {
  each: 'Each report as it comes in', daily: 'One summary in the evening', off: 'No report emails',
};
export const ISSUE_MAIL_LABELS: Record<IssueMail, string> = {
  all: 'All issues on my projects', mine: 'Only issues I raised, was given or commented on', off: 'No issue emails',
};
export const emailPrefsInput = z.object({ reports: z.enum(['each', 'daily', 'off']), issues: z.enum(['all', 'mine', 'off']) });

// Managers hear about everything on their projects; the site team only about their own issues
export function defaultEmailPrefs(role: Role | string | undefined): EmailPrefs {
  if (role === 'owner' || role === 'admin' || role === 'manager') return { reports: 'each', issues: 'all' };
  if (role === 'supervisor' || role === 'viewer') return { reports: 'off', issues: 'mine' };
  return { reports: 'off', issues: 'off' };
}
export function emailPrefsFor(saved: Partial<EmailPrefs> | null | undefined, role: Role | string | undefined): EmailPrefs {
  const d = defaultEmailPrefs(role);
  const v = emailPrefsInput.safeParse({ ...d, ...(saved || {}) });
  return v.success ? v.data : d;
}

export interface MailPerson { id: string; name: string; email?: string; role: Role; siteIds?: string[]; active?: boolean; emailPrefs?: Partial<EmailPrefs> | null }
const onProject = (m: MailPerson, sid: string) => can(m.role, 'sites.all') || (isSiteScoped(m.role) && !!m.siteIds?.includes(sid));
const reachable = (m: MailPerson, actorId?: string) => m.active !== false && !!m.email && m.id !== actorId;

// Who gets a daily report by email right away (the author never does)
export function reportMailTo(people: MailPerson[], sid: string, actorId?: string) {
  return people.filter((m) => reachable(m, actorId) && onProject(m, sid) && emailPrefsFor(m.emailPrefs, m.role).reports === 'each');
}
// Who gets the evening summary, with the projects they see
export function digestMailTo(people: MailPerson[]) {
  return people.filter((m) => reachable(m) && emailPrefsFor(m.emailPrefs, m.role).reports === 'daily');
}
// Who hears about an issue: everyone set to "all" on the project, and those set to "mine" who
// raised it, were given it, or commented. The person who did it is left out.
export function issueMailTo(people: MailPerson[], issue: Pick<Issue, 'siteId' | 'createdBy' | 'assignedTo'>, ctx: { actorId?: string; commenters?: string[] } = {}) {
  const involved = new Set([issue.createdBy, issue.assignedTo, ...(ctx.commenters || [])].filter(Boolean) as string[]);
  return people.filter((m) => {
    if (!reachable(m, ctx.actorId) || !onProject(m, issue.siteId)) return false;
    const p = emailPrefsFor(m.emailPrefs, m.role).issues;
    return p === 'all' || (p === 'mine' && involved.has(m.id));
  });
}

// ---------- threads ----------
// Monday of the week a date (YYYY-MM-DD) falls in
export function weekOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const reportThread = (cid: string, sid: string, date: string) => `reports.${cid}.${sid}.${weekOf(date)}`;
export const issueThread = (cid: string, sid: string, iid: string) => `issue.${cid}.${sid}.${iid}`;
// Email headers that put every message of a thread in one conversation (Gmail, Outlook, Apple Mail):
// the same subject, and References / In-Reply-To pointing at the thread's first message id.
export function threadHeaders(thread: string, messageKey: string, domain = 'siteflow.app') {
  const clean = (s: string) => s.replace(/[^\w.-]/g, '_');
  const root = `<${clean(thread)}@${domain}>`;
  const first = messageKey === 'first';
  return {
    'Message-ID': first ? root : `<${clean(thread)}.${clean(messageKey)}@${domain}>`,
    ...(first ? {} : { 'In-Reply-To': root, References: root }),
    'X-Entity-Ref-ID': clean(`${thread}.${messageKey}`), // stops Gmail folding similar messages away
  };
}

// ---------- email bodies ----------
// open: the record in the app (empty for clients, who have no login)
export interface MailLinks { open: string; settings: string; unsubscribe: string }
export interface Mail { subject: string; text: string; html: string }

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const para = (s: string) => esc(s).replace(/\n/g, '<br>');
const NAVY = '#0F1D27'; const BRASS = '#B98D45'; const TAPE = '#F2B705'; const INK = '#0E1A22'; const MUTED = '#5F6D77'; const LINE = '#E1E6E9';

// The shared frame: SiteFlow bar, the content, a button, and why you got it
function frame({ title, preheader, body, button, reason, links }: { title: string; preheader: string; body: string; button: string; reason: string; links: MailLinks }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F2F4F5;font-family:Arial,Helvetica,sans-serif;color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F5"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
<tr><td style="background:${NAVY};padding:14px 20px"><span style="display:inline-block;width:14px;height:14px;background:${TAPE};border-radius:3px;vertical-align:middle"></span>
<span style="color:#fff;font-weight:700;letter-spacing:2px;font-size:14px;vertical-align:middle;margin-left:8px">SITEFLOW</span></td></tr>
<tr><td style="padding:22px 22px 8px">${body}</td></tr>
${links.open ? `<tr><td style="padding:8px 22px 24px"><a href="${esc(links.open)}" style="display:inline-block;background:${BRASS};color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px">${esc(button)}</a></td></tr>` : '<tr><td style="padding:4px"></td></tr>'}
<tr><td style="padding:14px 22px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED};line-height:1.5">${esc(reason)}<br>
<a href="${esc(links.settings)}" style="color:${MUTED}">Email settings</a> · <a href="${esc(links.unsubscribe)}" style="color:${MUTED}">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
}
const footerText = (reason: string, links: MailLinks) => `\n\n--\n${reason}\nEmail settings: ${links.settings}\nUnsubscribe: ${links.unsubscribe}`;
const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:${MUTED};font-size:13px;width:38%;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:14px;vertical-align:top">${v}</td></tr>`;

export function reportSubject(siteName: string, date: string) {
  return `${siteName}: daily reports, week of ${prettyDate(weekOf(date))}`;
}

// One daily report. Subject is the week's thread; the body says which day.
export function reportMail(r: Pick<Report, 'siteName' | 'date' | 'time' | 'text' | 'issues' | 'stage' | 'progress' | 'workersPresent' | 'materialsUsed' | 'weather' | 'createdByName'> & { createdByRole?: string; notes?: string; thumbs?: string[]; photos?: string[] },
  links: MailLinks, reason = 'You get each daily report on your projects.'): Mail {
  const who = reportAuthor(r);
  const day = prettyDate(r.date);
  const pics = (r.thumbs?.length ? r.thumbs : r.photos || []).filter(Boolean).slice(0, 6);
  const mats = (r.materialsUsed || []).filter((m) => m.qty > 0);
  const pct = Math.max(0, Math.min(100, Math.round(r.progress || 0)));
  const body = `<p style="margin:0 0 4px;color:${MUTED};font-size:13px">${esc(day)}, ${esc(r.time)} · ${esc(who)}</p>
<h1 style="margin:0 0 14px;font-size:20px">${esc(r.siteName)}: daily report</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px"><tr><td style="font-size:13px;color:${MUTED}">Progress ${pct}% · stage ${esc(r.stage)}</td></tr>
<tr><td style="padding-top:6px"><div style="height:8px;background:#EEF1F3;border-radius:99px"><div style="height:8px;width:${pct}%;background:${BRASS};border-radius:99px"></div></div></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${row('Work done', para(r.text))}${row('Workers on site', esc(r.workersPresent))}${r.weather ? row('Weather', esc(r.weather)) : ''}${r.issues ? row('Issues', `<span style="color:#B3372B">${para(r.issues)}</span>`) : ''}${r.notes ? row('Notes', para(r.notes)) : ''}${mats.length ? row('Materials used', mats.map((m) => `${esc(m.name)}: ${esc(m.qty)} ${esc(m.unit)}`).join('<br>')) : ''}</table>
${pics.length ? `<p style="margin:14px 0 6px;font-size:13px;color:${MUTED}">Photos (${(r.photos || pics).length})</p><div>${pics.map((u) => `<img src="${esc(u)}" width="120" height="90" alt="Site photo" style="width:120px;height:90px;object-fit:cover;border-radius:6px;margin:0 6px 6px 0;border:1px solid ${LINE}">`).join('')}</div>` : ''}`;
  const text = `${r.siteName}: daily report, ${day} ${r.time}\nFrom: ${who}\n\nProgress: ${pct}% (stage: ${r.stage})\nWorkers on site: ${r.workersPresent}\n${r.weather ? `Weather: ${r.weather}\n` : ''}\nWork done:\n${r.text}\n${r.issues ? `\nIssues:\n${r.issues}\n` : ''}${r.notes ? `\nNotes:\n${r.notes}\n` : ''}${mats.length ? `\nMaterials used:\n${mats.map((m) => `- ${m.name}: ${m.qty} ${m.unit}`).join('\n')}\n` : ''}${(r.photos || []).length ? `\nPhotos: ${(r.photos || []).length}\n` : ''}${links.open ? `\nOpen in SiteFlow: ${links.open}` : ''}${footerText(reason, links)}`;
  return { subject: reportSubject(r.siteName, r.date), text, html: frame({ title: `${r.siteName}: daily report`, preheader: `${day}: ${pct}% · ${r.workersPresent} workers · ${r.text.slice(0, 80)}`, body, button: 'Open the report', reason, links }) };
}

export type IssueEvent =
  | { kind: 'created' }
  | { kind: 'comment'; by: string; text: string }
  | { kind: 'assigned'; by: string; to: string }
  | { kind: 'status'; by: string; to: IssueStatus; note?: string };

export const issueSubject = (i: Pick<Issue, 'siteName' | 'title'>) => `Issue at ${i.siteName}: ${i.title}`;

// One message in an issue's thread
export function issueMail(i: Pick<Issue, 'siteName' | 'title' | 'description' | 'priority' | 'category' | 'location' | 'status' | 'assignedToName' | 'createdByName' | 'dueDate' | 'resolution'>,
  ev: IssueEvent, links: MailLinks, reason = 'You get emails about issues on your projects.'): Mail {
  const headline = ev.kind === 'created' ? `${i.createdByName} raised an issue`
    : ev.kind === 'comment' ? `${ev.by} commented`
      : ev.kind === 'assigned' ? `${ev.by} gave this issue to ${ev.to}`
        : `${ev.by} marked it ${ISSUE_STATUS_LABELS[ev.to].toLowerCase()}`;
  const said = ev.kind === 'comment' ? ev.text : ev.kind === 'status' ? (ev.to === 'resolved' ? i.resolution || ev.note || '' : ev.note || '') : '';
  const facts = `${row('Priority', esc(ISSUE_PRIORITY_LABELS[i.priority]))}${row('Status', esc(ISSUE_STATUS_LABELS[i.status]))}${row('About', esc([i.category, i.location].filter(Boolean).join(', ')))}${row('Given to', esc(i.assignedToName || 'Nobody yet'))}${i.dueDate ? row('Fix by', esc(prettyDate(i.dueDate))) : ''}`;
  const body = `<p style="margin:0 0 4px;color:${MUTED};font-size:13px">${esc(i.siteName)}</p>
<h1 style="margin:0 0 6px;font-size:20px">${esc(i.title)}</h1>
<p style="margin:0 0 14px;font-size:15px;font-weight:700">${esc(headline)}</p>
${said ? `<blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid ${BRASS};background:#FAF6EE;font-size:14px">${para(said)}</blockquote>` : ''}
${ev.kind === 'created' && i.description ? `<p style="margin:0 0 14px;font-size:14px">${para(i.description)}</p>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${facts}</table>`;
  const text = `${i.title} (${i.siteName})\n${headline}.\n${said ? `\n"${said}"\n` : ''}${ev.kind === 'created' && i.description ? `\n${i.description}\n` : ''}\nPriority: ${ISSUE_PRIORITY_LABELS[i.priority]} · Status: ${ISSUE_STATUS_LABELS[i.status]} · Given to: ${i.assignedToName || 'nobody yet'}\n${links.open ? `\nOpen in SiteFlow: ${links.open}` : ''}${footerText(reason, links)}`;
  return { subject: issueSubject(i), text, html: frame({ title: i.title, preheader: `${headline}${said ? `: ${said.slice(0, 80)}` : ''}`, body, button: 'Open the issue', reason, links }) };
}

// The evening summary: today's reports from the person's projects, one block each
export function digestMail(name: string, dateLabel: string, reports: (Pick<Report, 'siteName' | 'time' | 'text' | 'issues' | 'progress' | 'workersPresent' | 'createdByName'> & { createdByRole?: string; link: string })[],
  missing: string[], links: MailLinks): Mail {
  const reason = 'You chose one summary of daily reports in the evening.';
  const blocks = reports.map((r) => `<tr><td style="padding:12px 0;border-top:1px solid ${LINE}"><b style="font-size:15px">${esc(r.siteName)}</b> <span style="color:${MUTED};font-size:13px">· ${Math.round(r.progress)}% · ${esc(r.workersPresent)} workers · ${esc(reportAuthor(r))}, ${esc(r.time)}</span>
<p style="margin:6px 0 0;font-size:14px">${para(r.text.slice(0, 400))}</p>${r.issues ? `<p style="margin:6px 0 0;font-size:14px;color:#B3372B">${para(r.issues.slice(0, 300))}</p>` : ''}<p style="margin:6px 0 0"><a href="${esc(r.link)}" style="color:${BRASS};font-size:13px">Open report</a></p></td></tr>`).join('');
  const body = `<p style="margin:0 0 4px;color:${MUTED};font-size:13px">${esc(dateLabel)}</p>
<h1 style="margin:0 0 12px;font-size:20px">Daily reports: ${reports.length} in${missing.length ? `, ${missing.length} missing` : ''}</h1>
<p style="margin:0 0 6px;font-size:14px">Hi ${esc(name.split(' ')[0])}, here is today on your projects.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${blocks}</table>
${missing.length ? `<p style="margin:14px 0 0;font-size:14px"><b>No report yet:</b> ${missing.map(esc).join(', ')}</p>` : ''}`;
  const text = `Daily reports, ${dateLabel}: ${reports.length} in${missing.length ? `, ${missing.length} missing` : ''}\n\n${reports.map((r) => `${r.siteName} (${Math.round(r.progress)}%, ${r.workersPresent} workers, ${reportAuthor(r)} ${r.time})\n${r.text}${r.issues ? `\nIssues: ${r.issues}` : ''}\n${r.link}`).join('\n\n')}${missing.length ? `\n\nNo report yet: ${missing.join(', ')}` : ''}\n\nOpen SiteFlow: ${links.open}${footerText(reason, links)}`;
  return { subject: `Daily reports, ${dateLabel}: ${reports.length} in${missing.length ? `, ${missing.length} missing` : ''}`, text, html: frame({ title: 'Daily reports', preheader: reports.map((r) => r.siteName).join(', '), body, button: 'Open SiteFlow', reason, links }) };
}
