import { BEHIND_GAP_PCT, STAGES } from '../constants';
import type { Milestone, MilestoneStatus, Report, Site } from '../types';

export const MILESTONE_STATUSES: MilestoneStatus[] = ['not_started', 'in_progress', 'done'];
export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = { not_started: 'Not started', in_progress: 'In progress', done: 'Done' };
export const PROGRESS_STEPS = [0, 25, 50, 75, 100];

const DAY = 86400000;
const t = (d: string) => Date.parse(`${d}T12:00:00`);
const iso = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const weightOf = (m: Pick<Milestone, 'weight'>) => (m.weight && m.weight > 0 ? m.weight : 1);

// Overall progress from milestones, each counted by its weight (equal weights when none are set)
export function overallProgress(milestones: Pick<Milestone, 'weight' | 'percentDone'>[]): number | null {
  if (!milestones.length) return null;
  const total = milestones.reduce((s, m) => s + weightOf(m), 0);
  return clampPct(milestones.reduce((s, m) => s + weightOf(m) * (m.percentDone || 0), 0) / total);
}

// Share of a date range that has passed, 0 to 100
function elapsed(start: string, end: string, now: Date) {
  const a = t(start), b = t(end), n = now.getTime();
  if (b <= a) return n >= b ? 100 : 0;
  return clampPct(((n - a) / (b - a)) * 100);
}

// Where the work should be by now: from milestone dates when they are set, otherwise the site's planned start and finish
export function plannedProgress(site: Pick<Site, 'planStart' | 'planEnd'>, milestones: Pick<Milestone, 'weight' | 'plannedStart' | 'plannedEnd'>[] = [], now: Date = new Date()): number | null {
  const dated = milestones.filter((m) => m.plannedEnd);
  if (milestones.length && dated.length === milestones.length) {
    const total = milestones.reduce((s, m) => s + weightOf(m), 0);
    return clampPct(milestones.reduce((s, m) => s + weightOf(m) * elapsed(m.plannedStart || m.plannedEnd!, m.plannedEnd!, now), 0) / total);
  }
  if (!site.planStart || !site.planEnd) return null;
  return elapsed(site.planStart, site.planEnd, now);
}

// Kept for older callers: percentage of the site's planned timeline that has passed
export const plannedPct = (s: Pick<Site, 'planStart' | 'planEnd'>, now: Date = new Date()) => plannedProgress(s, [], now);

export type ScheduleState = 'finished' | 'on_track' | 'ahead' | 'behind' | 'no_plan';
export const SCHEDULE_LABELS: Record<ScheduleState, string> = { finished: 'Finished', on_track: 'On track', ahead: 'Ahead', behind: 'Behind', no_plan: 'No plan dates' };

// Actual against planned. Behind means at least BEHIND_GAP_PCT points short of where it should be.
export function scheduleStatus(site: Pick<Site, 'planStart' | 'planEnd' | 'progress'>, milestones: Pick<Milestone, 'weight' | 'plannedStart' | 'plannedEnd' | 'percentDone'>[] = [], now: Date = new Date()) {
  const actual = overallProgress(milestones) ?? (site.progress || 0);
  const planned = plannedProgress(site, milestones, now);
  if (actual >= 100) return { state: 'finished' as ScheduleState, actual, planned, gap: 0, weeksBehind: 0 };
  if (planned == null) return { state: 'no_plan' as ScheduleState, actual, planned, gap: 0, weeksBehind: 0 };
  const gap = planned - actual;
  const end = site.planEnd || milestones.reduce<string | undefined>((x, m) => (m.plannedEnd && (!x || m.plannedEnd > x) ? m.plannedEnd : x), undefined);
  const start = site.planStart || milestones.reduce<string | undefined>((x, m) => { const s = m.plannedStart || m.plannedEnd; return s && (!x || s < x) ? s : x; }, undefined);
  const totalWeeks = start && end ? Math.max(0, (t(end) - t(start)) / (7 * DAY)) : 0;
  const weeksBehind = gap > 0 ? Math.round((gap / 100) * totalWeeks) : 0;
  const state: ScheduleState = gap >= BEHIND_GAP_PCT ? 'behind' : gap <= -BEHIND_GAP_PCT ? 'ahead' : 'on_track';
  return { state, actual, planned, gap, weeksBehind };
}

// Milestones past their planned finish that aren't done
export const overdueMilestones = <T extends Pick<Milestone, 'plannedEnd' | 'status'>>(milestones: T[], today: string) =>
  milestones.filter((m) => m.plannedEnd && m.plannedEnd < today && m.status !== 'done');

// Status and dates that go with a new percentage (the first progress starts it, 100% finishes it)
export function milestoneProgress(m: Pick<Milestone, 'actualStart' | 'actualEnd'>, percentDone: number, today: string) {
  const pct = clampPct(percentDone);
  const status: MilestoneStatus = pct >= 100 ? 'done' : pct > 0 ? 'in_progress' : 'not_started';
  return {
    percentDone: pct, status,
    actualStart: pct > 0 ? (m.actualStart || today) : null,
    actualEnd: pct >= 100 ? (m.actualEnd || today) : null,
  };
}

// The usual stages of a job (building by default), spread evenly over the planned dates
export function standardMilestones(planStart?: string | null, planEnd?: string | null, stages: readonly string[] = STAGES) {
  const n = stages.length;
  const dated = planStart && planEnd && t(planEnd) > t(planStart);
  const span = dated ? (t(planEnd!) - t(planStart!)) / n : 0;
  return stages.map((name, i) => ({
    name, order: i + 1, weight: 1,
    plannedStart: dated ? iso(t(planStart!) + span * i) : null,
    plannedEnd: dated ? iso(t(planStart!) + span * (i + 1) - (i + 1 < n ? DAY : 0)) : null,
  }));
}

// Progress as reported over time (last report of each day), oldest first, for the planned-vs-actual chart
export function progressSeries(reports: Pick<Report, 'date' | 'progress'>[]) {
  const byDate = new Map<string, number>();
  for (const r of [...reports].sort((a, b) => a.date.localeCompare(b.date))) byDate.set(r.date, r.progress);
  return [...byDate.entries()].map(([date, progress]) => ({ date, progress }));
}
