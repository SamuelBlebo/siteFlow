import type { Attendance, AttendanceStatus, Worker } from '../types';

// Present and late both count as a day worked (and paid). Absent and leave do not.
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'leave'];
export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = { present: 'Present', late: 'Late', absent: 'Absent', leave: 'Leave' };
export const ATTENDANCE_SHORT: Record<AttendanceStatus, string> = { present: 'P', late: 'L', absent: 'A', leave: 'LV' };

export type Marks = Record<string, AttendanceStatus>;
export const isWorked = (s: AttendanceStatus | undefined | null) => s === 'present' || s === 'late';

// Workers who came to site (present or late)
export const presentCount = (marks: Marks | null | undefined) => Object.values(marks || {}).filter(isWorked).length;

export function countByStatus(marks: Marks | null | undefined) {
  const c: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, leave: 0 };
  for (const s of Object.values(marks || {})) if (s in c) c[s]++;
  return c;
}

// Marks for everyone not yet marked, for "Mark everyone present"
export function markAllPresent(workers: Pick<Worker, 'id'>[], marks: Marks | null | undefined): Marks {
  return Object.fromEntries(workers.filter((w) => !marks?.[w.id]).map((w) => [w.id, 'present' as AttendanceStatus]));
}

// Every date from `from` to `to` inclusive, as YYYY-MM-DD, oldest first
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  for (let i = 0; d <= end && i < 400; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export interface AttendanceTotals { workerId: string; name: string; trade: string; worked: number; present: number; late: number; absent: number; leave: number; unmarked: number }

// Per-worker totals over a set of days (days with no attendance record count as unmarked)
export function attendanceTotals(workers: Pick<Worker, 'id' | 'name' | 'trade'>[], records: Pick<Attendance, 'date' | 'marks'>[], days: string[]): AttendanceTotals[] {
  const byDate = new Map(records.map((r) => [r.date, r.marks || {}]));
  return workers.map((w) => {
    const t: AttendanceTotals = { workerId: w.id, name: w.name, trade: w.trade, worked: 0, present: 0, late: 0, absent: 0, leave: 0, unmarked: 0 };
    for (const d of days) {
      const s = byDate.get(d)?.[w.id];
      if (!s) t.unmarked++;
      else { t[s]++; if (isWorked(s)) t.worked++; }
    }
    return t;
  });
}

// Attendance grid as CSV: one row per worker, one column per day (P / L / A / LV), then totals
export function attendanceCsv(workers: Pick<Worker, 'id' | 'name' | 'trade'>[], records: Pick<Attendance, 'date' | 'marks'>[], days: string[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const byDate = new Map(records.map((r) => [r.date, r.marks || {}]));
  const totals = attendanceTotals(workers, records, days);
  const head = ['Name', 'Trade', ...days, 'Days worked', 'Late', 'Absent', 'Leave'];
  const rows = workers.map((w, i) => [
    w.name, w.trade, ...days.map((d) => { const s = byDate.get(d)?.[w.id]; return s ? ATTENDANCE_SHORT[s] : ''; }),
    totals[i].worked, totals[i].late, totals[i].absent, totals[i].leave,
  ]);
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
