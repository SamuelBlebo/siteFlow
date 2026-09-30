import type { Attendance, Worker } from '../types';

export interface WageRow { workerId: string; name: string; trade: string; days: number; rate: number; total: number; bankName?: string; accountLast4?: string }

// Build a wage sheet from a week (or fortnight) of attendance docs
export function wageSheet(workers: Worker[], attendance: Attendance[]): { rows: WageRow[]; total: number } {
  const rows = workers.map((w) => {
    const days = attendance.filter((a) => a.present?.[w.id]).length;
    return { workerId: w.id, name: w.name, trade: w.trade, days, rate: w.dailyRate, total: days * w.dailyRate, bankName: w.bankName, accountLast4: w.accountLast4 };
  }).filter((r) => r.days > 0);
  return { rows, total: rows.reduce((x, r) => x + r.total, 0) };
}

// Generic CSV for bank bulk upload. Each bank has its own column order; map it here per bank.
export function wageSheetCsv(rows: WageRow[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [['Name', 'Trade', 'Days', 'Daily rate', 'Amount', 'Bank', 'Account (last 4)'], ...rows.map((r) => [r.name, r.trade, r.days, r.rate, r.total, r.bankName, r.accountLast4])]
    .map((line) => line.map(esc).join(',')).join('\n');
}
