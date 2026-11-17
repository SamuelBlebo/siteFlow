import type { Company, Role, Site } from './types';
import { can } from './permissions';
import { isOn } from './modules';
import { isSiteOpen } from './logic/sites';

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
// A sheet or pin on the overview is an old drawing link (issue pins, emails): drawings now live under Resources.
export function resolveProjectAddress(
  ctx: NavContext, tab: string | null | undefined, view: string | null | undefined,
  extra: { sheet?: string | null; pin?: string | null } = {},
): { tab: ProjectTabKey | 'team' | 'settings'; view: ProjectViewKey | null } {
  const today = { tab: 'today' as const, view: null };
  if (!tab) return today;
  if ((tab === 'overview' || tab === 'today') && (extra.sheet || extra.pin)) return { tab: 'resources', view: 'drawings' };
  const old = Object.prototype.hasOwnProperty.call(OLD_PROJECT_TABS, tab) ? OLD_PROJECT_TABS[tab] : null;
  const asked = old ? old.tab : tab;
  const askedView = old ? old.view : view;
  if (asked === 'team' || asked === 'settings') return projectMenu(ctx).includes(asked) ? { tab: asked, view: null } : today;
  const found = projectTabs(ctx).find((t) => t.key === asked);
  if (!found) return today;
  if (!found.sections.length) return { tab: found.key, view: null };
  const section = found.sections.find((s) => s.key === askedView);
  // A section whose module is off opens Today; an unknown view opens the tab's first section
  if (!section && found.key === 'resources' && (askedView === 'materials' || askedView === 'labour')) return today;
  return { tab: found.key, view: (section || found.sections[0]).key };
}

export type NewChoiceKey = 'report' | 'issue' | 'attendance' | 'delivery' | 'expense' | 'project';
export interface NewChoice { key: NewChoiceKey; label: string; needsProject: boolean }

// The + New menu: only what the person can add, with its module on
export function newChoices({ role, company }: NavContext): NewChoice[] {
  const work = can(role, 'site.work');
  const choices: (NewChoice | false)[] = [
    work && { key: 'report', label: 'Daily report', needsProject: true },
    work && { key: 'issue', label: 'Issue', needsProject: true },
    work && isOn(company, 'labour') && { key: 'attendance', label: 'Attendance', needsProject: true },
    work && isOn(company, 'materials') && { key: 'delivery', label: 'Material delivery', needsProject: true },
    can(role, 'finance.edit') && isOn(company, 'budget') && { key: 'expense', label: 'Expense', needsProject: true },
    can(role, 'sites.manage') && { key: 'project', label: 'Project', needsProject: false },
  ];
  return choices.filter((c): c is NewChoice => !!c);
}

const NEW_CHOICE_QUERY: Record<Exclude<NewChoiceKey, 'project'>, string> = {
  report: 'tab=reports&write=1',
  issue: 'tab=progress&view=issues&new=issue',
  attendance: 'tab=resources&view=labour&new=attendance',
  delivery: 'tab=resources&view=materials&new=delivery',
  expense: 'tab=money&new=expense',
};

export function newChoiceHref(key: NewChoiceKey, siteId?: string): string {
  return key === 'project' ? '/sites/new' : `/sites/${siteId}?${NEW_CHOICE_QUERY[key]}`;
}

// Which project a + New choice goes to: the one you're on, your only open one, or a list to pick from.
// Closed projects can't take new records, so they never count.
export function pickProject(
  sites: Pick<Site, 'id' | 'name' | 'status'>[],
  { currentSiteId, pinned = () => false }: { currentSiteId?: string | null; pinned?: (siteId: string) => boolean },
): { siteId: string } | { choose: string[] } {
  const open = sites.filter(isSiteOpen);
  if (currentSiteId && open.some((s) => s.id === currentSiteId)) return { siteId: currentSiteId };
  if (open.length === 1) return { siteId: open[0].id };
  const order = [...open].sort((a, b) => (Number(pinned(b.id)) - Number(pinned(a.id))) || a.name.localeCompare(b.name));
  return { choose: order.map((s) => s.id) };
}
