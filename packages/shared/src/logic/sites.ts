import { WORK_TYPES, type WorkType } from '../constants';
import { isSiteScoped } from '../permissions';
import type { Role, Site, SiteStatus, UserProfile } from '../types';

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = { active: 'Active', on_hold: 'On hold', closed: 'Closed' };
export const SITE_STATUSES: SiteStatus[] = ['active', 'on_hold', 'closed'];

// Closed sites are read-only for daily site work (the rules enforce this too)
export const isSiteOpen = (s: Pick<Site, 'status'> | null | undefined) => !!s && s.status !== 'closed';

// Site details as stored in Firestore: empty optional fields become null, client details are grouped
export function siteFields(d: {
  name: string; location: string; stage: string; foremanName?: string; foremanPhone?: string; foremanEmail?: string;
  planStart?: string; planEnd?: string; clientName?: string; clientPhone?: string; clientEmail?: string;
}) {
  return {
    name: d.name, location: d.location, stage: d.stage,
    foremanName: d.foremanName || '', foremanPhone: d.foremanPhone || '', foremanEmail: d.foremanEmail || '',
    planStart: d.planStart || null, planEnd: d.planEnd || null,
    client: d.clientName ? { name: d.clientName, phone: d.clientPhone || '', email: d.clientEmail || '' } : null,
  };
}

// The form values for editing a stored site
export function siteFormValues(s: Partial<Site>) {
  return {
    name: s.name || '', location: s.location || '', stage: s.stage || '',
    foremanName: s.foremanName || '', foremanPhone: s.foremanPhone || '', foremanEmail: s.foremanEmail || '',
    planStart: s.planStart || '', planEnd: s.planEnd || '',
    clientName: s.client?.name || '', clientPhone: s.client?.phone || '', clientEmail: s.client?.email || '',
  };
}

// Who can see a site: everyone with an all-sites role, plus site-scoped people assigned to it
export function siteTeam<T extends Pick<UserProfile, 'role' | 'siteIds' | 'active'>>(members: T[], sid: string) {
  const on = members.filter((m) => m.active !== false);
  return {
    allSites: on.filter((m) => !isSiteScoped(m.role as Role)),
    assigned: on.filter((m) => isSiteScoped(m.role as Role) && m.siteIds?.includes(sid)),
    available: on.filter((m) => isSiteScoped(m.role as Role) && !m.siteIds?.includes(sid)),
  };
}

// Stages: the usual list for a kind of work, and the kind of work a stage most likely belongs to
// (the first list that has it; a typed-in stage counts as "other")
export const stagesFor = (type: WorkType | string): readonly string[] => WORK_TYPES.find((w) => w.key === type)?.stages ?? [];
export const workTypeOf = (stage: string | null | undefined): WorkType =>
  WORK_TYPES.find((w) => (w.stages as readonly string[]).includes(stage || ''))?.key ?? (stage ? 'other' : 'building');

// ---------- which days need a daily report ----------
// Each project has working days (Monday to Saturday unless changed) and can skip single days
// (a public holiday, heavy rain, no work on site). Only active projects on a working day that
// was not skipped need a report; everything that chases or counts reports uses this.
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6]; // 0 = Sunday
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const SKIP_KEEP_DAYS = 120; // skipped days older than this are dropped from the list
export const SKIP_MAX = 200;
export type ReportDay = 'sent' | 'due' | 'skipped' | 'day_off' | 'not_active';

type DaySite = { status?: string; lastReportDate?: string | null; workDays?: number[] | null; skipDates?: string[] | null };
export const workDaysOf = (s: DaySite) => (Array.isArray(s.workDays) && s.workDays.length ? s.workDays : DEFAULT_WORK_DAYS);
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

// Whether the project should send a report on a date (YYYY-MM-DD)
export function reportDue(s: DaySite, date: string) {
  return s.status === 'active' && workDaysOf(s).includes(weekdayOf(date)) && !(s.skipDates || []).includes(date);
}
// What a date looks like for the project: sent, still due, skipped, a day off, or not expected at all
export function reportDay(s: DaySite, date: string): ReportDay {
  if (s.lastReportDate === date) return 'sent';
  if (s.status !== 'active') return 'not_active';
  if ((s.skipDates || []).includes(date)) return 'skipped';
  if (!workDaysOf(s).includes(weekdayOf(date))) return 'day_off';
  return 'due';
}
export const REPORT_DAY_LABELS: Record<ReportDay, string> = {
  sent: 'Report sent', due: 'Report missing', skipped: 'No report needed today', day_off: 'Day off: no report needed', not_active: 'No report expected',
};
// The list after skipping (or un-skipping) a date: sorted, without old dates, never too long
export function withSkip(list: string[] | null | undefined, date: string, skip: boolean, today: string) {
  const oldest = new Date(`${today}T00:00:00Z`);
  oldest.setUTCDate(oldest.getUTCDate() - SKIP_KEEP_DAYS);
  const cut = oldest.toISOString().slice(0, 10);
  const set = new Set((list || []).filter((d) => d >= cut));
  if (skip) set.add(date); else set.delete(date);
  return [...set].sort().slice(-SKIP_MAX);
}
