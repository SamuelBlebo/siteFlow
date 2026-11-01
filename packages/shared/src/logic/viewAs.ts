import { PERMISSIONS, assignableRoles, can, isRole, type Permission } from '../permissions';
import type { Role } from '../types';

// View as: an owner or admin previews the app as another role or person. It only ever narrows
// what the screens show; the security rules still apply the real role.

export type ViewAs =
  | { kind: 'role'; role: Role }
  | { kind: 'person'; uid: string; name: string; role: Role; siteIds: string[] };

export const canViewAs = (role: Role | null | undefined) => can(role, 'team.manage');

// The roles a person may preview: the same rule as giving roles (nobody views as the owner)
export const viewAsRoles = (actor: Role | null | undefined): Role[] => (canViewAs(actor) ? assignableRoles(actor) : []);

type Member = { id: string; role?: unknown; active?: boolean; name?: string };
// The people a person may preview: switched-on members with a role they could give, never themselves
export function viewAsPeople<M extends Member>(actor: Role | null | undefined, members: M[], me: string): M[] {
  const roles = viewAsRoles(actor);
  return members
    .filter((m) => m.id !== me && m.active !== false && isRole(m.role) && roles.includes(m.role))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// True when every permission of `narrow` is also one of `wide`'s
export const isNarrower = (narrow: Role, wide: Role) =>
  (Object.keys(PERMISSIONS) as Permission[]).every((p) => !can(narrow, p) || can(wide, p));

// The role a server answer is shaped by: the preview role only when it is narrower than the real one
export const shapedRole = (real: Role, asked: unknown): Role => (isRole(asked) && isNarrower(asked, real) ? asked : real);

// What the screens use while previewing. A preview started in another company, or one the real
// role may not use, is ignored. allSiteIds: every project in the company, for "by role" previews
// of site-scoped roles (so nothing is hidden by accident).
export function applyViewAs<P extends { role: Role; siteIds?: string[]; companyId?: string | null }>(
  profile: P, viewAs: (ViewAs & { cid: string }) | null, allSiteIds: string[],
): { profile: P; previewing: boolean } {
  if (!viewAs || viewAs.cid !== profile.companyId || !viewAsRoles(profile.role).includes(viewAs.role)) return { profile, previewing: false };
  const siteIds = viewAs.kind === 'person' ? viewAs.siteIds : allSiteIds;
  return { profile: { ...profile, role: viewAs.role, siteIds }, previewing: true };
}
