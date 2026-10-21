import { describe, expect, it } from 'vitest';
import { MAX_PROGRAMME_STAGES, parseCsv, programmeFromProjectXml, programmeFromRows } from '../src';

describe('programme from a spreadsheet', () => {
  it('finds the task, start and finish columns by name, below a title row', () => {
    const r = programmeFromRows([
      ['Adenta residence programme'],
      ['ID', 'Task Name', 'Duration', 'Start', 'Finish'],
      [1, 'Site clearance', '5 days', '2026-11-02', '2026-11-06'],
      [2, 'Foundations', '20 days', '2026-11-09', '2026-12-04'],
    ]);
    expect(r.stages).toEqual([
      { name: 'Site clearance', plannedStart: '2026-11-02', plannedEnd: '2026-11-06' },
      { name: 'Foundations', plannedStart: '2026-11-09', plannedEnd: '2026-12-04' },
    ]);
    expect(r.start).toBe('2026-11-02');
    expect(r.end).toBe('2026-12-04');
  });
  it('understands the usual date forms: Excel dates, day/month/year, MS Project and written months', () => {
    const r = programmeFromRows([
      ['Activity', 'Start date', 'End date'],
      ['A', new Date(Date.UTC(2026, 10, 2)), 46335],               // a Date cell; an Excel serial number (2026-11-09)
      ['B', '09/11/2026', '4/12/26'],                              // day first, as in Ghana and the UK
      ['C', 'Mon 07/12/26', 'Fri 18/12/26 17:00'],                 // MS Project's export
      ['D', '4 Jan 2027', 'January 29, 2027'],
    ]);
    expect(r.stages.map((s) => [s.plannedStart, s.plannedEnd])).toEqual([
      ['2026-11-02', '2026-11-09'], ['2026-11-09', '2026-12-04'], ['2026-12-07', '2026-12-18'], ['2027-01-04', '2027-01-29'],
    ]);
  });
  it('month first when the file can only mean that (a "day" above 12 in second place)', () => {
    const r = programmeFromRows([['Task', 'Start', 'Finish'], ['A', '11/02/2026', '11/20/2026']]);
    expect(r.stages[0]).toMatchObject({ plannedStart: '2026-11-02', plannedEnd: '2026-11-20' });
  });
  it('skips blank rows and keeps tasks with no dates (dates can be set later)', () => {
    const r = programmeFromRows([['Task', 'Start', 'Finish'], ['', '', ''], ['Roofing', '', ''], [null, null, null]]);
    expect(r.stages).toEqual([{ name: 'Roofing', plannedStart: null, plannedEnd: null }]);
  });
  it('a finish before the start is swapped, not lost', () => {
    expect(programmeFromRows([['Task', 'Start', 'Finish'], ['A', '2026-12-04', '2026-11-09']]).stages[0])
      .toMatchObject({ plannedStart: '2026-11-09', plannedEnd: '2026-12-04' });
  });
  it('with an outline column, only the top level when there are too many tasks', () => {
    const rows: unknown[][] = [['Outline Level', 'Name', 'Start', 'Finish']];
    for (let i = 0; i < 10; i++) {
      rows.push([1, `Phase ${i}`, '2026-11-02', '2026-11-30']);
      for (let j = 0; j < 5; j++) rows.push([2, `Task ${i}.${j}`, '2026-11-02', '2026-11-06']);
    }
    const r = programmeFromRows(rows);
    expect(r.stages.map((s) => s.name)).toEqual(Array.from({ length: 10 }, (_, i) => `Phase ${i}`));
  });
  it('too many tasks and no outline: the first ones, with a note', () => {
    const rows: unknown[][] = [['Task', 'Start', 'Finish'], ...Array.from({ length: 50 }, (_, i) => [`T${i}`, '', ''])];
    const r = programmeFromRows(rows);
    expect(r.stages).toHaveLength(MAX_PROGRAMME_STAGES);
    expect(r.note).toContain('50');
  });
  it('a file without a task column says so', () => {
    expect(programmeFromRows([['Amount', 'Qty'], [1, 2]]).error).toContain('task');
    expect(programmeFromRows([]).error).toBeTruthy();
  });
  it('long names are cut to fit', () => {
    expect(programmeFromRows([['Task'], ['x'.repeat(150)]]).stages[0].name).toHaveLength(100);
  });
});

describe('CSV', () => {
  it('quotes, commas and line breaks inside quotes, CRLF, semicolons', () => {
    expect(parseCsv('Task,Start\r\n"Walls, east wing","2026-11-02"\n"Say ""hi""",x\n')).toEqual([['Task', 'Start'], ['Walls, east wing', '2026-11-02'], ['Say "hi"', 'x']]);
    expect(parseCsv('Task;Start\nA;2026-11-02')).toEqual([['Task', 'Start'], ['A', '2026-11-02']]);
    expect(parseCsv('﻿Task,Start\nA,B')[0][0]).toBe('Task');
  });
});

describe('programme from MS Project (XML)', () => {
  const task = (uid: number, name: string, level: number, start: string, finish: string, extra = '') =>
    `<Task><UID>${uid}</UID><Name>${name}</Name><OutlineLevel>${level}</OutlineLevel><Start>${start}T08:00:00</Start><Finish>${finish}T17:00:00</Finish>${extra}</Task>`;
  const xml = (tasks: string) => `<?xml version="1.0" encoding="UTF-8"?><Project xmlns="http://schemas.microsoft.com/project"><Name>Adenta</Name><Tasks>${tasks}</Tasks></Project>`;
  it('the tasks, without the project summary or milestones', () => {
    const r = programmeFromProjectXml(xml(
      task(0, 'Adenta', 0, '2026-11-02', '2027-06-30')
      + task(1, 'Substructure &amp; foundations', 1, '2026-11-02', '2026-12-04')
      + task(2, 'Contract signed', 1, '2026-11-02', '2026-11-02', '<Milestone>1</Milestone>')
      + task(3, 'Superstructure', 1, '2026-12-07', '2027-03-26'),
    ));
    expect(r.stages).toEqual([
      { name: 'Substructure & foundations', plannedStart: '2026-11-02', plannedEnd: '2026-12-04' },
      { name: 'Superstructure', plannedStart: '2026-12-07', plannedEnd: '2027-03-26' },
    ]);
  });
  it('not a project file', () => {
    expect(programmeFromProjectXml('<html></html>').error).toBeTruthy();
  });
});
