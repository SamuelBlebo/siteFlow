# Navigation rules (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every navigation rule (sidebar items, Settings and Site activity tabs, project tabs and sections, the ⋯ menu, old-address mapping, ＋ New choices and the project picker) in one pure, tested file. Nothing visible changes.

**Architecture:** One new file, `packages/shared/src/navigation.ts`, with pure functions that take a role and the company's modules and return plain data. They reuse `can()` from `permissions.ts` and `isOn()` from `modules.ts`, and are exported from `packages/shared/src/index.ts`. The web app does not use them yet (PRs 2–4 do).

**Tech Stack:** TypeScript, Vitest (`packages/shared`).

**Spec:** `docs/superpowers/specs/2026-11-13-navigation-and-responsive-design.md` (Part 1, Part 2, Part 4 "Testing" and build step 1).

## Global Constraints

- No Firebase SDK imports in `packages/shared` (package rule).
- Every role sees exactly what it can see today. Permissions come only from `can()` in `packages/shared/src/permissions.ts`; no changes to `PERMISSIONS`.
- Modules that are switched off hide their parts. Use `isOn(company, key)` (it treats `reports` as always on).
- No data model, rule or Cloud Function changes. No web app changes in this PR.
- Closed projects (`status === 'closed'`) never appear in the ＋ New project picker. Use `isSiteOpen()` from `logic/sites.ts`.
- A tab or section that can't be shown falls back to Today, with no error.

## Review Focus

1. **Missing or unknown role** (`null`, `undefined`, a legacy string like `'site'`): every function returns the most restricted result (no menu items except Projects, no ＋ New choices, project falls back to Today). Test in Tasks 1, 2, 3.
2. **Company not loaded yet** (`company` is `null`): treated as "all optional modules off", never throws. Test in Tasks 1, 2, 3.
3. **Old link to a switched-off module** (`?tab=labour` with Labour off, `?tab=budget` for a supervisor): lands on Today, not a blank page. Test in Task 2.
4. **Garbage address values** (`?tab=xyz`, `?view=xyz`, `view` on a tab without sections): unknown tab → Today; unknown view → that tab's first section; Money has no view. Test in Task 2.
5. **＋ New opened on a closed project page**: the closed project is not used; the picker runs over the open projects instead. Test in Task 3.

---

## File structure

- Create: `packages/shared/src/navigation.ts`. All rules in this PR.
- Create: `packages/shared/test/navigation.test.ts`. All tests in this PR.
- Modify: `packages/shared/src/index.ts`. Add `export * from './navigation';` after `export * from './logic/viewAs';`.

Shared input type, defined in Task 1 and used by every function:

```ts
export interface NavContext {
  role: Role | null | undefined;
  company: Pick<Company, 'modules'> | null | undefined;
}
```

Test helper used throughout (put at the top of the test file):

```ts
const ALL_ON = { modules: { materials: true, labour: true, budget: true } };
const ALL_OFF = { modules: {} };
const ctx = (role: Role | null | undefined, company: { modules: object } | null = ALL_ON) => ({ role, company } as NavContext);
```

---

### Task 1: Sidebar, Settings tabs and Site activity tabs

**Files:**
- Create: `packages/shared/src/navigation.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/navigation.test.ts`

**Interfaces:**
- Produces:
  - `NavContext` (above)
  - `type NavKey = 'home' | 'projects' | 'activity' | 'money' | 'team'`
  - `interface NavItem { key: NavKey; to: string; label: string }`
  - `navItems(ctx: NavContext): NavItem[]`: the main menu, in this order
  - `type SettingsTabKey = 'company' | 'modules' | 'reminders'`
  - `settingsTabs(ctx: NavContext): { key: SettingsTabKey; to: string; label: string }[]`
  - `type ActivityTabKey = 'reports' | 'issues'`
  - `activityTabs(ctx: NavContext): { key: ActivityTabKey; to: string; label: string }[]`

Rules (from the spec's Part 1 table and today's `Layout.jsx`):

