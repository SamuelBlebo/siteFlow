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

describe('sample projects in other countries', () => {
  const ke = buildDemo({ companyId: 'c', photoBase: 'x', now, country: 'KE' });
  const gh = buildDemo({ companyId: 'c', photoBase: 'x', now });
  it('use the country\x27s places and the company name on every record', () => {
    expect(ke.map((s) => s.site.location)).toEqual(['Karen, Nairobi', 'Westlands, Nairobi', 'Athi River, Machakos']);
    expect(ke[1].site.name).toBe('Westlands office complex');
    expect(ke[1].reports.every((r) => r.doc.siteName === 'Westlands office complex')).toBe(true);
    expect(ke[2].issues.every((r) => r.doc.siteName === ke[2].site.name)).toBe(true);
  });
  it('scale money to the currency and round it like real prices, keeping the same story', () => {
    const ratio = ke[0].finance.budget / gh[0].finance.budget;
    expect(ratio).toBeGreaterThan(10); expect(ratio).toBeLessThan(13); // about 129 KSh to 11 GH₵
    expect(String(ke[0].finance.budget)).toMatch(/^\d{2}0+$/);           // two significant figures
    expect(ke[0].expenses.every((e) => (e.doc.amount as number) > 0)).toBe(true);
    expect(ke[0].materialLogs.every((l) => !String(l.doc.supplier).includes('Ghacem'))).toBe(true);
    expect(ke.map((s) => s.materials.map((m) => m.doc.stock))).toEqual(gh.map((s) => s.materials.map((m) => m.doc.stock)));
  });
});

describe('sample people', () => {
  it('foremen and crews have local names in every record, and Ghana keeps its own', () => {
    const ke = buildDemo({ companyId: 'c', photoBase: 'x', now, country: 'KE' });
    const gh = buildDemo({ companyId: 'c', photoBase: 'x', now });
    expect(ke.map((s) => s.site.foremanName)).toEqual(['James Mwangi', 'Peter Otieno', 'Grace Wanjiku']);
    expect(ke[0].workers[0].doc.name).toBe('Brian Kiprop');
    const ghanaNames = new Set([...gh.map((s) => s.site.foremanName), ...gh.flatMap((s) => s.workers.map((w) => w.doc.name))]);
    const anyName = (docs: { doc: Record<string, unknown> }[]) => docs.flatMap((d) => Object.entries(d.doc).filter(([k]) => k === 'name' || k.endsWith('Name')).map(([, v]) => v));
    for (const s of ke) {
      for (const v of [...anyName(s.reports), ...anyName(s.issues), ...anyName(s.expenses), ...anyName(s.materialLogs), ...anyName(s.workers)]) expect(ghanaNames.has(v as string), String(v)).toBe(false);
    }
    expect(gh[0].site.foremanName).toBe('Kwame Mensah');
  });
});

describe('sample drawings', () => {
  it('each sample project has an overview drawing whose areas all link to its programme stages', () => {
    for (const s of demo) {
      expect(s.drawings).toHaveLength(1);
      const d = s.drawings[0];
      expect(s.site.overviewDrawingId).toBe(d.id);
      expect(d.doc.image).toMatch(/^https:\/\/example\.web\.app\/demo\/plans\/.+\.png$/);
      const ids = new Set(s.milestones.map((m) => m.id));
      const zones = d.doc.zones as { milestoneId: string | null; x: number; w: number; y: number; h: number }[];
      expect(zones.length).toBeGreaterThan(2);
      for (const z of zones) {
        expect(ids.has(z.milestoneId as string)).toBe(true);
        expect(z.x + z.w).toBeLessThanOrEqual(1);
        expect(z.y + z.h).toBeLessThanOrEqual(1);
      }
    }
  });
  it('the open problems are pinned where they are', () => {
    const pinned = demo.flatMap((s) => s.issues.filter((i) => i.doc.pin).map((i) => [s.drawings[0].id, i.doc.pin as { drawingId: string }]));
    expect(pinned).toHaveLength(3);
    for (const [id, pin] of pinned) expect((pin as { drawingId: string }).drawingId).toBe(id);
  });
});
