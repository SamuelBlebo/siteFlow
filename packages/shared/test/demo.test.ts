import { describe, expect, it } from 'vitest';
import { SAMPLE_PREFIX, buildDemo, materialStatus, scheduleStatus, siteAlerts, stockDelta, todayKey, type Material, type Site } from '../src';

const now = new Date(2026, 9, 9, 18, 0); // Fri 9 Oct 2026, evening
const demo = buildDemo({ companyId: 'c1', photoBase: 'https://example.web.app/demo', now });
const today = todayKey(now);
const by = (k: string) => demo.find((s) => s.id === `${SAMPLE_PREFIX}${k}`)!;

describe('sample projects', () => {
  it('three projects, all marked as samples, every id starting with sample-', () => {
    expect(demo.map((s) => s.site.name)).toEqual(['Adenta 4-bedroom residence', 'East Legon office complex', 'Kasoa–Winneba road drainage, phase 2']);
    for (const s of demo) {
      expect(s.site.sample).toBe(true);
      const ids = [s.id, ...s.workers, ...s.materials, ...s.materialLogs, ...s.expenses, ...s.issues, ...s.milestones].map((x) => (typeof x === 'string' ? x : x.id));
      for (const id of ids) expect(id.startsWith(SAMPLE_PREFIX)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('nothing is dated in the future, and the same day builds the same data', () => {
    for (const s of demo) {
      for (const d of [...s.reports, ...s.expenses, ...s.materialLogs].map((x) => x.doc.date as string)) expect(d <= today).toBe(true);
      for (const a of s.attendance) expect(a.date <= today).toBe(true);
    }
    expect(buildDemo({ companyId: 'c1', photoBase: 'x', now })[1].materials).toEqual(buildDemo({ companyId: 'c1', photoBase: 'x', now })[1].materials);
  });

  it('each material\x27s stock is exactly what its entries add up to, and never went below zero', () => {
    for (const s of demo) {
      for (const m of s.materials) {
        const logs = s.materialLogs.filter((l) => l.doc.materialId === m.id).sort((a, b) => a.id.localeCompare(b.id));
        let stock = 0;
        for (const l of logs) { stock += stockDelta(l.doc as never); expect(stock).toBeGreaterThanOrEqual(0); }
        expect(m.doc.stock).toBe(stock);
        expect(m.doc.lastLogId).toBe(logs[logs.length - 1].id);
      }
    }
  });

  it('tells a story: the residence is behind with no report today; the office used a lot of cement; the road is low on kerbs', () => {
    const adenta = by('adenta'), legon = by('legon'), road = by('road');
    expect(adenta.site.lastReportDate).not.toBe(today);
    expect(scheduleStatus(adenta.site as unknown as Site, adenta.milestones.map((m) => m.doc) as never, now).state).toBe('behind');
    expect(legon.site.lastReportDate).toBe(today);
    const cement = legon.materials[0];
    const usedToday = legon.materialLogs.filter((l) => l.doc.materialId === cement.id && l.doc.date === today && l.doc.type === 'usage').reduce((n, l) => n + (l.doc.qty as number), 0);
    expect(materialStatus(cement.doc as unknown as Material, usedToday).highUse).toBe(true);
    expect(materialStatus(road.materials[1].doc as unknown as Material, 0).low).toBe(true);
    const alerts = siteAlerts(adenta.site as unknown as Site, [], {}, { now, milestones: adenta.milestones.map((m) => m.doc) as never });
    expect(alerts.map((a) => a.kind)).toEqual(expect.arrayContaining(['report', 'schedule']));
  });

  it('reports carry photos from the photo base, and money looks like a real job', () => {
    for (const s of demo) {
      const withPhotos = s.reports.filter((r) => (r.doc.photos as string[]).length);
      expect(withPhotos.length).toBeGreaterThan(3);
      expect((withPhotos[0].doc.photos as string[])[0]).toMatch(/^https:\/\/example\.web\.app\/demo\/.+\.jpg$/);
      expect((withPhotos[0].doc.thumbs as string[])[0]).toMatch(/-thumb\.jpg$/);
      const spent = s.expenses.reduce((n, e) => n + (e.doc.amount as number), 0);
      const usedPct = (spent / s.finance.budget) * 100;
      expect(usedPct).toBeGreaterThan(10);
      expect(usedPct).toBeLessThan(80);
      expect(s.expenses.every((e) => (e.doc.amount as number) > 0)).toBe(true);
    }
  });
});

describe('sample projects on any day', () => {
  it('the story and the stock rules hold whatever day the samples are loaded', () => {
    for (let i = 0; i < 90; i++) {
      const day = new Date(2026, 9, 9 + i, 9 + (i % 10), 0);
      const t = todayKey(day);
      const [adenta, legon, road] = buildDemo({ companyId: 'c', photoBase: 'x', now: day });
      for (const s of [adenta, legon, road]) {
        for (const m of s.materials) expect(m.doc.stock as number, `${t} ${m.doc.name}`).toBeGreaterThanOrEqual(0);
        for (const e of s.expenses) expect((e.doc.date as string) <= t).toBe(true);
      }
      expect(scheduleStatus(adenta.site as unknown as Site, adenta.milestones.map((m) => m.doc) as never, day).state, t).toBe('behind');
      if (day.getDay() !== 0) expect(legon.site.lastReportDate, t).toBe(t);
      expect(materialStatus(road.materials[1].doc as unknown as Material, 0).low, t).toBe(true);
    }
  });
});
