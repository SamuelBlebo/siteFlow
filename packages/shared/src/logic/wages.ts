import type { Attendance, Worker, WorkerPay } from '../types';

export interface WageRow { workerId: string; name: string; trade: string; days: number; rate: number; total: number; bankName?: string; accountLast4?: string }

export const presentCount = (present: Record<string, boolean> | null | undefined) =>
  Object.values(present || {}).filter(Boolean).length;

// Wages for one day. Workers without a pay record count as zero.
export function dailyWages(workers: Pick<Worker, 'id'>[], pay: Record<string, Pick<WorkerPay, 'dailyRate'>>, present: Record<string, boolean> | null | undefined) {
  return workers.filter((w) => present?.[w.id]).reduce((sum, w) => sum + (pay[w.id]?.dailyRate || 0), 0);
}

// Build a wage sheet from a week (or fortnight) of attendance docs
export function wageSheet(workers: Worker[], pay: Record<string, WorkerPay>, attendance: Pick<Attendance, 'present'>[]): { rows: WageRow[]; total: number } {
  const rows = workers.map((w) => {
    const days = attendance.filter((a) => a.present?.[w.id]).length;
    const p = pay[w.id];
    const rate = p?.dailyRate || 0;
    return { workerId: w.id, name: w.name, trade: w.trade, days, rate, total: days * rate, bankName: p?.bankName, accountLast4: p?.accountLast4 };
  }).filter((r) => r.days > 0);
  return { rows, total: rows.reduce((x, r) => x + r.total, 0) };
}

// Generic CSV for bank bulk upload. Each bank has its own column order; map it here per bank.
export function wageSheetCsv(rows: WageRow[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [['Name', 'Trade', 'Days', 'Daily rate', 'Amount', 'Bank', 'Account (last 4)'], ...rows.map((r) => [r.name, r.trade, r.days, r.rate, r.total, r.bankName, r.accountLast4])]
    .map((line) => line.map(esc).join(',')).join('\n');
}
