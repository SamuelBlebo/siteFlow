import { money } from '../format';
import { prettyDate } from '../dates';
import type { ReportDay } from './sites';
import type { ScheduleState } from './progress';

// AI overviews: a short written summary of a project (Overview tab) or of its day (Today tab).
// The server gathers the facts below from the project's records and asks Claude to write them up;
// without an AI key, plainOverview writes the same facts as plain sentences. The money part is only
// included for people allowed to see money.

export type OverviewKind = 'project' | 'today';
export interface OverviewFacts {
  kind: OverviewKind;
  date: string; // YYYY-MM-DD, the company's today
  currency: string;
  project: {
    name: string; location: string; client?: string; status: string; stage: string;
    progress: number; planned: number | null; schedule: ScheduleState; weeksBehind: number;
    planEnd?: string | null;
  };
  stages: { name: string; pct: number; plannedEnd?: string | null; late: boolean }[];
  reports: { date: string; time: string; by: string; work: string; issues: string; workers: number; weather?: string }[];
  todayReport: ReportDay;
  workersToday: number | null;
  materialsUsedToday: { name: string; qty: number; unit: string }[];
  lowStock: { name: string; stock: number; unit: string }[];
  openIssues: { title: string; priority: string; status: string; assignedTo: string; ageDays: number }[];
  money?: { budget: number; spent: number } | null;
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const SCHEDULE_WORDS: Record<ScheduleState, string> = {
  finished: 'is finished', on_track: 'is on track', ahead: 'is ahead of plan', behind: 'is behind plan', no_plan: 'has no planned dates yet',
};

// The same facts as plain sentences (used when no AI key is set, or if the AI can't be reached)
export function plainOverview(f: OverviewFacts): string {
  const p = f.project;
  const out: string[] = [];
  const crit = f.openIssues.filter((i) => i.priority === 'critical' || i.priority === 'high');
  if (f.kind === 'project') {
    const plan = p.planned != null ? ` against ${p.planned}% planned` : '';
    out.push(`${p.name} ${SCHEDULE_WORDS[p.schedule]}: ${p.progress}% done${plan}, at the ${p.stage} stage${p.schedule === 'behind' && p.weeksBehind ? ` (about ${plural(p.weeksBehind, 'week')} behind)` : ''}.`);
    const late = f.stages.filter((s) => s.late).map((s) => s.name);
    if (late.length) out.push(`${list(late)} ${late.length === 1 ? 'is' : 'are'} past the planned finish.`);
    const recent = f.reports.slice(0, 3).map((r) => r.work.replace(/\s+/g, ' ').trim().replace(/\.$/, '')).filter(Boolean);
    if (recent.length) out.push(`Recent work: ${recent.join('; ')}.`);
    else out.push('No daily reports in the last week.');
  } else {
    const today = f.reports.filter((r) => r.date === f.date);
    if (today.length) {
      const r = today[0];
      out.push(`${r.by} reported at ${r.time}: ${r.work.replace(/\s+/g, ' ').trim().replace(/\.$/, '')}.`);
      if (r.issues) out.push(`Reported problem: ${r.issues.replace(/\s+/g, ' ').trim().replace(/\.$/, '')}.`);
    } else {
      out.push({ due: 'Today’s report has not come in yet.', skipped: 'Today was skipped: no report is needed.', day_off: 'Today is a day off on this project.', not_active: 'This project is not active, so no report is expected.', sent: 'Today’s report is in.' }[f.todayReport]);
    }
    if (f.workersToday != null) out.push(`${plural(f.workersToday, 'worker')} on site.`);
    if (f.materialsUsedToday.length) out.push(`Materials used: ${list(f.materialsUsedToday.slice(0, 4).map((m) => `${m.qty} ${m.unit} of ${m.name}`))}.`);
  }
  if (crit.length) out.push(`${plural(crit.length, 'urgent issue')} open: ${list(crit.slice(0, 3).map((i) => i.title))}.`);
  else if (f.openIssues.length) out.push(`${plural(f.openIssues.length, 'issue')} open, none urgent.`);
  if (f.lowStock.length) out.push(`Running low: ${list(f.lowStock.slice(0, 3).map((m) => `${m.name} (${m.stock} ${m.unit})`))}.`);
  if (f.kind === 'project' && f.money && f.money.budget > 0) {
    out.push(`${money(f.money.spent, f.currency)} spent of ${money(f.money.budget, f.currency)} (${Math.round((f.money.spent / f.money.budget) * 100)}%).`);
  }
  if (f.kind === 'project' && p.planEnd) out.push(`Planned finish: ${prettyDate(p.planEnd)}.`);
  return out.join(' ');
}

// What Claude is asked to do. The facts go in as JSON; the answer must stick to them.
export const OVERVIEW_SYSTEM = `You write short overviews of construction projects for the people running them: owners, project managers and site supervisors.
Use only the facts you are given. Never invent numbers, names, dates or events. If something is not in the facts, leave it out.
Write plain, direct English in short sentences, like a good site manager briefing their boss. No headings, no bullet points, no greetings, no sign-off, no markdown.
Lead with what matters most: whether the project is on track, then anything urgent (critical issues, missing reports, stock running out, overspending), then recent work, then what comes next.
Money: only mention it if a "money" section is present, using the currency code given. Dates: write them like "Fri 9 Oct".`;

export function overviewPrompt(f: OverviewFacts) {
  const ask = f.kind === 'project'
    ? 'Write the project overview in 60 to 110 words.'
    : 'Write today’s overview for this project in 40 to 80 words: what happened on site today, anything that needs attention, and what is still outstanding today.';
  return `${ask}\n\nFacts (JSON):\n${JSON.stringify(f)}`;
}
