import { describe, expect, it } from 'vitest';
import { type Attendance, attendanceCsv, attendanceStatusInput, attendanceTotals, countByStatus, dateRange, isWorked, markAllPresent, validate, workerInput } from '../src';

const workers = [{ id: 'a', name: 'Ama Owusu', trade: 'Mason' }, { id: 'b', name: 'Yaw Boateng', trade: 'Labourer' }, { id: 'c', name: 'Kojo', trade: 'Carpenter' }];

describe('statuses', () => {
  it('present and late count as worked', () => {
    expect(['present', 'late', 'absent', 'leave'].map((s) => isWorked(s as never))).toEqual([true, true, false, false]);
    expect(isWorked(undefined)).toBe(false);
  });
  it('counts each status', () => {
    expect(countByStatus({ a: 'present', b: 'late', c: 'late', d: 'leave' })).toEqual({ present: 1, late: 2, absent: 0, leave: 1 });
  });
  it('only valid statuses are accepted', () => {
    expect(validate(attendanceStatusInput, 'late').ok).toBe(true);
    expect(validate(attendanceStatusInput, 'sick').ok).toBe(false);
  });
});

describe('mark everyone present', () => {
  it('only fills workers not yet marked', () => {
    expect(markAllPresent(workers, { b: 'absent' })).toEqual({ a: 'present', c: 'present' });
    expect(markAllPresent(workers, null)).toEqual({ a: 'present', b: 'present', c: 'present' });
  });
});

describe('history', () => {
  it('date ranges are inclusive and cross month ends', () => {
    expect(dateRange('2026-01-30', '2026-02-02')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
    expect(dateRange('2026-02-02', '2026-02-01')).toEqual([]);
  });
  const days = ['2026-06-15', '2026-06-16', '2026-06-17'];
  const records: Pick<Attendance, 'date' | 'marks'>[] = [
    { date: '2026-06-15', marks: { a: 'present', b: 'late' } },
    { date: '2026-06-16', marks: { a: 'absent', b: 'present', c: 'leave' } },
  ];
  it('totals per worker, with unmarked days', () => {
    const t = attendanceTotals(workers, records, days);
    expect(t[0]).toMatchObject({ worked: 1, present: 1, absent: 1, unmarked: 1 });
    expect(t[1]).toMatchObject({ worked: 2, present: 1, late: 1, unmarked: 1 });
    expect(t[2]).toMatchObject({ worked: 0, leave: 1, unmarked: 2 });
  });
  it('csv has a column per day and totals', () => {
    const lines = attendanceCsv(workers, records, days).split('\n');
    expect(lines[0]).toBe('"Name","Trade","2026-06-15","2026-06-16","2026-06-17","Days worked","Late","Absent","Leave"');
    expect(lines[2]).toBe('"Yaw Boateng","Labourer","L","P","","2","1","0","0"');
    expect(lines).toHaveLength(4);
  });
});

describe('workers', () => {
  it('name, trade and an optional phone', () => {
    expect(validate(workerInput, { name: 'Ama Owusu', trade: 'Mason', phone: '024 111 2222' })).toMatchObject({ ok: true, data: { phone: '0241112222' } });
    expect(validate(workerInput, { name: 'Ama Owusu', trade: '' }).ok).toBe(false);
  });
});
