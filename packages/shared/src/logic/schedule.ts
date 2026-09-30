import { BEHIND_GAP_PCT } from '../constants';
import type { Site } from '../types';

// Percentage of the planned timeline that has passed
export function plannedPct(s: Pick<Site, 'planStart' | 'planEnd'>, now: Date = new Date()) {
  if (!s.planStart || !s.planEnd) return null;
  const a = Date.parse(s.planStart), b = Date.parse(s.planEnd);
  return Math.max(0, Math.min(100, Math.round(((now.getTime() - a) / (b - a)) * 100)));
}
export function isBehind(s: Pick<Site, 'planStart' | 'planEnd' | 'progress'>, now?: Date) {
  const p = plannedPct(s, now);
  return p != null && p - (s.progress || 0) >= BEHIND_GAP_PCT;
}
export function weeksBehind(s: Pick<Site, 'planStart' | 'planEnd' | 'progress'>, now?: Date) {
  const p = plannedPct(s, now);
  if (p == null || !s.planStart || !s.planEnd) return 0;
  const totalWeeks = (Date.parse(s.planEnd) - Date.parse(s.planStart)) / (7 * 86400000);
  return Math.max(0, Math.round(((p - (s.progress || 0)) / 100) * totalWeeks));
}
