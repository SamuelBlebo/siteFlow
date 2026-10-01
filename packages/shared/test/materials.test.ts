import { describe, expect, it } from 'vitest';
import {
  averageDailyUse, countDifference, daysLeft, materialEditInput, materialLogCsv, materialLogInput, materialTotals, siteAlerts,
  stockCountInput, stockDelta, validate, type MaterialLog,
} from '../src';

const log = (type: MaterialLog['type'], qty: number, date = '2026-06-15', extra: Partial<MaterialLog> = {}) =>
  ({ materialId: 'c', materialName: 'Cement', unit: 'bags', type, qty, cost: 0, supplier: '', date, createdBy: 'u', ...extra });

describe('stock movements', () => {
  it('received adds, used takes away, a stock count carries its signed difference', () => {
    expect(stockDelta({ type: 'delivery', qty: 50 })).toBe(50);
    expect(stockDelta({ type: 'usage', qty: 5 })).toBe(-5);
    expect(stockDelta({ type: 'adjustment', qty: -3 })).toBe(-3);
    expect(countDifference(42, 39)).toBe(-3);
    expect(countDifference(0.1 + 0.2, 0.3)).toBe(0);
  });
});

describe('usage rate and days left', () => {
  const logs = [log('usage', 10, '2026-06-14'), log('usage', 5, '2026-06-15'), log('delivery', 100, '2026-06-15'), log('usage', 99, '2026-06-01')];
  it('averages usage over the days given', () => {
    expect(averageDailyUse(logs, 'c', ['2026-06-13', '2026-06-14', '2026-06-15'])).toBe(5);
    expect(averageDailyUse(logs, 'c', [])).toBe(0);
  });
  it('days left at that rate', () => {
    expect(daysLeft(23, 5)).toBe(4);
    expect(daysLeft(-4, 5)).toBe(0);
    expect(daysLeft(23, 0)).toBeNull();
  });
});

describe('totals and CSV', () => {
  const logs = [
    log('delivery', 100, '2026-06-10', { cost: 9000, supplier: 'Ghacem', ref: 'WB-12' }), log('usage', 12), log('usage', 8),
    log('adjustment', -3, '2026-06-15', { note: 'Damaged by rain' }),
    { ...log('delivery', 500, '2026-06-12'), materialId: 'b', materialName: 'Blocks', unit: 'pcs' },
  ];
  it('received, used, adjusted and cost per material', () => {
    expect(materialTotals(logs)).toEqual([
      { materialId: 'b', name: 'Blocks', unit: 'pcs', received: 500, used: 0, adjusted: 0, cost: 0, entries: 1 },
      { materialId: 'c', name: 'Cement', unit: 'bags', received: 100, used: 20, adjusted: -3, cost: 9000, entries: 4 },
    ]);
  });
  it('csv shows used as negative and cost only when asked', () => {
    const csv = materialLogCsv(logs.slice(0, 2).map((l) => ({ ...l, createdByName: 'Kofi' })));
    expect(csv.split('\n')[0]).not.toContain('Cost');
    expect(csv.split('\n')[2]).toBe('"2026-06-15","Used","Cement","-12","bags","","","","Kofi"');
    expect(materialLogCsv(logs.slice(0, 1), true).split('\n')[1]).toContain('"9000"');
  });
});

describe('alerts', () => {
  const site = { id: 's', name: 'S', location: 'L', stage: 'x', progress: 0, status: 'active' as const, lastReportDate: '2026-06-15' };
  it('stock below zero is flagged instead of a low-stock warning', () => {
    const a = siteAlerts(site, [{ id: 'c', name: 'Cement', unit: 'bags', stock: -4, reorderLevel: 10, avgDaily: 0 }], {}, { now: new Date('2026-06-15T10:00:00') });
    expect(a.map((x) => x.title)).toEqual(['Cement below zero']);
  });
});

describe('forms', () => {
  it('entries need a positive quantity; delivery details are optional', () => {
    expect(validate(materialLogInput, { materialId: 'c', type: 'usage', qty: '5', note: 'Column casting' })).toMatchObject({ ok: true, data: { qty: 5, ref: '' } });
    expect(validate(materialLogInput, { materialId: 'c', type: 'usage', qty: 0 }).ok).toBe(false);
    expect(validate(materialLogInput, { materialId: 'c', type: 'adjustment', qty: 1 }).ok).toBe(false);
  });
  it('a stock count needs a reason', () => {
    expect(validate(stockCountInput, { counted: '40', note: '' }).ok).toBe(false);
    expect(validate(stockCountInput, { counted: '-1', note: 'Monthly count' }).ok).toBe(false);
    expect(validate(stockCountInput, { counted: '40', note: 'Monthly count' })).toMatchObject({ ok: true, data: { counted: 40 } });
  });
  it('editing a material never sets stock', () => {
    const v = validate(materialEditInput, { name: 'Cement', unit: 'bags', stock: 999, reorderLevel: 10, avgDaily: 5 });
    expect(v.ok && 'stock' in v.data).toBe(false);
  });
});
