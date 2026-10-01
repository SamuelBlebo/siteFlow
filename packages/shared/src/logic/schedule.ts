import { plannedProgress, scheduleStatus } from './progress';
import type { Site } from '../types';

// Site-level shortcuts (no milestones). For milestones, use scheduleStatus in progress.ts.
export { plannedPct } from './progress';
export const isBehind = (s: Pick<Site, 'planStart' | 'planEnd' | 'progress'>, now?: Date) => scheduleStatus(s, [], now).state === 'behind';
export const weeksBehind = (s: Pick<Site, 'planStart' | 'planEnd' | 'progress'>, now?: Date) => scheduleStatus(s, [], now).weeksBehind;
export { plannedProgress };
