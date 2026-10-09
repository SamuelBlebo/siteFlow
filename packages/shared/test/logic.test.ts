import { describe, expect, it } from 'vitest';
import {
  applyModuleSwitch,
  budgetRemaining, budgetUsedPct, dailyWages, materialStatus, overspendRisk, plannedPct, isBehind, presentCount,
  siteAlerts, stockDelta, todayKey, usageByMaterial, validate, wageSheet, wageSheetCsv, inviteInput, reportInput,
  siteInput, companySetupInput, workerInput,
  type Material, type Site,
} from '../src';

const now = new Date('2026-06-15T10:00:00');
const site: Site = { id: 's1', name: 'Adenta', location: 'Accra', stage: 'Foundation', progress: 40, status: 'active', lastReportDate: todayKey(now), foremanName: 'Kofi' };
const cement: Material = { id: 'm1', name: 'Cement', unit: 'bags', stock: 20, reorderLevel: 30, avgDaily: 10 };

describe('materials', () => {
  it('sums usage only', () => {
    expect(usageByMaterial([
      { type: 'usage', materialId: 'm1', qty: 4 }, { type: 'usage', materialId: 'm1', qty: 3 },
      { type: 'delivery', materialId: 'm1', qty: 50 }, { type: 'usage', materialId: 'm2', qty: 1 },
    ])).toEqual({ m1: 7, m2: 1 });
  });
  it('stock delta', () => {
    expect(stockDelta({ type: 'usage', qty: 5 })).toBe(-5);
    expect(stockDelta({ type: 'delivery', qty: 5 })).toBe(5);
  });
  it('flags low stock and high use (over 130%)', () => {
    expect(materialStatus(cement, 13)).toEqual({ low: true, highUse: false, negative: false });
    expect(materialStatus(cement, 14)).toEqual({ low: true, highUse: true, negative: false });
    expect(materialStatus({ stock: 50, reorderLevel: 30, avgDaily: 0 }, 99)).toEqual({ low: false, highUse: false, negative: false });
    expect(materialStatus({ stock: -2, reorderLevel: 0, avgDaily: 0 })).toMatchObject({ negative: true });
  });
});

describe('budget', () => {
  it('percent used and remaining', () => {
    expect(budgetUsedPct({ budget: 1000, spent: 250 })).toBe(25);
    expect(budgetUsedPct(null)).toBe(0);
    expect(budgetUsedPct({ budget: 0, spent: 10 })).toBe(0);
    expect(budgetRemaining({ budget: 1000, spent: 1200 })).toBe(-200);
  });
  it('overspend risk when spend runs 15 points ahead of progress', () => {
    expect(overspendRisk({ budget: 100, spent: 55 }, 40)).toBe(true);
    expect(overspendRisk({ budget: 100, spent: 54 }, 40)).toBe(false);
  });
});

describe('wages', () => {
  const workers = [{ id: 'a', name: 'Ama', trade: 'Mason', active: true }, { id: 'b', name: 'Yaw', trade: 'Labourer', active: true }];
  const pay = { a: { dailyRate: 150 }, b: { dailyRate: 80 } };
  it('counts workers who came (present or late)', () => {
    expect(presentCount({ a: 'present', b: 'absent', c: 'late', d: 'leave' })).toBe(2);
    expect(presentCount(null)).toBe(0);
  });
  it('daily wages pay present and late, use pay records and ignore missing rates', () => {
    expect(dailyWages(workers, pay, { a: 'present', b: 'late' })).toBe(230);
    expect(dailyWages(workers, pay, { a: 'absent', b: 'leave' })).toBe(0);
    expect(dailyWages(workers, {}, { a: 'present' })).toBe(0);
  });
  it('wage sheet over several days', () => {
    const sheet = wageSheet(workers, pay, [{ marks: { a: 'present', b: 'late' } }, { marks: { a: 'present', b: 'absent' } }]);
    expect(sheet.total).toBe(150 * 2 + 80);
    expect(sheet.rows.map((r) => r.days)).toEqual([2, 1]);
    expect(wageSheetCsv(sheet.rows).split('\n')).toHaveLength(3);
  });
  it('csv escapes quotes', () => {
    expect(wageSheetCsv([{ workerId: 'x', name: 'Kwame "Big" Mensah', trade: 'Mason', days: 1, rate: 1, total: 1 }])).toContain('"Kwame ""Big"" Mensah"');
  });
});

