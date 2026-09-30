import type { Role } from './types';

// Roles, from most to least access.
//   owner       the company account holder. Everything, including company settings.
//   admin       runs the office. Everything except company settings; manages the team.
//   manager     project manager. All sites, site setup, budgets and costs.
//   finance     accountant. All sites (read), budgets, expenses, wages.
//   supervisor  site manager, supervisor or foreman. Assigned sites only; daily site work, no money.
//   viewer      read-only access to assigned sites, no money.
export const ROLES: Role[] = ['owner', 'admin', 'manager', 'finance', 'supervisor', 'viewer'];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Project manager',
  finance: 'Accounts / finance',
  supervisor: 'Site supervisor',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full access, including company settings.',
  admin: 'Full access to sites and team. Cannot change company settings.',
  manager: 'All sites, site setup, budgets and costs.',
  finance: 'All sites, budgets, expenses and wages.',
  supervisor: 'Assigned sites only. Reports, attendance and materials. No money figures.',
  viewer: 'Assigned sites only, read-only. No money figures.',
};

export type Permission =
  | 'company.settings'   // company name, notification rules
  | 'team.manage'        // invite, change roles, assign sites
  | 'sites.all'          // see every site in the company (others see only siteIds)
  | 'sites.manage'       // create, edit, close sites; set budgets; set up materials
  | 'site.work'          // daily reports, attendance, material logs, add workers
  | 'finance.view'       // budgets, spending, expenses, wage rates and totals
  | 'finance.edit'       // record expenses, delivery costs, wage rates
  | 'audit.view';        // activity log

// Keep in sync with the role lists in firebase/firestore.rules and storage.rules.
// firebase/tests checks the rules against this table.
export const PERMISSIONS: Record<Permission, Role[]> = {
  'company.settings': ['owner'],
  'team.manage': ['owner', 'admin'],
  'sites.all': ['owner', 'admin', 'manager', 'finance'],
  'sites.manage': ['owner', 'admin', 'manager'],
  'site.work': ['owner', 'admin', 'manager', 'supervisor'],
  'finance.view': ['owner', 'admin', 'manager', 'finance'],
  'finance.edit': ['owner', 'admin', 'manager', 'finance'],
  'audit.view': ['owner', 'admin'],
};

export const isRole = (r: unknown): r is Role => typeof r === 'string' && (ROLES as string[]).includes(r);

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && PERMISSIONS[permission].includes(role);
}

// Roles that only see the sites listed in their profile's siteIds
export const isSiteScoped = (role: Role | null | undefined) => !!role && !can(role, 'sites.all');

// Which roles a team manager may give to someone. Nobody can create another owner,
// and only the owner can create or change admins.
export function assignableRoles(actor: Role | null | undefined): Role[] {
  if (actor === 'owner') return ['admin', 'manager', 'finance', 'supervisor', 'viewer'];
  if (actor === 'admin') return ['manager', 'finance', 'supervisor', 'viewer'];
  return [];
}

export function canChangeMember(actor: Role | null | undefined, current: Role, next: Role): boolean {
  const allowed = assignableRoles(actor);
  return allowed.includes(current) && allowed.includes(next);
}

export function canAccessSite(profile: { role: Role; siteIds?: string[] } | null | undefined, siteId: string): boolean {
  if (!profile) return false;
  return can(profile.role, 'sites.all') || !!profile.siteIds?.includes(siteId);
}
