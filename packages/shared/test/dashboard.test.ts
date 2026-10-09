import { describe, expect, it } from 'vitest';
import { activityFeed, costBreakdown, plannedWeeklySpend, weeklySpend, alertCounts, dailyTotals, daysBetweenKeys, issueFlow, rankAlerts, reportCompliance, type Alert } from '../src';

describe('ranking alerts', () => {
  const a = (kind: string, severity: 'bad' | 'warn', site: string) => ({ kind, severity, title: kind, detail: '', site: { name: site } }) as Alert & { site: { name: string } };
  it('bad first, then most urgent kind, then site', () => {
    const r = rankAlerts([a('budget', 'warn', 'B'), a('report', 'bad', 'B'), a('issue', 'bad', 'Z'), a('report', 'bad', 'A'), a('stock', 'warn', 'A')]);
    expect(r.map((x) => `${x.kind}:${x.site.name}`)).toEqual(['issue:Z', 'report:A', 'report:B', 'stock:A', 'budget:B']);
  });
  it('counts per kind, most urgent first', () => {
    expect(alertCounts([a('budget', 'warn', 'B'), a('report', 'bad', 'A'), a('report', 'bad', 'B')]))
      .toEqual([{ kind: 'report', label: 'Report', count: 2 }, { kind: 'budget', label: 'Budget', count: 1 }]);
  });
});

describe('report reliability and daily totals', () => {
  const days = ['2026-06-12', '2026-06-13', '2026-06-15'];
  const reports = [
    { siteId: 'a', date: '2026-06-12', workersPresent: 8 }, { siteId: 'a', date: '2026-06-12', workersPresent: 2 },
    { siteId: 'a', date: '2026-06-15', workersPresent: 6 }, { siteId: 'b', date: '2026-06-13', workersPresent: 4 },
    { siteId: 'b', date: '2026-06-01', workersPresent: 9 },
  ];
  it('days with at least one report per site', () => {
    const c = reportCompliance(reports, ['a', 'b', 'c'], days);
    expect(c.a).toEqual({ sent: 2, expected: 3, pct: 67, missing: ['2026-06-13'] });
    expect(c.b.pct).toBe(33);
    expect(c.c).toMatchObject({ sent: 0, pct: 0 });
  });
  it('reports and workers per day', () => {
    expect(dailyTotals(reports, days)).toEqual([
      { date: '2026-06-12', reports: 2, workers: 10 }, { date: '2026-06-13', reports: 1, workers: 4 }, { date: '2026-06-15', reports: 1, workers: 6 },
    ]);
  });
  it('days between dates', () => {
    expect(daysBetweenKeys('2026-06-12', '2026-06-15')).toBe(3);
  });
});

describe('issues and activity', () => {
  const sec = (d: string) => ({ seconds: Date.parse(`${d}T10:00:00`) / 1000 });
  it('opened, resolved, open and critical', () => {
    expect(issueFlow([
      { date: '2026-06-01', status: 'resolved', priority: 'high', resolvedAt: sec('2026-06-10') },
      { date: '2026-06-09', status: 'open', priority: 'critical' },
      { date: '2026-05-01', status: 'in_progress', priority: 'low' },
      { date: '2026-05-01', status: 'closed', priority: 'low', resolvedAt: sec('2026-05-02') },
    ], '2026-06-05')).toEqual({ opened: 1, resolved: 1, open: 2, critical: 1 });
  });
  it('items saved in the same second keep their order', () => {
    const f = activityFeed(
      [{ id: 'r1', siteId: 'a', siteName: 'A', createdByName: 'K', text: 'Report', date: '2026-06-15', time: '17:00', createdAt: { seconds: 100, nanoseconds: 1000 } }],
      [{ id: 'i1', siteId: 'a', siteName: 'A', createdByName: 'K', title: 'Issue', priority: 'low', date: '2026-06-15', createdAt: { seconds: 100, nanoseconds: 900000 } }],
    );
    expect(f[0].kind).toBe('issue');
  });
  it('latest reports and issues together, newest first', () => {
    const f = activityFeed(
      [{ id: 'r1', siteId: 'a', siteName: 'Adenta', createdByName: 'Kofi', text: 'Blockwork', date: '2026-06-14', time: '17:00', createdAt: sec('2026-06-14') }],
      [{ id: 'i1', siteId: 'b', siteName: 'Tema', createdByName: 'Ama', title: 'Pipe burst', priority: 'critical', date: '2026-06-15', createdAt: sec('2026-06-15') }],
    );
    expect(f.map((x) => `${x.kind}:${x.title}`)).toEqual(['issue:Critical: Pipe burst', 'report:Blockwork']);
  });
});

describe('spending for the dashboard', () => {
  const now = new Date(2026, 9, 9); // Fri 9 Oct 2026
  it('adds expenses into Monday-to-Sunday weeks, oldest first', () => {
    const w = weeklySpend([{ date: '2026-10-05', amount: 100 }, { date: '2026-10-09', amount: 50 }, { date: '2026-10-04', amount: 7 }, { date: '2026-01-01', amount: 999 }], 2, now);
    expect(w.map((x) => [x.start, x.end, x.total])).toEqual([['2026-09-28', '2026-10-04', 7], ['2026-10-05', '2026-10-11', 150]]);
  });
  it('spreads each budget over its planned weeks, skipping sites without a plan', () => {
    expect(plannedWeeklySpend([{ budget: 70000, planStart: '2026-01-01', planEnd: '2026-01-29' }, { budget: 5000 }])).toBe(17500);
    expect(plannedWeeklySpend([{ budget: 5000, planStart: null, planEnd: '2026-02-01' }])).toBeNull();
  });
  it('totals spending by category, biggest first', () => {
    expect(costBreakdown([{ byCategory: { Labour: 10, Materials: 30 } }, null, { byCategory: { Materials: 5, Transport: 0 } }]))
      .toEqual([{ category: 'Materials', amount: 35 }, { category: 'Labour', amount: 10 }]);
  });
});
