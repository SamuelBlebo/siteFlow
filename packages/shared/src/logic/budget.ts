import { OVERSPEND_GAP_PCT, RETENTION_RATE } from '../constants';
import { pct } from '../format';
import type { SiteFinance, Subcontractor } from '../types';

export const budgetUsedPct = (f: Pick<SiteFinance, 'spent' | 'budget'> | null | undefined) => pct(f?.spent, f?.budget);
export const budgetRemaining = (f: Pick<SiteFinance, 'spent' | 'budget'> | null | undefined) => (f?.budget || 0) - (f?.spent || 0);
export const overspendRisk = (f: Pick<SiteFinance, 'spent' | 'budget'> | null | undefined, progress = 0) =>
  budgetUsedPct(f) - (progress || 0) >= OVERSPEND_GAP_PCT;

export function subcontractorDue(c: Subcontractor) {
  const certified = (c.contractValue * c.percentDone) / 100;
  const retention = certified * RETENTION_RATE;
  return { certified, retention, due: Math.max(0, certified - retention - c.paid) };
}
