import { BUDGET_WARN_PCT } from '../constants';
import { isOn } from '../modules';
import { todayKey } from '../dates';
import { budgetUsedPct } from './budget';
import { materialStatus } from './materials';
import { isBehind, plannedPct, weeksBehind } from './schedule';
import type { Alert, ChangeOrder, Company, Incident, Issue, Material, Rfi, Site, SiteFinance } from '../types';

export interface AlertContext {
  company?: Pick<Company, 'modules'> | null;   // when omitted, every module counts as on
  pendingChangeOrders?: ChangeOrder[];
  openRfis?: (Rfi & { overdue?: boolean })[];
  openIncidents?: Incident[];
  openIssues?: Pick<Issue, 'title' | 'priority' | 'status' | 'assignedToName'>[];
  finance?: SiteFinance | null;                 // only passed for roles that can see money
  now?: Date;
}

// All alerts for one site. Same rules on the dashboard, in the weekly digest and in reminders.
export function siteAlerts(site: Site, materials: Material[] = [], usageToday: Record<string, number> = {}, ctx: AlertContext = {}): Alert[] {
  const on = (k: Parameters<typeof isOn>[1]) => (ctx.company ? isOn(ctx.company, k) : true);
  const now = ctx.now ?? new Date();
  const a: Alert[] = [];

  // Only active sites are expected to report daily (on-hold and closed sites are not chased)
  if (site.status === 'active' && site.lastReportDate !== todayKey(now)) {
    a.push({ kind: 'report', severity: 'bad', title: 'No daily report yet', detail: `${site.foremanName || 'The site team'} hasn't sent today's report.` });
  }
  if (on('materials')) {
    for (const m of materials) {
      const used = usageToday[m.id] || 0;
      const st = materialStatus(m, used);
      if (st.highUse) a.push({ kind: 'usage', severity: 'bad', title: `High ${m.name} use`, detail: `${used} ${m.unit} used today against a usual ${m.avgDaily}.`, tab: 'materials' });
      if (st.negative) a.push({ kind: 'stock', severity: 'bad', title: `${m.name} below zero`, detail: `Records show ${m.stock} ${m.unit}. More was recorded as used than received. Do a stock count.`, tab: 'materials' });
      else if (st.low) a.push({ kind: 'stock', severity: 'warn', title: `Low ${m.name} stock`, detail: `${m.stock} ${m.unit} left. Reorder level is ${m.reorderLevel}.`, tab: 'materials' });
    }
  }
  if (on('budget') && ctx.finance) {
    const used = budgetUsedPct(ctx.finance);
    if (used >= BUDGET_WARN_PCT) a.push({ kind: 'budget', severity: 'bad', title: 'Budget nearly used', detail: `${used}% of budget spent, work is ${site.progress || 0}% done.`, tab: 'budget' });
  }
  if (on('changeorders')) for (const c of ctx.pendingChangeOrders ?? []) a.push({ kind: 'co', severity: 'warn', title: 'Change order awaiting approval', detail: `${c.number}: ${c.title}.`, tab: 'changeorders' });
  if (on('rfis')) for (const r of (ctx.openRfis ?? []).filter((x) => x.overdue)) a.push({ kind: 'rfi', severity: 'bad', title: `${r.number} is overdue`, detail: `${r.sentTo} has not answered. Due ${r.dueDate}.`, tab: 'rfis' });
  if (on('scheduling') && isBehind(site, now)) a.push({ kind: 'schedule', severity: 'warn', title: 'Behind programme', detail: `${site.progress}% done against ${plannedPct(site, now)}% planned, about ${weeksBehind(site, now)} weeks behind.`, tab: 'schedule' });
  // Problems reported on site: critical ones first, high ones as warnings
  for (const i of ctx.openIssues ?? []) {
    if (i.status !== 'open' && i.status !== 'in_progress') continue;
    if (i.priority === 'critical') a.push({ kind: 'issue', severity: 'bad', title: `Critical issue: ${i.title}`, detail: i.assignedToName ? `Assigned to ${i.assignedToName}.` : 'Not assigned to anyone yet.', tab: 'issues' });
    else if (i.priority === 'high') a.push({ kind: 'issue', severity: 'warn', title: `High priority issue: ${i.title}`, detail: i.assignedToName ? `Assigned to ${i.assignedToName}.` : 'Not assigned to anyone yet.', tab: 'issues' });
  }
  if (on('safety')) for (const i of ctx.openIncidents ?? []) a.push({ kind: 'safety', severity: 'warn', title: `Open safety incident: ${i.type.toLowerCase()}`, detail: i.description, tab: 'safety' });

  return a.sort((x, y) => (x.severity === 'bad' ? 0 : 1) - (y.severity === 'bad' ? 0 : 1));
}
