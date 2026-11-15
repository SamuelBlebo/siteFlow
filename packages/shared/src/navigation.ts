import type { Company, Role } from './types';
import { can } from './permissions';
import { isOn } from './modules';

// Where things live in the web app: the sidebar, the settings and activity tabs, the project tabs and the + New menu.
// The menus read from here, so a role sees the same choices everywhere.
export interface NavContext {
  role: Role | null | undefined;
  company: Pick<Company, 'modules'> | null | undefined;
}

export type NavKey = 'home' | 'projects' | 'activity' | 'money' | 'team';
export interface NavItem { key: NavKey; to: string; label: string }

export function navItems({ role, company }: NavContext): NavItem[] {
  const all = can(role, 'sites.all');
  const items: (NavItem | false)[] = [
    all && { key: 'home', to: '/', label: 'Home' },
    { key: 'projects', to: '/sites', label: all ? 'Projects' : 'My projects' },
    all && { key: 'activity', to: '/reports', label: 'Site activity' },
    can(role, 'finance.view') && isOn(company, 'budget') && { key: 'money', to: '/finance', label: 'Money' },
    can(role, 'team.manage') && { key: 'team', to: '/team', label: 'Team' },
  ];
  return items.filter((i): i is NavItem => !!i);
}

export type SettingsTabKey = 'company' | 'modules' | 'reminders';

export function settingsTabs({ role }: NavContext): { key: SettingsTabKey; to: string; label: string }[] {
  if (!can(role, 'company.settings')) return [];
  return [
    { key: 'company', to: '/company', label: 'Company' },
    { key: 'modules', to: '/modules', label: 'Modules' },
    { key: 'reminders', to: '/reminders', label: 'Reminders' },
  ];
}

export type ActivityTabKey = 'reports' | 'issues';

export function activityTabs({ role }: NavContext): { key: ActivityTabKey; to: string; label: string }[] {
  if (!can(role, 'sites.all')) return [];
  return [
    { key: 'reports', to: '/reports', label: 'Reports' },
    { key: 'issues', to: '/issues', label: 'Issues' },
  ];
}

export type ProjectTabKey = 'today' | 'reports' | 'progress' | 'resources' | 'money';
export type ProjectViewKey = 'reports' | 'photos' | 'programme' | 'issues' | 'materials' | 'labour' | 'drawings' | 'team' | 'settings';
export interface ProjectTab { key: ProjectTabKey; label: string; sections: { key: ProjectViewKey; label: string }[] }

export function projectTabs({ role, company }: NavContext): ProjectTab[] {
  const resources: ProjectTab['sections'] = [];
  if (isOn(company, 'materials')) resources.push({ key: 'materials', label: 'Materials' });
  if (isOn(company, 'labour')) resources.push({ key: 'labour', label: 'Labour' });
  resources.push({ key: 'drawings', label: 'Drawings and 3D model' });
  const tabs: ProjectTab[] = [
    { key: 'today', label: 'Today', sections: [] },
    { key: 'reports', label: 'Reports', sections: [{ key: 'reports', label: 'Daily reports' }, { key: 'photos', label: 'Photos' }] },
    { key: 'progress', label: 'Progress', sections: [{ key: 'programme', label: 'Programme' }, { key: 'issues', label: 'Issues' }] },
    { key: 'resources', label: 'Resources', sections: resources },
  ];
  if (can(role, 'finance.view') && isOn(company, 'budget')) tabs.push({ key: 'money', label: 'Money', sections: [] });
  return tabs;
}

// The ⋯ menu next to Edit project
export function projectMenu({ role }: NavContext): ('team' | 'settings')[] {
  const menu: ('team' | 'settings')[] = [];
  if (can(role, 'team.manage') || can(role, 'sites.manage')) menu.push('team');
  if (can(role, 'sites.manage')) menu.push('settings');
  return menu;
}

// Tabs from before the 5-tab project page: old links in emails and WhatsApp still use these
const OLD_PROJECT_TABS: Record<string, { tab: ProjectTabKey; view: ProjectViewKey | null }> = {
  overview: { tab: 'today', view: null },
  drawing: { tab: 'resources', view: 'drawings' },
  report: { tab: 'reports', view: 'reports' },
  history: { tab: 'reports', view: 'reports' },
  photos: { tab: 'reports', view: 'photos' },
  issues: { tab: 'progress', view: 'issues' },
  materials: { tab: 'resources', view: 'materials' },
  labour: { tab: 'resources', view: 'labour' },
  workers: { tab: 'resources', view: 'labour' },
  budget: { tab: 'money', view: null },
};

// Turns ?tab= and ?view= into what the project page shows. Anything that can't be shown opens Today.
export function resolveProjectAddress(ctx: NavContext, tab: string | null | undefined, view: string | null | undefined): { tab: ProjectTabKey | 'team' | 'settings'; view: ProjectViewKey | null } {
  const today = { tab: 'today' as const, view: null };
  if (!tab) return today;
  const old = Object.prototype.hasOwnProperty.call(OLD_PROJECT_TABS, tab) ? OLD_PROJECT_TABS[tab] : null;
  const asked = old ? old.tab : tab;
  const askedView = old ? old.view : view;
  if (asked === 'team' || asked === 'settings') return projectMenu(ctx).includes(asked) ? { tab: asked, view: null } : today;
  const found = projectTabs(ctx).find((t) => t.key === asked);
  if (!found) return today;
  if (!found.sections.length) return { tab: found.key, view: null };
  const section = found.sections.find((s) => s.key === askedView) || found.sections[0];
  return { tab: found.key, view: section.key };
}
