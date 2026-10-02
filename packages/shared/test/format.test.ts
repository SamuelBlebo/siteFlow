import { describe, expect, it } from 'vitest';
import {
  siteAlerts, type Site,
  big, budgetRemaining, budgetUsedPct, cedi, daysBetween, isOn, overspendRisk, pct, planFor, prettyDate, subcontractorDue,
  timeHM, todayKey, waPhone, weeklyDigestText,
} from '../src';

describe('money', () => {
  it('whole cedis with separators; the sign goes before the symbol', () => {
    expect(cedi(1234567.4)).toBe('GH₵1,234,567');
    expect(cedi(null)).toBe('GH₵0');
    expect(cedi(-5000)).toBe('-GH₵5,000');
    expect(cedi(-0.2)).toBe('GH₵0');
  });
  it('short form never shows 1000k', () => {
    expect(big(850)).toBe('GH₵850');
    expect(big(12_400)).toBe('GH₵12k');
    expect(big(999_400)).toBe('GH₵999k');
    expect(big(999_600)).toBe('GH₵1.00m');
    expect(big(1_250_000)).toBe('GH₵1.25m');
    expect(big(-45_000)).toBe('-GH₵45k');
  });
  it('percent of a total, zero when there is no total', () => {
    expect(pct(25, 200)).toBe(13);
    expect(pct(5, 0)).toBe(0);
    expect(pct(null, 10)).toBe(0);
  });
});

describe('WhatsApp numbers', () => {
  it('turns Ghana numbers into international form', () => {
    expect(waPhone('024 123 4567')).toBe('233241234567');
    expect(waPhone('24 123 4567')).toBe('233241234567');
    expect(waPhone('+233 24 123 4567')).toBe('233241234567');
    expect(waPhone('00233241234567')).toBe('233241234567');
    expect(waPhone('+44 7700 900123')).toBe('447700900123');
    expect(waPhone('')).toBe('');
  });
});

describe('dates', () => {
  it('date keys and times use the local calendar', () => {
    const d = new Date(2026, 0, 5, 7, 3);
    expect(todayKey(d)).toBe('2026-01-05');
    expect(timeHM(d)).toBe('07:03');
    expect(prettyDate('2026-01-05')).toMatch(/Mon,? 5 Jan/);
    expect(daysBetween('2026-01-05', '2026-02-04')).toBe(30);
  });
});

describe('budget helpers', () => {
  it('used, remaining and the overspend warning', () => {
    expect(budgetUsedPct({ spent: 60, budget: 100 })).toBe(60);
    expect(budgetUsedPct(null)).toBe(0);
    expect(budgetRemaining({ spent: 120, budget: 100 })).toBe(-20);
    expect(overspendRisk({ spent: 60, budget: 100 }, 30)).toBe(true);
    expect(overspendRisk({ spent: 60, budget: 100 }, 55)).toBe(false);
  });
  it('a subcontractor is due what is certified, less retention and payments, never below zero', () => {
    const c = { contractValue: 100_000, percentDone: 50, paid: 10_000 } as Parameters<typeof subcontractorDue>[0];
    const r = subcontractorDue(c);
    expect(r.certified).toBe(50_000);
    expect(r.retention).toBeGreaterThan(0);
    expect(r.due).toBe(50_000 - r.retention - 10_000);
    expect(subcontractorDue({ ...c, paid: 1e9 }).due).toBe(0);
  });
});

describe('modules and plans', () => {
  it('reports are always on; others follow the company settings', () => {
    expect(isOn(null, 'reports')).toBe(true);
    expect(isOn(null, 'materials')).toBe(false);
    expect(isOn({ modules: { materials: true } }, 'materials')).toBe(true);
  });
  it('the plan is the highest tier switched on', () => {
    expect(planFor({})).toBe('starter');
    expect(planFor({ materials: true, labour: true })).toBe('starter');
    expect(planFor({ materials: true, budget: true })).toBe('professional');
    expect(planFor({ budget: true, equipment: true })).toBe('enterprise');
    expect(planFor({ reports: true })).toBe('starter'); // core never changes the plan
  });
});

