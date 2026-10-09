import type { Alert, Issue, Report } from '../types';

// What the dashboard shows and in what order. Kept here so web and mobile agree.

export const ALERT_LABELS: Record<string, string> = {
  issue: 'Issue', report: 'Report', schedule: 'Programme', budget: 'Budget', stock: 'Stock', usage: 'Usage',
  safety: 'Safety', co: 'Change order', rfi: 'RFI',
};
// Most urgent kind first within the same severity
const KIND_ORDER = ['issue', 'safety', 'report', 'stock', 'usage', 'budget', 'schedule', 'co', 'rfi'];

// Bad before warning, then by kind, then by site name
export function rankAlerts<T extends Alert & { site?: { name: string } }>(alerts: T[]): T[] {
  const k = (a: Alert) => { const i = KIND_ORDER.indexOf(a.kind); return i < 0 ? 99 : i; };
  return [...alerts].sort((a, b) =>
    (a.severity === 'bad' ? 0 : 1) - (b.severity === 'bad' ? 0 : 1) || k(a) - k(b) || (a.site?.name || '').localeCompare(b.site?.name || ''));
}

// Counts per kind (for filter chips), most urgent kinds first
export function alertCounts(alerts: Alert[]) {
  const c = new Map<string, number>();
  for (const a of alerts) c.set(a.kind, (c.get(a.kind) || 0) + 1);
  return [...c.entries()].sort((a, b) => KIND_ORDER.indexOf(a[0]) - KIND_ORDER.indexOf(b[0])).map(([kind, count]) => ({ kind, label: ALERT_LABELS[kind] || kind, count }));
}

// Whole days between two YYYY-MM-DD dates (b after a is positive)
export const daysBetweenKeys = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000);

// How reliably each site sends a daily report over the given working days
export function reportCompliance(reports: Pick<Report, 'siteId' | 'date'>[], siteIds: string[], days: string[]) {
  const inRange = new Set(days);
  const sent = new Map<string, Set<string>>(siteIds.map((id) => [id, new Set<string>()]));
  for (const r of reports) if (inRange.has(r.date)) sent.get(r.siteId)?.add(r.date);
  return Object.fromEntries(siteIds.map((id) => {
    const s = sent.get(id)!;
    return [id, { sent: s.size, expected: days.length, pct: days.length ? Math.round((s.size / days.length) * 100) : 0, missing: days.filter((d) => !s.has(d)) }];
  })) as Record<string, { sent: number; expected: number; pct: number; missing: string[] }>;
}

// Per day across sites: reports sent and workers reported on site (oldest first)
export function dailyTotals(reports: Pick<Report, 'date' | 'workersPresent'>[], days: string[]) {
  const by = new Map(days.map((d) => [d, { date: d, reports: 0, workers: 0 }]));
  for (const r of reports) {
    const x = by.get(r.date);
    if (x) { x.reports++; x.workers += r.workersPresent || 0; }
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Issues opened and resolved since a date, and what is open now
export function issueFlow(issues: (Pick<Issue, 'date' | 'status' | 'priority'> & { resolvedAt?: unknown })[], from: string) {
  const ts = (v: unknown) => (v && typeof v === 'object' && 'seconds' in v ? new Date((v as { seconds: number }).seconds * 1000) : null);
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let opened = 0, resolved = 0, open = 0, critical = 0;
  for (const i of issues) {
    if (i.date >= from) opened++;
    const r = ts(i.resolvedAt);
    if (r && key(r) >= from) resolved++;
    if (i.status === 'open' || i.status === 'in_progress') { open++; if (i.priority === 'critical') critical++; }
  }
  return { opened, resolved, open, critical };
}

export interface ActivityItem { kind: 'report' | 'issue'; siteId: string; siteName: string; id: string; title: string; who: string; at: number }

// Latest reports and issues across sites, newest first
export function activityFeed(reports: (Pick<Report, 'siteId' | 'siteName' | 'createdByName' | 'text' | 'date' | 'time'> & { id: string; createdAt?: unknown })[],
  issues: (Pick<Issue, 'siteId' | 'siteName' | 'createdByName' | 'title' | 'priority' | 'date'> & { id: string; createdAt?: unknown })[], n = 12): ActivityItem[] {
  // Firestore timestamps: include the fraction of a second so items saved in the same second keep their order
  const t = (v: unknown, fallback: string) => {
    if (v && typeof v === 'object' && 'seconds' in v) { const x = v as { seconds: number; nanoseconds?: number }; return x.seconds * 1000 + (x.nanoseconds || 0) / 1e6; }
    return Date.parse(`${fallback}T12:00:00`);
  };
  return [
    ...reports.map((r) => ({ kind: 'report' as const, siteId: r.siteId, siteName: r.siteName, id: r.id, title: r.text, who: r.createdByName, at: t(r.createdAt, r.date) })),
    ...issues.map((i) => ({ kind: 'issue' as const, siteId: i.siteId, siteName: i.siteName, id: i.id, title: `${i.priority === 'critical' ? 'Critical: ' : ''}${i.title}`, who: i.createdByName, at: t(i.createdAt, i.date) })),
  ].sort((a, b) => b.at - a.at).slice(0, n);
}

// Spending per week (Monday to Sunday), oldest first, for the last n weeks including this one
const DAY_MS = 86400000;
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function weeklySpend(expenses: { date: string; amount: number }[], n = 8, now: Date = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const weeks = Array.from({ length: n }, (_, i) => {
    const start = new Date(monday.getTime() - (n - 1 - i) * 7 * DAY_MS);
    const end = new Date(start.getTime() + 6 * DAY_MS);
    return { start: keyOf(start), end: keyOf(end), label: start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), total: 0 };
  });
  for (const e of expenses) {
    const w = weeks.find((x) => e.date >= x.start && e.date <= x.end);
    if (w) w.total += Number(e.amount) || 0;
  }
  return weeks;
}

// The planned spend per week across sites: each site's budget spread evenly over its planned dates.
// Sites without both dates (or a budget) are left out; null when no site has a plan.
export function plannedWeeklySpend(sites: { budget?: number; planStart?: string | null; planEnd?: string | null }[]) {
  let total = 0, any = false;
  for (const s of sites) {
    if (!s.budget || !s.planStart || !s.planEnd) continue;
    const weeks = (Date.parse(s.planEnd) - Date.parse(s.planStart)) / (7 * DAY_MS);
    if (!(weeks > 0)) continue;
    total += s.budget / weeks; any = true;
  }
  return any ? Math.round(total) : null;
}

// Spending by category across sites, biggest first (from each site's finance summary)
export function costBreakdown(finances: ({ byCategory?: Record<string, number> } | null | undefined)[]) {
  const by: Record<string, number> = {};
  for (const f of finances) for (const [k, v] of Object.entries(f?.byCategory || {})) by[k] = (by[k] || 0) + (Number(v) || 0);
  return Object.entries(by).filter(([, v]) => v > 0).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}
