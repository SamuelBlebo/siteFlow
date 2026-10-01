import { describe, expect, it } from 'vitest';
import {
  budgetLinesInput, budgetVariance, expenseCsv, expenseInput, expenseTotals, forecastAtCompletion, portfolioTotals, siteFinanceSummary,
  spendByMonth, validate, weekStart,
} from '../src';

const expenses = [
  { date: '2026-05-30', category: 'Materials', note: 'Cement', amount: 9000.5 },
  { date: '2026-06-02', category: 'Labour', note: 'Wages week 22', amount: 4200 },
  { date: '2026-06-03', category: 'Materials', note: 'Blocks', amount: 3000.25 },
  { date: '2026-06-10', category: 'Transport', note: 'Tipper', amount: 800 },
];

describe('totals from expenses', () => {
  it('sums spending overall and per category, to the pesewa', () => {
    expect(expenseTotals(expenses)).toEqual({ spent: 17000.75, byCategory: { Materials: 12000.75, Labour: 4200, Transport: 800 }, expenseCount: 4 });
    expect(expenseTotals([])).toEqual({ spent: 0, byCategory: {}, expenseCount: 0 });
  });
  it('spending per month, oldest first', () => {
    expect(spendByMonth(expenses)).toEqual([{ month: '2026-05', amount: 9000.5 }, { month: '2026-06', amount: 8000.25 }]);
  });
});

describe('budget against actual', () => {
  const f = { budget: 50000, spent: 17000.75, budgetByCategory: { Materials: 10000, Labour: 20000, Equipment: 5000 }, byCategory: { Materials: 12000.75, Labour: 4200, Transport: 800 } };
  it('rows for categories with a budget or spending, with variance and overspend', () => {
    const { rows, total } = budgetVariance(f);
    expect(rows.map((r) => r.category)).toEqual(['Materials', 'Labour', 'Transport', 'Equipment']);
    expect(rows[0]).toEqual({ category: 'Materials', budget: 10000, actual: 12000.75, variance: -2000.75, usedPct: 120, over: true });
    expect(rows[2]).toMatchObject({ budget: 0, usedPct: null, over: false });
    expect(total).toMatchObject({ category: 'All', budget: 50000, actual: 17000.75, variance: 32999.25, over: false });
  });
  it('works with nothing set', () => {
    expect(budgetVariance(null)).toEqual({ rows: [], total: { category: 'All', budget: 0, actual: 0, variance: 0, usedPct: null, over: false } });
  });
});

describe('forecasts and summaries', () => {
  it('cost at completion from spending per % of work', () => {
    expect(forecastAtCompletion(30000, 25)).toBe(120000);
    expect(forecastAtCompletion(30000, 0)).toBeNull();
  });
  it('site summary flags overspend risk and the expected overrun', () => {
    const s = siteFinanceSummary({ budget: 100000, spent: 45000 }, 25);
    expect(s).toMatchObject({ remaining: 55000, usedPct: 45, forecast: 180000, forecastOver: 80000, overspendRisk: true });
    expect(siteFinanceSummary({ budget: 100000, spent: 20000 }, 25)).toMatchObject({ overspendRisk: false, forecastOver: 0 });
  });
  it('portfolio totals', () => {
    expect(portfolioTotals([{ budget: 100, spent: 50 }, { budget: 300, spent: 100.5 }])).toEqual({ budget: 400, spent: 150.5, remaining: 249.5, usedPct: 38 });
  });
  it('week starts on Monday', () => {
    expect(weekStart(new Date('2026-06-14T10:00:00'))).toBe('2026-06-08'); // Sunday
    expect(weekStart(new Date('2026-06-15T10:00:00'))).toBe('2026-06-15'); // Monday
  });
});

describe('forms and CSV', () => {
  it('an expense needs a date, category and positive amount', () => {
    expect(validate(expenseInput, { date: '2026-06-10', category: 'Transport', amount: '800', method: 'Mobile money' })).toMatchObject({ ok: true, data: { amount: 800, payee: '' } });
    expect(validate(expenseInput, { date: '', category: 'Transport', amount: 1 }).ok).toBe(false);
    expect(validate(expenseInput, { date: '2026-06-10', category: 'Transport', amount: 0 }).ok).toBe(false);
  });
  it('category budgets cannot be negative', () => {
    expect(validate(budgetLinesInput, { Materials: '10000', Labour: '' }).ok).toBe(true);
    expect(validate(budgetLinesInput, { Materials: -1 }).ok).toBe(false);
  });
  it('csv, optionally with the site', () => {
    const lines = expenseCsv([{ ...expenses[1], payee: 'Site crew', method: 'Cash', ref: 'W22', siteName: 'Adenta' }], true).split('\n');
    expect(lines[0]).toBe('"Site","Date","Category","Details","Paid to","Paid by","Receipt / ref","Amount (GH₵)"');
    expect(lines[1]).toBe('"Adenta","2026-06-02","Labour","Wages week 22","Site crew","Cash","W22","4200"');
  });
});
