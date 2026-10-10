import { describe, expect, it } from 'vitest';
import { OVERVIEW_SYSTEM, overviewPrompt, plainOverview, type OverviewFacts } from '../src';

const base: OverviewFacts = {
  kind: 'project', date: '2026-10-09', currency: 'GHS',
  project: { name: 'Adenta residence', location: 'Adenta', status: 'active', stage: 'Lintel level', progress: 36, planned: 52, schedule: 'behind', weeksBehind: 3, planEnd: '2027-02-06' },
  stages: [{ name: 'Blockwork', pct: 100, plannedEnd: '2026-09-01', late: false }, { name: 'Lintel level', pct: 55, plannedEnd: '2026-10-01', late: true }],
  reports: [{ date: '2026-10-09', time: '17:05', by: 'Kwame Mensah, Site supervisor', work: 'Cast lintels over bedroom windows.', issues: 'Crack above window.', workers: 6 }],
  todayReport: 'sent', workersToday: 6,
  materialsUsedToday: [{ name: 'Cement', qty: 12, unit: 'bags' }],
  lowStock: [{ name: 'Iron rods 12mm', stock: 8, unit: 'lengths' }],
  openIssues: [{ title: 'Crack in blockwork', priority: 'high', status: 'open', assignedTo: 'Kwame', ageDays: 3 }],
  money: { budget: 650000, spent: 246000 },
};

describe('plain overviews (no AI key)', () => {
  it('project: schedule first, late stages, recent work, risks, money and finish', () => {
    const t = plainOverview(base);
    expect(t).toMatch(/^Adenta residence is behind plan: 36% done against 52% planned, at the Lintel level stage \(about 3 weeks behind\)\./);
    for (const s of ['Lintel level is past the planned finish', 'Recent work: Cast lintels over bedroom windows', '1 urgent issue open: Crack in blockwork', 'Running low: Iron rods 12mm (8 lengths)', 'spent of', '(38%)', 'Planned finish: Sat 6 Feb']) expect(t).toContain(s);
  });
  it('people who may not see money never get it', () => {
    expect(plainOverview({ ...base, money: null })).not.toMatch(/spent/);
  });
  it('today: the report, workers, materials; or what is still outstanding', () => {
    const t = plainOverview({ ...base, kind: 'today' });
    expect(t).toContain('Kwame Mensah, Site supervisor reported at 17:05: Cast lintels over bedroom windows.');
    expect(t).toContain('6 workers on site.');
    expect(t).toContain('Materials used: 12 bags of Cement.');
    expect(t).not.toContain('Planned finish');
    expect(plainOverview({ ...base, kind: 'today', reports: [], todayReport: 'due' })).toContain('Today’s report has not come in yet.');
    expect(plainOverview({ ...base, kind: 'today', reports: [], todayReport: 'skipped' })).toContain('no report is needed');
  });
});

describe('what the AI is asked', () => {
  it('sticks to the facts given, plain text, and gets the facts as JSON', () => {
    expect(OVERVIEW_SYSTEM).toMatch(/Use only the facts you are given\. Never invent/);
    const p = overviewPrompt(base);
    expect(p).toContain('60 to 110 words');
    expect(JSON.parse(p.split('Facts (JSON):\n')[1]).project.name).toBe('Adenta residence');
    expect(overviewPrompt({ ...base, kind: 'today' })).toContain('40 to 80 words');
  });
});
