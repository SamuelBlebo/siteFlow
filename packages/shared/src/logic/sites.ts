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