| key | to | label | shown when |
|---|---|---|---|
| home | `/` | Home | `sites.all` |
| projects | `/sites` | `Projects` if `sites.all`, else `My projects` | always |
| activity | `/reports` | Site activity | `sites.all` |
| money | `/finance` | Money | `finance.view` and Budget on |
| team | `/team` | Team | `team.manage` |

- `settingsTabs`: `company.settings` → `[{company,'/company','Company'}, {modules,'/modules','Modules'}, {reminders,'/reminders','Reminders'}]`; otherwise `[]`. The sidebar shows the Settings link only when this is non-empty.
- `activityTabs`: `sites.all` → `[{reports,'/reports','Reports'}, {issues,'/issues','Issues'}]`; otherwise `[]`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('navItems', () => {
  const keys = (c: NavContext) => navItems(c).map((i) => i.key);
  it('owner with every module on sees everything, in order', () => {
    expect(keys(ctx('owner'))).toEqual(['home', 'projects', 'activity', 'money', 'team']);
    expect(navItems(ctx('owner')).map((i) => i.label)).toEqual(['Home', 'Projects', 'Site activity', 'Money', 'Team']);
  });
  it('per role', () => {
    expect(keys(ctx('admin'))).toEqual(['home', 'projects', 'activity', 'money', 'team']);
    expect(keys(ctx('manager'))).toEqual(['home', 'projects', 'activity', 'money']);
    expect(keys(ctx('finance'))).toEqual(['home', 'projects', 'activity', 'money']);
    expect(keys(ctx('supervisor'))).toEqual(['projects']);
    expect(keys(ctx('viewer'))).toEqual(['projects']);
  });
  it('site staff see "My projects"', () => {
    expect(navItems(ctx('supervisor'))[0]).toEqual({ key: 'projects', to: '/sites', label: 'My projects' });
  });
  it('Money hides when Budget is off', () => {
    expect(keys(ctx('owner', ALL_OFF))).not.toContain('money');
  });
  it('missing role or company never throws and shows the least', () => {
    for (const r of [null, undefined, 'site' as Role]) expect(keys(ctx(r))).toEqual(['projects']);
    expect(keys(ctx('owner', null))).toEqual(['home', 'projects', 'activity', 'team']);
  });
});

describe('settingsTabs', () => {
  it('owner only', () => {
    expect(settingsTabs(ctx('owner')).map((t) => t.to)).toEqual(['/company', '/modules', '/reminders']);
    for (const r of ['admin', 'manager', 'finance', 'supervisor', 'viewer', null] as const) expect(settingsTabs(ctx(r))).toEqual([]);
  });
});

