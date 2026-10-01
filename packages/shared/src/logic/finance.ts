import { EXPENSE_CATEGORIES, OVERSPEND_GAP_PCT } from '../constants';
import type { Expense, SiteFinance } from '../types';

// Every money calculation lives here, so the web app and the Cloud Functions always agree.

export const PAYMENT_METHODS = ['Cash', 'Mobile money', 'Bank transfer', 'Cheque', 'Credit'] as const;

const round2 = (n: number) => Math.round(n * 100) / 100 + 0;

// Spending totals from the expenses themselves (what the server writes to the finance summary)
export function expenseTotals(expenses: Pick<Expense, 'amount' | 'category'>[]) {
  const byCategory: Record<string, number> = {};
  let spent = 0;
  for (const e of expenses) {
    const a = Number(e.amount) || 0;
    spent += a;
    byCategory[e.category] = round2((byCategory[e.category] || 0) + a);
  }
  return { spent: round2(spent), byCategory, expenseCount: expenses.length };
}

export interface VarianceRow { category: string; budget: number; actual: number; variance: number; usedPct: number | null; over: boolean }

// Budget against actual per category (categories with a budget or any spending), plus an "All" total row
export function budgetVariance(f: Pick<SiteFinance, 'budget' | 'spent'> & { budgetByCategory?: Record<string, number>; byCategory?: Record<string, number> } | null | undefined) {
  const budgets = f?.budgetByCategory || {};
  const actuals = f?.byCategory || {};
  const cats = [...new Set([...EXPENSE_CATEGORIES, ...Object.keys(budgets), ...Object.keys(actuals)])]
    .filter((c) => (budgets[c] || 0) > 0 || (actuals[c] || 0) > 0);
  const row = (category: string, budget: number, actual: number): VarianceRow => ({
    category, budget, actual, variance: round2(budget - actual),
    usedPct: budget > 0 ? Math.round((actual / budget) * 100) : null, over: budget > 0 && actual > budget,
  });
  const rows = cats.map((c) => row(c, budgets[c] || 0, actuals[c] || 0));
  return { rows, total: row('All', f?.budget || 0, f?.spent || 0) };
}

// The cost at completion if spending carries on at the same rate per % of work done
export function forecastAtCompletion(spent: number, progress: number): number | null {
  if (!progress || progress <= 0) return null;
  return Math.round((spent / Math.min(progress, 100)) * 100);
}

export interface SiteFinanceSummary {
  budget: number; spent: number; remaining: number; usedPct: number; progress: number;
  forecast: number | null; forecastOver: number | null; overspendRisk: boolean;
}
export function siteFinanceSummary(f: Pick<SiteFinance, 'budget' | 'spent'> | null | undefined, progress = 0): SiteFinanceSummary {
  const budget = f?.budget || 0;
  const spent = f?.spent || 0;
  const usedPct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const forecast = forecastAtCompletion(spent, progress);
  return {
    budget, spent, remaining: round2(budget - spent), usedPct, progress,
    forecast, forecastOver: forecast != null && budget > 0 ? Math.max(0, forecast - budget) : null,
    overspendRisk: budget > 0 && usedPct - (progress || 0) >= OVERSPEND_GAP_PCT,
  };
}

// Totals across sites (company finance page)
export function portfolioTotals(rows: Pick<SiteFinanceSummary, 'budget' | 'spent'>[]) {
  const budget = rows.reduce((s, r) => s + r.budget, 0);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  return { budget, spent: round2(spent), remaining: round2(budget - spent), usedPct: budget > 0 ? Math.round((spent / budget) * 100) : 0 };
}

// Spending per month (YYYY-MM), oldest first
export function spendByMonth(expenses: Pick<Expense, 'amount' | 'date'>[]) {
  const m = new Map<string, number>();
  for (const e of expenses) m.set(e.date.slice(0, 7), round2((m.get(e.date.slice(0, 7)) || 0) + (Number(e.amount) || 0)));
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, amount]) => ({ month, amount }));
}

// Monday of the week a date falls in (weekly digest "spent this week")
export function weekStart(d: Date = new Date()) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

type CsvExpense = Pick<Expense, 'date' | 'category' | 'note' | 'amount'> & { payee?: string; method?: string; ref?: string; siteName?: string };
export function expenseCsv(list: CsvExpense[], withSite = false) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = [...(withSite ? ['Site'] : []), 'Date', 'Category', 'Details', 'Paid to', 'Paid by', 'Receipt / ref', 'Amount (GH₵)'];
  const rows = list.map((e) => [...(withSite ? [e.siteName] : []), e.date, e.category, e.note, e.payee, e.method, e.ref, e.amount]);
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
