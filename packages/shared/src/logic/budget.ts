import { OVERSPEND_GAP_PCT, RETENTION_RATE } from '../constants';
import { pct } from '../format';
import type { Site, Subcontractor } from '../types';

export const budgetUsedPct = (s: Pick<Site, 'spent' | 'budget'>) => pct(s.spent, s.budget);
export const overspendRisk = (s: Pick<Site, 'spent' | 'budget' | 'progress'>) => budgetUsedPct(s) - (s.progress || 0) >= OVERSPEND_GAP_PCT;

export function subcontractorDue(c: Subcontractor) {
  const certified = (c.contractValue * c.percentDone) / 100;
  const retention = certified * RETENTION_RATE;
  return { certified, retention, due: Math.max(0, certified - retention - c.paid) };
}