describe('schedule', () => {
  it('planned percent and behind', () => {
    const s = { planStart: '2026-01-01', planEnd: '2026-12-31', progress: 20 };
    expect(plannedPct(s, now)).toBeGreaterThan(40);
    expect(isBehind(s, now)).toBe(true);
    expect(plannedPct({}, now)).toBeNull();
  });
});

describe('alerts', () => {
  it('missing report comes first', () => {
    const a = siteAlerts({ ...site, lastReportDate: '2026-06-14' }, [cement], { m1: 20 }, { now });
    expect(a[0].kind).toBe('report');
    expect(a.map((x) => x.kind)).toEqual(expect.arrayContaining(['usage', 'stock']));
  });
  it('on-hold and closed sites are not chased for reports', () => {
    for (const status of ['on_hold', 'closed'] as const) {
      expect(siteAlerts({ ...site, status, lastReportDate: '2026-06-14' }, [], {}, { now }).some((x) => x.kind === 'report')).toBe(false);
    }
  });
  it('budget alert only when finance data is given', () => {
    expect(siteAlerts(site, [], {}, { now }).some((x) => x.kind === 'budget')).toBe(false);
    expect(siteAlerts(site, [], {}, { now, finance: { budget: 100, spent: 95 } }).some((x) => x.kind === 'budget')).toBe(true);
  });
  it('respects company modules', () => {
    const company = { modules: {} };
    expect(siteAlerts(site, [cement], { m1: 99 }, { now, company, finance: { budget: 1, spent: 1 } })).toEqual([]);
  });
});

describe('validation', () => {
  it('report', () => {
    const r = { stage: 'Foundation', workersPresent: '6' };
    expect(validate(reportInput, { ...r, text: 'Cast lintels', progress: '45' })).toMatchObject({ ok: true, data: { progress: 45, workersPresent: 6, issues: '', notes: '', weather: '', photos: [] } });
    expect(validate(reportInput, { ...r, text: '', progress: 1 })).toMatchObject({ ok: false });
    expect(validate(reportInput, { ...r, text: 'abc', progress: 101 })).toEqual({ ok: false, error: 'Progress must be between 0 and 100.' });
    expect(validate(reportInput, { ...r, text: 'abc', progress: 1, photos: Array(9).fill('p') })).toEqual({ ok: false, error: 'Add up to 8 photos.' });
    expect(validate(reportInput, { ...r, text: 'abc', progress: 1, workersPresent: '2.5' })).toEqual({ ok: false, error: 'Enter a whole number of workers.' });
    expect(validate(reportInput, { ...r, text: 'abc', progress: 1, weather: 'Snow' }).ok).toBe(false);
    expect(validate(reportInput, { ...r, text: 'abc', progress: 1, weather: 'Heavy rain' }).ok).toBe(true);
  });
  it('site', () => {
    expect(validate(siteInput, { name: 'Adenta house', location: 'Accra', budget: '250000', stage: 'Foundation', foremanPhone: '0241234567' }).ok).toBe(true);
    expect(validate(siteInput, { name: 'Adenta house', location: 'Accra', budget: '0', stage: 'Foundation' }).ok).toBe(false);
    expect(validate(siteInput, { name: 'Adenta house', location: 'Accra', budget: 1, stage: 'x', foremanPhone: '12345' }).ok).toBe(false);
  });
  it('invite cannot create an owner', () => {
    expect(validate(inviteInput, { name: 'Ama', email: 'ama@example.com', role: 'owner' }).ok).toBe(false);
    expect(validate(inviteInput, { name: 'Ama', email: 'ama@example.com', role: 'supervisor', siteIds: ['s1'] }).ok).toBe(true);
    expect(validate(inviteInput, { name: 'Ama', email: 'nope', role: 'viewer' }).ok).toBe(false);
  });
  it('company setup and worker', () => {
    expect(validate(companySetupInput, { companyName: ' Mensah Builders ', name: 'Ama' })).toMatchObject({ ok: true, data: { companyName: 'Mensah Builders' } });
    expect(validate(workerInput, { name: 'Y', trade: 'Mason' }).ok).toBe(false);
  });
});

describe('module switches', () => {
  it('switches ready modules and refuses core or unbuilt ones', () => {
    expect(applyModuleSwitch({ materials: true }, 'labour', true)).toEqual({ materials: true, labour: true });
    expect(applyModuleSwitch({ materials: true }, 'materials', false)).toEqual({ materials: false });
    expect(applyModuleSwitch({}, 'reports', false)).toBeNull();
    expect(applyModuleSwitch({}, 'rfis', true)).toBeNull();
    expect(applyModuleSwitch({}, 'nonsense', true)).toBeNull();
  });
});
