# Sidebar, Site activity and Settings (navigation PR 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The sidebar and the phone More sheet show Home, Projects, Site activity, Money, Team, and one Settings link at the bottom. Site activity is one page with Reports and Issues tabs; Settings is one page with Company, Modules and Reminders tabs. Every old address still works.

**Architecture:** `Layout.jsx` builds its menu from `navItems` and `settingsTabs` (shared, PR 1). A small `SectionTabs` component draws a row of tab links above a page; `App.jsx` wraps the Reports/Issues and Company/Modules/Reminders routes with it. A new shared helper says which menu item a path belongs to, so "Site activity" and "Settings" stay highlighted on every page they cover.

**Tech Stack:** React 19, react-router-dom 7, Vitest (`packages/shared`).

**Spec:** `docs/superpowers/specs/2026-11-13-navigation-and-responsive-design.md` (Part 1 "Sidebar (laptop) and the More sheet (phone)", build step 3). Stacks on `feat/nav-project-page` (PR #22).

## Global Constraints

- Every role sees exactly what it sees today. Visibility comes only from `navItems`, `settingsTabs`, `activityTabs`; route guards in `App.jsx` are unchanged.
- `/reports`, `/issues`, `/company`, `/modules`, `/reminders` all stay and open their tab. No redirects.
- Labels exactly: Home, Projects / My projects, Site activity, Money, Team, Settings; tabs Reports, Issues; Company, Modules, Reminders.
- Unchanged: the project list under the menu (pinned first, red dot), the company switcher, the account link. Site staff keep My projects, their projects and Account (the phone Report button stays until PR 4's ＋ New).
- No data, rule or Cloud Function changes.
- Commits as `samuel.blebo@yahoo.com`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Detail pages under a section** (`/reports/:sid/:rid`, `/issues/:sid/:id`) → Site activity stays highlighted in the sidebar. (Test in Task 1.)
2. **A finance user** (`sites.all`, no `company.settings`, no `team.manage`) → sees Home, Projects, Site activity, Money; no Settings link. (PR 1 tests cover `navItems`; check by hand in Task 3.)
3. **Budget module off** → no Money item, `/finance` guard unchanged. (PR 1 test.)
4. **Phone bottom bar** for an owner → Home, Projects, Activity, More; More sheet lists Money, Team, Settings, Account and the projects. (Check by hand in Task 3.)
5. **`/`, `/sites`, `/sites/:sid`** → only their own item is highlighted, not Site activity or Settings. (Test in Task 1.)

---

### Task 1: Which menu item a page belongs to

**Files:**
- Modify: `packages/shared/src/navigation.ts`
- Test: `packages/shared/test/navigation.test.ts`

**Interfaces:**
- Produces: `navSection(pathname: string): NavKey | 'settings' | null`. `/` → `home`; `/sites`, `/sites/new`, `/sites/:sid` → `projects`; `/reports…`, `/issues…` → `activity`; `/finance…` → `money`; `/team…` → `team`; `/company`, `/modules`, `/reminders` → `settings`; anything else (`/account`, `/photo-credits`) → `null`.

- [ ] **Step 1: Write the failing test** `navSection` with each path above, including `/reports/s1/r1`, `/issues/s1/i1`, `/sites/s1`, `/reportsx` (→ `null`).
- [ ] **Step 2: Run** `pnpm run test:shared -- navigation` → FAIL (not exported).
- [ ] **Step 3: Implement** with a match on the first path segment.
- [ ] **Step 4: Run** `pnpm run test:shared` → PASS.
- [ ] **Step 5: Commit** `feat: which menu item a page belongs to`

### Task 2: Sidebar, More sheet and the two tabbed pages

**Files:**
- Create: `apps/web/src/components/SectionTabs.jsx`: `SectionTabs({ tabs, label })`, where `tabs` is `{ key, to, label }[]`. It renders `<nav className="tabs section-tabs" aria-label={label}>` of `NavLink`s (`aria-current="page"` on the active one, styled like `.tabs button[aria-selected=true]`), then `<Outlet />`. Renders nothing above the outlet when `tabs.length < 2`.
- Modify: `apps/web/src/App.jsx`: wrap `reports`, `issues` in a layout route `<Route element={<ActivityTabs />}>` and `company`, `modules`, `reminders` in `<Route element={<SettingsTabs />}>`, keeping each route's existing `Guard`. `ActivityTabs` and `SettingsTabs` are small components in `SectionTabs.jsx` that call `activityTabs` / `settingsTabs` with `{ role, company }` from `useAuth` and the company doc.
- Modify: `apps/web/src/components/Layout.jsx`: menu from `navItems({ role, company })` with icons `{ home: 'dashboard', projects: 'projects', activity: 'reports', money: 'finance', team: 'team' }`, phone bar on `home`, `projects`, `activity` (short labels Home, Projects, Activity). One group with no headings, then Projects, then a single **Settings** link (icon `modules`, to `/company`) when `settingsTabs(...)` is non-empty. Highlight with `className={({ isActive }) => …}` using `navSection(pathname) === item.key` so detail pages keep their item lit.
- Modify: `apps/web/src/components/BottomNav.jsx`: the More sheet lists the non-bar items plus Settings, then Account, then projects. Same highlight rule.
- Modify: `apps/web/src/styles.css`: `.section-tabs a` matching `.tabs button`, `a[aria-current="page"]` matching the selected style; `.section-tabs` margin to sit above the page head.

- [ ] **Step 1:** Make the changes.
- [ ] **Step 2: Run** `pnpm --filter @siteflow/web build` → builds.
- [ ] **Step 3: Commit** `feat(web): simpler sidebar, Site activity and Settings pages with tabs`

### Task 3: Hand check and PR

- [ ] **Step 1: Run** `pnpm test` → all PASS.
- [ ] **Step 2: Hand check** against the emulators with sample projects as owner, then View as Finance and Site supervisor: sidebar items and highlight on `/`, `/sites/:sid`, `/reports`, a report detail, `/issues`, `/company`, `/modules`, `/reminders`; the tab rows switch pages; phone width (375 px frame) bottom bar and More sheet; Review Focus items.
- [ ] **Step 3:** Push `feat/nav-sidebar`, open a PR into `feat/nav-project-page` titled "Sidebar, Site activity and Settings (navigation PR 3 of 6)" with the check list and the Claude Code attribution line.
