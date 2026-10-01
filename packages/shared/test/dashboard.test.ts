import { describe, expect, it } from 'vitest';
import { activityFeed, alertCounts, dailyTotals, daysBetweenKeys, issueFlow, rankAlerts, reportCompliance, type Alert } from '../src';

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
  it('latest reports and issues together, newest first', () => {
    const f = activityFeed(
      [{ id: 'r1', siteId: 'a', siteName: 'Adenta', createdByName: 'Kofi', text: 'Blockwork', date: '2026-06-14', time: '17:00', createdAt: sec('2026-06-14') }],
      [{ id: 'i1', siteId: 'b', siteName: 'Tema', createdByName: 'Ama', title: 'Pipe burst', priority: 'critical', date: '2026-06-15', createdAt: sec('2026-06-15') }],
    );
    expect(f.map((x) => `${x.kind}:${x.title}`)).toEqual(['issue:Critical: Pipe burst', 'report:Blockwork']);
  });
});
