import { HIGH_USAGE_FACTOR } from '../constants';
import type { Material, MaterialLog, MaterialLogType } from '../types';

export const MATERIAL_LOG_LABELS: Record<MaterialLogType, string> = { delivery: 'Received', usage: 'Used', adjustment: 'Stock count' };

export const usageByMaterial = (logs: Pick<MaterialLog, 'type' | 'materialId' | 'qty'>[] = []) =>
  logs.filter((l) => l.type === 'usage')
      .reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.materialId]: (acc[l.materialId] || 0) + l.qty }), {});

// Change to stock that a log entry makes. A stock count (adjustment) carries the signed difference.
export const stockDelta = (l: Pick<MaterialLog, 'type' | 'qty'>) => (l.type === 'usage' ? -l.qty : l.qty);

const round = (n: number) => Math.round(n * 1000) / 1000 + 0; // + 0 turns -0 into 0

// The adjustment a stock count makes: counted minus what the records say
export const countDifference = (stock: number, counted: number) => round(counted - stock);

// Average daily use over the last `days` days (days with no usage count as zero)
export function averageDailyUse(logs: Pick<MaterialLog, 'type' | 'materialId' | 'qty' | 'date'>[], materialId: string, days: string[]) {
  if (!days.length) return 0;
  const inRange = new Set(days);
  const used = logs.filter((l) => l.type === 'usage' && l.materialId === materialId && inRange.has(l.date)).reduce((s, l) => s + l.qty, 0);
  return round(used / days.length);
}

// How many days the stock lasts at a daily rate of use (null when there's no rate to go by)
export function daysLeft(stock: number, dailyUse: number): number | null {
  if (!dailyUse || dailyUse <= 0) return null;
  return Math.max(0, Math.floor(stock / dailyUse));
}

export function materialStatus(m: Pick<Material, 'stock' | 'reorderLevel' | 'avgDaily'>, usedToday = 0) {
  return {
    low: m.reorderLevel != null && m.stock < m.reorderLevel,
    highUse: !!m.avgDaily && usedToday > m.avgDaily * HIGH_USAGE_FACTOR,
    negative: m.stock < 0, // more recorded as used than received: needs a stock count
  };
}

export interface MaterialTotals { materialId: string; name: string; unit: string; received: number; used: number; adjusted: number; cost: number; entries: number }

// Received, used, stock-count changes and delivery cost per material over a set of log entries
export function materialTotals(logs: Pick<MaterialLog, 'type' | 'materialId' | 'materialName' | 'unit' | 'qty' | 'cost'>[] = []): MaterialTotals[] {
  const by = new Map<string, MaterialTotals>();
  for (const l of logs) {
    const t = by.get(l.materialId) ?? { materialId: l.materialId, name: l.materialName, unit: l.unit, received: 0, used: 0, adjusted: 0, cost: 0, entries: 0 };
    if (l.type === 'delivery') { t.received = round(t.received + l.qty); t.cost += l.cost || 0; }
    else if (l.type === 'usage') t.used = round(t.used + l.qty);
    else t.adjusted = round(t.adjusted + l.qty);
    t.entries++;
    by.set(l.materialId, t);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Material log as CSV (newest first as given)
export function materialLogCsv(logs: Pick<MaterialLog, 'date' | 'type' | 'materialName' | 'unit' | 'qty' | 'supplier' | 'note' | 'ref' | 'createdByName' | 'cost'>[], withCost = false) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Date', 'Entry', 'Material', 'Quantity', 'Unit', 'Supplier', 'Waybill / ref', 'Note', 'By', ...(withCost ? ['Cost (GH₵)'] : [])];
  const rows = logs.map((l) => [l.date, MATERIAL_LOG_LABELS[l.type], l.materialName, l.type === 'usage' ? -l.qty : l.qty, l.unit,
    l.supplier, l.ref, l.note, l.createdByName, ...(withCost ? [l.cost || 0] : [])]);
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