describe('weekly summary email', () => {
  it('lists what needs attention and each site, with the link', () => {
    const text = weeklyDigestText({
      companyName: 'Asante Builders', weekEnding: 'Fri 9 Oct', totalBudget: 2_500_000, spentThisWeek: 48_000, link: 'https://app',
      sites: [{ name: 'Adenta', progress: 40, behind: true }, { name: 'Tema', progress: 80, behind: false }],
      topAlerts: [{ kind: 'stock', severity: 'warn', title: 'Low Cement stock', detail: '', siteName: 'Adenta' }],
    });
    expect(text).toContain('2 projects, GH₵2.50m total. Spent this week: GH₵48k.');
    expect(text).toContain('1. Low Cement stock, Adenta');
    expect(text).toContain('Adenta: 40% (behind)');
    expect(text).toContain('Tema: 80%');
    expect(text).toContain('https://app');
    expect(weeklyDigestText({ companyName: 'X', weekEnding: 'W', totalBudget: 0, spentThisWeek: 0, sites: [], topAlerts: [], link: 'L' })).toContain('Nothing urgent.');
  });
});

describe('site alerts', () => {
  const now = new Date(2026, 5, 15, 12);
  const site = { id: 's', name: 'Adenta', status: 'active', lastReportDate: '2026-06-15', progress: 0, foremanName: 'Kwame' } as Site;
  const titles = (...a: Parameters<typeof siteAlerts>) => siteAlerts(...a).map((x) => `${x.severity}:${x.title}`);
  const cement = { id: 'c', name: 'Cement', unit: 'bags', stock: 5, reorderLevel: 10, avgDaily: 4 };

  it('a missing report only for active sites', () => {
    expect(titles({ ...site, lastReportDate: '2026-06-14' }, [], {}, { now })).toEqual(['bad:No daily report yet']);
    expect(titles({ ...site, status: 'on_hold', lastReportDate: '' }, [], {}, { now })).toEqual([]);
    expect(titles({ ...site, status: 'closed', lastReportDate: '' }, [], {}, { now })).toEqual([]);
  });
  it('stock: low is a warning, below zero and unusual use are urgent', () => {
    expect(titles(site, [cement], {}, { now })).toEqual(['warn:Low Cement stock']);
    expect(titles(site, [{ ...cement, stock: -2 }], {}, { now })).toEqual(['bad:Cement below zero']);
    expect(titles(site, [{ ...cement, stock: 100 }], { c: 20 }, { now })).toEqual(['bad:High Cement use']);
  });
  it('switched-off modules raise nothing', () => {
    expect(titles(site, [cement], {}, { now, company: { modules: {} } })).toEqual([]);
    expect(titles(site, [], {}, { now, company: { modules: {} }, finance: { budget: 100, spent: 99 } })).toEqual([]);
  });
  it('change orders, overdue RFIs and safety incidents when those modules are on', () => {
    const all = { modules: { changeorders: true, rfis: true, safety: true } };
    expect(titles(site, [], {}, {
      now, company: all,
      pendingChangeOrders: [{ number: 'CO-1', title: 'Extra slab' }],
      openRfis: [{ number: 'RFI-2', sentTo: 'Architect', dueDate: '2026-06-01', overdue: true }, { number: 'RFI-3', sentTo: 'QS', dueDate: '2026-07-01', overdue: false }],
      openIncidents: [{ type: 'Fall', description: 'Slipped on rebar' }],
    } as Parameters<typeof siteAlerts>[3])).toEqual(['bad:RFI-2 is overdue', 'warn:Change order awaiting approval', 'warn:Open safety incident: fall']);
  });
  it('urgent alerts come before warnings', () => {
    const a = siteAlerts({ ...site, lastReportDate: '' }, [cement], {}, { now });
    expect(a.map((x) => x.severity)).toEqual(['bad', 'warn']);
  });
});
