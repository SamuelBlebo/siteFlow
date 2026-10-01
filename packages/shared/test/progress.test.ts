import { describe, expect, it } from 'vitest';
import {
  STAGES, milestoneInput, milestoneProgress, milestoneProgressInput, overallProgress, overdueMilestones, plannedPct, progressSeries,
  scheduleStatus, siteAlerts, standardMilestones, validate,
} from '../src';

const now = new Date('2026-04-01T12:00:00');
const site = { planStart: '2026-01-01', planEnd: '2026-12-31', progress: 10 };

describe('overall progress', () => {
  it('weights milestones; equal when weights are missing', () => {
    expect(overallProgress([{ percentDone: 100 }, { percentDone: 0 }])).toBe(50);
    expect(overallProgress([{ percentDone: 100, weight: 3 }, { percentDone: 0, weight: 1 }])).toBe(75);
    expect(overallProgress([])).toBeNull();
  });
});

describe('planned vs actual', () => {
  it('uses the site dates when milestones have none', () => {
    expect(plannedPct(site, now)).toBe(25);
    expect(plannedPct({ planStart: '2026-05-01', planEnd: '2026-05-01' }, now)).toBe(0); // same-day plan, not divide by zero
  });
  it('uses milestone dates when every milestone has them', () => {
    const ms = [
      { weight: 1, plannedStart: '2026-01-01', plannedEnd: '2026-02-28', percentDone: 100 },
      { weight: 1, plannedStart: '2026-03-01', plannedEnd: '2026-04-30', percentDone: 20 },
    ];
    const st = scheduleStatus(site, ms, now);
    expect(st.planned).toBe(76); // first done in plan (100), second about half way (~52)
    expect(st.actual).toBe(60);
    expect(st.state).toBe('behind');
    expect(st.weeksBehind).toBeGreaterThan(0);
  });
  it('on track, ahead, finished and no plan', () => {
    expect(scheduleStatus({ ...site, progress: 27 }, [], now).state).toBe('on_track');
    expect(scheduleStatus({ ...site, progress: 50 }, [], now).state).toBe('ahead');
    expect(scheduleStatus({ ...site, progress: 100 }, [], now).state).toBe('finished');
    expect(scheduleStatus({ progress: 30 }, [], now).state).toBe('no_plan');
  });
});

describe('milestones', () => {
  it('a percentage sets the status and the actual dates', () => {
    expect(milestoneProgress({}, 0, '2026-04-01')).toEqual({ percentDone: 0, status: 'not_started', actualStart: null, actualEnd: null });
    expect(milestoneProgress({}, 40, '2026-04-01')).toEqual({ percentDone: 40, status: 'in_progress', actualStart: '2026-04-01', actualEnd: null });
    expect(milestoneProgress({ actualStart: '2026-03-01' }, 100, '2026-04-01')).toEqual({ percentDone: 100, status: 'done', actualStart: '2026-03-01', actualEnd: '2026-04-01' });
    expect(milestoneProgress({}, 140, '2026-04-01').percentDone).toBe(100);
  });
  it('overdue: past the planned finish and not done', () => {
    const ms = [{ plannedEnd: '2026-03-01', status: 'in_progress' as const }, { plannedEnd: '2026-03-01', status: 'done' as const }, { plannedEnd: null, status: 'not_started' as const }];
    expect(overdueMilestones(ms, '2026-04-01')).toHaveLength(1);
  });
  it('the standard stages, spread over the planned dates without overlap', () => {
    const ms = standardMilestones('2026-01-01', '2026-10-28');
    expect(ms.map((m) => m.name)).toEqual(STAGES);
    expect(ms[0].plannedStart).toBe('2026-01-01');
    expect(ms[ms.length - 1].plannedEnd).toBe('2026-10-28');
    for (let i = 1; i < ms.length; i++) expect(ms[i].plannedStart! > ms[i - 1].plannedEnd!).toBe(true);
    expect(standardMilestones(null, null)[0]).toMatchObject({ plannedStart: null, plannedEnd: null });
  });
  it('forms', () => {
    expect(validate(milestoneInput, { name: 'Roofing', plannedStart: '2026-05-01', plannedEnd: '2026-04-01' }).ok).toBe(false);
    expect(validate(milestoneInput, { name: 'Roofing' })).toMatchObject({ ok: true, data: { weight: 1, plannedStart: '' } });
    expect(validate(milestoneProgressInput, { percentDone: 120 }).ok).toBe(false);
  });
});

describe('progress over time and alerts', () => {
  it('last reported progress per day, oldest first', () => {
    expect(progressSeries([{ date: '2026-03-02', progress: 20 }, { date: '2026-03-01', progress: 15 }, { date: '2026-03-02', progress: 22 }]))
      .toEqual([{ date: '2026-03-01', progress: 15 }, { date: '2026-03-02', progress: 22 }]);
  });
  it('behind programme and overdue milestones alert on active sites', () => {
    const s = { ...site, id: 's', name: 'S', location: 'L', stage: 'x', progress: 5, status: 'active' as const, lastReportDate: '2026-04-01' };
    const a = siteAlerts(s, [], {}, { now, milestones: [
      { name: 'Foundation', weight: 1, plannedStart: '2026-01-01', plannedEnd: '2026-03-01', percentDone: 30, status: 'in_progress' },
    ] });
    expect(a.map((x) => x.title)).toEqual(['Behind programme', 'Foundation is overdue']);
    expect(siteAlerts({ ...s, status: 'on_hold' }, [], {}, { now }).some((x) => x.kind === 'schedule')).toBe(false);
  });
});
