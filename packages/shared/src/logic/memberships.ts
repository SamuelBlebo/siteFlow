import type { Role, Site } from '../types';
import { ROLE_LABELS, isSiteScoped } from '../permissions';
import { isSiteOpen } from './sites';

// One line per company on the Account page: your role there, whether you can open it, and the projects you cover.
export function membershipSummary(
  m: { role: Role; active?: boolean; siteIds?: string[] },
  sites: Pick<Site, 'id' | 'name' | 'status'>[],
  company: { suspended?: unknown } | null,
): { roleLabel: string; state: 'ok' | 'off' | 'paused'; projects: string } {
  const state = m.active === false ? 'off' : company?.suspended ? 'paused' : 'ok';
  const roleLabel = ROLE_LABELS[m.role] || m.role;
  if (!isSiteScoped(m.role)) return { roleLabel, state, projects: sites.length ? `All projects (${sites.length})` : 'No projects yet' };
  const mine = sites.filter((s) => (m.siteIds || []).includes(s.id));
  if (!mine.length) return { roleLabel, state, projects: 'No projects yet' };
  const order = [...mine.filter(isSiteOpen), ...mine.filter((s) => !isSiteOpen(s))].map((s) => s.name);
  const shown = order.slice(0, 5).join(', ');
  return { roleLabel, state, projects: order.length > 5 ? `${shown} and ${order.length - 5} more` : shown };
}
