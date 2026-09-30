import type { MaterialLog } from '../types';
export const usageByMaterial = (logs: Pick<MaterialLog, 'type' | 'materialId' | 'qty'>[] = []) =>
  logs.filter((l) => l.type === 'usage')
      .reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.materialId]: (acc[l.materialId] || 0) + l.qty }), {});
