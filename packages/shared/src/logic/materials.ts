import { HIGH_USAGE_FACTOR } from '../constants';
import type { Material, MaterialLog } from '../types';

export const usageByMaterial = (logs: Pick<MaterialLog, 'type' | 'materialId' | 'qty'>[] = []) =>
  logs.filter((l) => l.type === 'usage')
      .reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.materialId]: (acc[l.materialId] || 0) + l.qty }), {});

// Change to stock that a log entry makes
export const stockDelta = (l: Pick<MaterialLog, 'type' | 'qty'>) => (l.type === 'usage' ? -l.qty : l.qty);

export function materialStatus(m: Pick<Material, 'stock' | 'reorderLevel' | 'avgDaily'>, usedToday = 0) {
  return {
    low: m.reorderLevel != null && m.stock < m.reorderLevel,
    highUse: !!m.avgDaily && usedToday > m.avgDaily * HIGH_USAGE_FACTOR,
  };
}