describe('activityTabs', () => {
  it('roles that see every project', () => {
    expect(activityTabs(ctx('finance')).map((t) => t.to)).toEqual(['/reports', '/issues']);
    expect(activityTabs(ctx('supervisor'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `pnpm --filter @siteflow/shared test -- navigation`
Expected: FAIL, `navItems` is not exported.

- [ ] **Step 3: Implement `NavContext`, `navItems`, `settingsTabs`, `activityTabs` in `navigation.ts`, and export the file from `index.ts`**

Start the file with a 2-line comment in the style of `modules.ts`: what it holds, and that the web app's menus read from it.

- [ ] **Step 4: Run the tests and check they pass**

Run: `pnpm --filter @siteflow/shared test -- navigation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/navigation.ts packages/shared/src/index.ts packages/shared/test/navigation.test.ts
git commit -m "feat: shared rules for the sidebar, Settings and Site activity tabs"
```

---

### Task 2: Project tabs, sections, ⋯ menu and old addresses

**Files:**
- Modify: `packages/shared/src/navigation.ts`
- Test: `packages/shared/test/navigation.test.ts`

**Interfaces:**
- Consumes: `NavContext` (Task 1).
- Produces:
  - `type ProjectTabKey = 'today' | 'reports' | 'progress' | 'resources' | 'money'`
  - `type ProjectViewKey = 'reports' | 'photos' | 'programme' | 'issues' | 'materials' | 'labour' | 'drawings' | 'team' | 'settings'`
  - `interface ProjectTab { key: ProjectTabKey; label: string; sections: { key: ProjectViewKey; label: string }[] }`
  - `projectTabs(ctx: NavContext): ProjectTab[]`
  - `projectMenu(ctx: NavContext): ('team' | 'settings')[]`: the ⋯ menu
  - `resolveProjectAddress(ctx: NavContext, tab: string | null | undefined, view: string | null | undefined): { tab: ProjectTabKey | 'team' | 'settings'; view: ProjectViewKey | null }`

Rules (spec Part 1, "Project page" and "Addresses"):

| tab | label | sections (key: label) | shown when |
|---|---|---|---|
| today | Today | none | always |
| reports | Reports | reports: Daily reports · photos: Photos | always |
| progress | Progress | programme: Programme · issues: Issues | always |
| resources | Resources | materials: Materials (Materials on) · labour: Labour (Labour on) · drawings: Drawings and 3D model (always) | always |
| money | Money | none | `finance.view` and Budget on |

- `projectMenu`: `'team'` when `team.manage` or `sites.manage`; `'settings'` when `sites.manage`. Order: team, settings.
- `resolveProjectAddress`:
  1. No `tab` → `{ tab: 'today', view: null }`.
  2. Map old values first: `overview`→today; `drawing`→resources/drawings; `report`, `history`→reports/reports; `photos`→reports/photos; `issues`→progress/issues; `materials`→resources/materials; `labour`, `workers`→resources/labour; `budget`→money. An old value's own view wins over the `view` argument.
  3. `team` / `settings` → `{ tab, view: null }` if in `projectMenu(ctx)`, else Today.
  4. Tab not in `projectTabs(ctx)` → Today.
  5. Tab with sections: `view` if it's one of that tab's shown sections, else the first shown section. Tab without sections → `view: null`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('projectTabs', () => {
  const shape = (c: NavContext) => projectTabs(c).map((t) => [t.key, t.sections.map((s) => s.key)]);
  it('owner with every module on', () => {
    expect(shape(ctx('owner'))).toEqual([
      ['today', []], ['reports', ['reports', 'photos']], ['progress', ['programme', 'issues']],
      ['resources', ['materials', 'labour', 'drawings']], ['money', []],
    ]);
  });
  it('modules off hide their sections; drawings always show; no Money', () => {
    expect(shape(ctx('owner', ALL_OFF))).toEqual([
      ['today', []], ['reports', ['reports', 'photos']], ['progress', ['programme', 'issues']], ['resources', ['drawings']],
    ]);
  });
  it('site staff never get Money', () => {
    for (const r of ['supervisor', 'viewer', null] as const) expect(projectTabs(ctx(r)).map((t) => t.key)).not.toContain('money');
  });
  it('finance gets Money', () => {
    expect(projectTabs(ctx('finance')).map((t) => t.key)).toContain('money');
  });
});

describe('projectMenu', () => {
  it('per role', () => {
    expect(projectMenu(ctx('owner'))).toEqual(['team', 'settings']);
    expect(projectMenu(ctx('manager'))).toEqual(['team', 'settings']);
    for (const r of ['finance', 'supervisor', 'viewer', null] as const) expect(projectMenu(ctx(r))).toEqual([]);
  });
});

describe('resolveProjectAddress', () => {
  const go = (tab: string | null, view: string | null = null, c = ctx('owner')) => resolveProjectAddress(c, tab, view);
  it('opens on Today', () => {
    expect(go(null)).toEqual({ tab: 'today', view: null });
    expect(go('today')).toEqual({ tab: 'today', view: null });
  });
  it.each([
    ['overview', 'today', null], ['drawing', 'resources', 'drawings'],
    ['reports', 'reports', 'reports'], ['report', 'reports', 'reports'], ['history', 'reports', 'reports'],
    ['photos', 'reports', 'photos'], ['progress', 'progress', 'programme'], ['issues', 'progress', 'issues'],
    ['materials', 'resources', 'materials'], ['labour', 'resources', 'labour'], ['workers', 'resources', 'labour'],
    ['budget', 'money', null], ['team', 'team', null], ['settings', 'settings', null],
  ])('old ?tab=%s goes to %s / %s', (old, tab, view) => {
    expect(go(old)).toEqual({ tab, view });
  });
  it('new addresses keep their view', () => {
    expect(go('progress', 'issues')).toEqual({ tab: 'progress', view: 'issues' });
    expect(go('resources', 'labour')).toEqual({ tab: 'resources', view: 'labour' });
  });
  it('garbage falls back, never errors', () => {
    expect(go('xyz')).toEqual({ tab: 'today', view: null });
    expect(go('reports', 'xyz')).toEqual({ tab: 'reports', view: 'reports' });
    expect(go('money', 'photos')).toEqual({ tab: 'money', view: null });
  });
  it('switched-off modules and missing permissions fall back to Today', () => {
    expect(go('labour', null, ctx('owner', ALL_OFF))).toEqual({ tab: 'resources', view: 'drawings' });
    expect(go('budget', null, ctx('supervisor'))).toEqual({ tab: 'today', view: null });
    expect(go('money', null, ctx('owner', null))).toEqual({ tab: 'today', view: null });
    expect(go('settings', null, ctx('supervisor'))).toEqual({ tab: 'today', view: null });
    expect(go('team', null, ctx(null))).toEqual({ tab: 'today', view: null });
  });
});
```

Note on the `labour`-with-Labour-off case: the Resources tab is still shown (Drawings always is), so the address lands on its first shown section, `drawings`. This follows rule 5 and is what the test pins.

- [ ] **Step 2: Run them and check they fail**

Run: `pnpm --filter @siteflow/shared test -- navigation`
Expected: FAIL, `projectTabs` is not exported.

- [ ] **Step 3: Implement `projectTabs`, `projectMenu`, `resolveProjectAddress` in `navigation.ts`**

Keep the old-value map as a `const OLD_PROJECT_TABS: Record<string, { tab: ProjectTabKey; view: ProjectViewKey | null }>` next to the function, with a one-line comment that old links in emails and WhatsApp still use these.

- [ ] **Step 4: Run the tests and check they pass**

Run: `pnpm --filter @siteflow/shared test -- navigation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/navigation.ts packages/shared/test/navigation.test.ts
git commit -m "feat: shared rules for project tabs, sections and old addresses"
```

---

### Task 3: ＋ New choices and the project picker

**Files:**
- Modify: `packages/shared/src/navigation.ts`
- Test: `packages/shared/test/navigation.test.ts`

**Interfaces:**
- Consumes: `NavContext` (Task 1); `isSiteOpen` from `./logic/sites`; `Site` from `./types`.
- Produces:
  - `type NewChoiceKey = 'report' | 'issue' | 'attendance' | 'delivery' | 'expense' | 'project'`
  - `interface NewChoice { key: NewChoiceKey; label: string; needsProject: boolean }`
  - `newChoices(ctx: NavContext): NewChoice[]`
  - `newChoiceHref(key: NewChoiceKey, siteId?: string): string`
  - `pickProject(sites: Pick<Site, 'id' | 'name' | 'status'>[], opts: { currentSiteId?: string | null; pinned?: (siteId: string) => boolean }): { siteId: string } | { choose: string[] }`

Rules (spec Part 2 table):

| key | label | shown when | href |
|---|---|---|---|
| report | Daily report | `site.work` | `/sites/{id}?tab=reports&write=1` |
| issue | Issue | `site.work` | `/sites/{id}?tab=progress&view=issues&new=issue` |
| attendance | Attendance | `site.work` and Labour on | `/sites/{id}?tab=resources&view=labour&new=attendance` |
| delivery | Material delivery | `site.work` and Materials on | `/sites/{id}?tab=resources&view=materials&new=delivery` |
| expense | Expense | `finance.edit` and Budget on | `/sites/{id}?tab=money&new=expense` |
| project | Project | `sites.manage` | `/sites/new` |

- `needsProject` is `true` for all except `project`.
- `pickProject`: only open projects count (`isSiteOpen`).
  1. `currentSiteId` is an open project in `sites` → `{ siteId: currentSiteId }`.
  2. Exactly one open project → `{ siteId }`.
  3. Otherwise → `{ choose: ids }`: open projects, pinned first, then by name (same order as the sidebar in `Layout.jsx`). Zero open projects → `{ choose: [] }`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('newChoices', () => {
  const keys = (c: NavContext) => newChoices(c).map((n) => n.key);
  it('per role, every module on', () => {
    expect(keys(ctx('owner'))).toEqual(['report', 'issue', 'attendance', 'delivery', 'expense', 'project']);
    expect(keys(ctx('manager'))).toEqual(['report', 'issue', 'attendance', 'delivery', 'expense', 'project']);
    expect(keys(ctx('finance'))).toEqual(['expense']);
    expect(keys(ctx('supervisor'))).toEqual(['report', 'issue', 'attendance', 'delivery']);
  });
  it('viewers and unknown roles get nothing, so no ＋ button', () => {
    for (const r of ['viewer', null, undefined, 'site' as Role]) expect(keys(ctx(r))).toEqual([]);
  });
  it('modules off hide their choices', () => {
    expect(keys(ctx('owner', ALL_OFF))).toEqual(['report', 'issue', 'project']);
    expect(keys(ctx('owner', null))).toEqual(['report', 'issue', 'project']);
  });
  it('only Project needs no project', () => {
    expect(newChoices(ctx('owner')).filter((n) => !n.needsProject).map((n) => n.key)).toEqual(['project']);
  });
});

describe('newChoiceHref', () => {
  it.each([
    ['report', '/sites/s1?tab=reports&write=1'],
    ['issue', '/sites/s1?tab=progress&view=issues&new=issue'],
    ['attendance', '/sites/s1?tab=resources&view=labour&new=attendance'],
    ['delivery', '/sites/s1?tab=resources&view=materials&new=delivery'],
    ['expense', '/sites/s1?tab=money&new=expense'],
  ] as const)('%s', (key, href) => expect(newChoiceHref(key, 's1')).toBe(href));
  it('project', () => expect(newChoiceHref('project')).toBe('/sites/new'));
});

describe('pickProject', () => {
  const s = (id: string, name: string, status: Site['status'] = 'active') => ({ id, name, status });
  const sites = [s('b', 'Bravo'), s('a', 'Alpha'), s('c', 'Closed one', 'closed'), s('h', 'Hold', 'on_hold')];
  it('uses the project page you are on', () => {
    expect(pickProject(sites, { currentSiteId: 'h' })).toEqual({ siteId: 'h' });
  });
  it('ignores a closed current project', () => {
    expect(pickProject(sites, { currentSiteId: 'c' })).toEqual({ choose: ['a', 'b', 'h'] });
  });
  it('uses the only open project', () => {
    expect(pickProject([s('a', 'Alpha'), s('c', 'C', 'closed')], {})).toEqual({ siteId: 'a' });
  });
  it('lists open projects, pinned first, then by name', () => {
    expect(pickProject(sites, { pinned: (id) => id === 'h' })).toEqual({ choose: ['h', 'a', 'b'] });
  });
  it('no open projects', () => {
    expect(pickProject([s('c', 'C', 'closed')], {})).toEqual({ choose: [] });
  });
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `pnpm --filter @siteflow/shared test -- navigation`
Expected: FAIL, `newChoices` is not exported.

- [ ] **Step 3: Implement `newChoices`, `newChoiceHref`, `pickProject` in `navigation.ts`**

- [ ] **Step 4: Run the tests and check they pass**

Run: `pnpm --filter @siteflow/shared test -- navigation`
Expected: PASS.

- [ ] **Step 5: Run every existing check**

Run: `pnpm run typecheck` then `pnpm run test:shared`
Expected: both pass with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/navigation.ts packages/shared/test/navigation.test.ts
git commit -m "feat: shared rules for the + New choices and the project picker"
```
