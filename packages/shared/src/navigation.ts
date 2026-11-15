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
