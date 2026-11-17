# Project page: 5 tabs (navigation PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The project page shows 5 tabs (Today, Reports, Progress, Resources, Money) with sections inside, Team and Settings in a ⋯ menu, and every old address still lands in the right place.

**Architecture:** `SiteDetail.jsx` stops building its own tab list and asks the shared rules from PR 1 (`projectTabs`, `projectMenu`, `resolveProjectAddress` in `packages/shared/src/navigation.ts`). A small section switch (the existing `Tabs` component in a compact style) sits at the top of tabs that have sections. Internal links move to the new `?tab=&view=` form.

**Tech Stack:** React 19, react-router-dom 7, Vitest (`packages/shared`).

**Spec:** `docs/superpowers/specs/2026-11-13-navigation-and-responsive-design.md` (Part 1 "Project page" and "Addresses", build step 2). Builds on branch `feat/navigation-responsive` (PR #20).

## Global Constraints

- Every role sees exactly what it sees today; modules that are off hide their parts. Visibility comes only from `projectTabs` / `projectMenu`.
- No data, rule or Cloud Function changes.
- Old links keep working (`OLD_PROJECT_TABS` + `resolveProjectAddress`). `write=1`, `request=1`, `edit=1`, `sheet=`, `pin=` keep working.
- Every project opens on **Today**. Site staff (`site.work` and site-scoped) see Live today first, then the overview; others see the AI project overview and key facts.
- Section labels exactly as in `projectTabs`: Daily reports · Photos; Programme · Issues; Materials · Labour · Drawings and 3D model.
- Commits as `samuel.blebo@yahoo.com`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **An old drawing link** `?tab=overview&sheet=X&pin=Y` (from IssueDetail and old emails) → opens Resources / Drawings with that sheet and pin, not Today. (Test in Task 1.)
2. **A supervisor opening `?tab=budget` or `?tab=settings`** → Today, no error. (Covered by PR 1 tests; check by hand in Task 3.)
3. **The Today checklist buttons** (Mark attendance, Log materials, Send daily report) → open the right tab and section; Send opens the form. (Check by hand in Task 3.)
4. **Labour switched off with `?tab=resources&view=labour`** → Today. (PR 1 test.)
5. **Narrow phone width (360 px)**: 5 tabs plus the section switch don't push the page sideways. (Check by hand in Task 3.)

---

### Task 1: Drawing links survive the move

**Files:**
- Modify: `packages/shared/src/navigation.ts` (`resolveProjectAddress`)
- Test: `packages/shared/test/navigation.test.ts`

**Interfaces:**
- Changes: `resolveProjectAddress(ctx, tab, view, extra?: { sheet?: string | null; pin?: string | null })`. When `tab` is `overview` or `today` and `extra.sheet` or `extra.pin` is set, it returns `{ tab: 'resources', view: 'drawings' }`.

- [ ] **Step 1: Write the failing tests:** `resolveProjectAddress(manager, 'overview', null, { sheet: 'd1' })` → `{ tab: 'resources', view: 'drawings' }`; same with `{ pin: 'i1' }`; `'overview'` with no extra → Today (unchanged).
- [ ] **Step 2: Run** `pnpm run test:shared -- navigation` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm run test:shared` → PASS.
- [ ] **Step 5: Commit** `feat: old drawing links open Resources, Drawings`

### Task 2: Project page on the shared rules

**Files:**
- Modify: `apps/web/src/pages/SiteDetail.jsx`, `apps/web/src/components/Tabs.jsx` (optional `variant="sub"` prop adding class `tabs sub`), `apps/web/src/styles.css` (`.tabs.sub`: smaller, pill-style segmented switch that wraps on phones; `.more-menu` for ⋯)

What changes in `SiteDetail.jsx`:
- Replace `OLD_TABS`, `asked`, `tab` and the hand-built `tabs` list with `const { tab, view } = resolveProjectAddress({ role, company }, params.get('tab'), params.get('view'), { sheet: params.get('sheet'), pin: params.get('pin') })` and `projectTabs({ role, company })`. Wait for `company` before resolving (show `<Loading />` while it loads), so module checks don't send people to Today by mistake.
- `go(tab, view?, extra?)` replaces `setTab`: sets `tab`, `view` and any extra (`write: '1'`), `replace: true`. `TodayPanel`'s `onGo(oldTabKey, write)` still passes old keys (`labour`, `materials`, `reports`); map them through `resolveProjectAddress` inside `go`.
- Tab bodies:
  - **today**: site staff (`can('site.work') && isSiteScoped(role)`): `AiOverview kind="today"` + `TodayPanel`, then `AiOverview kind="project"` + `OverviewTab`. Others: `AiOverview kind="project"` + `OverviewTab`, and if `can('site.work')`, the `TodayPanel` below it.
  - **reports**: view `reports` = today's report form, requests and history (as now); view `photos` = `SitePhotos`.
  - **progress**: view `programme` = `ProgressPanel`; view `issues` = `SiteIssues`.
  - **resources**: `materials` = `MaterialsPanel`; `labour` = `LabourPanel`; `drawings` = `ProjectDrawing` + `ModelCard`.
  - **money**: `BudgetPanel`.
  - **team** / **settings**: as now (reached from ⋯).
- Section switch: `<Tabs variant="sub" value={view} onChange={(v) => go(tab, v)} tabs={sections.map(s => [s.key, s.label])} label="{tab label} sections">` inside the main tab panel, only when the tab has more than one section.
- Header `.dtop`: keep "Edit project" and `ReportButton`; add a ⋯ button (`aria-haspopup="menu"`, `aria-label="More project options"`) when `projectMenu(...)` is non-empty, opening a small menu with **Team** and **Settings** links (`?tab=team`, `?tab=settings`). Close on outside click and Escape, following `TopBar.jsx`'s user menu.
- When the page is showing Team or Settings, the main tab bar shows no tab selected and a "← Back to project" link above the content goes to Today.

- [ ] **Step 1:** Make the changes above.
- [ ] **Step 2: Run** `pnpm --filter @siteflow/web build` → builds with no errors; `pnpm --filter @siteflow/web lint` if the script exists → no new warnings.
- [ ] **Step 3: Commit** `feat(web): project page with 5 tabs, sections and the ⋯ menu`

### Task 3: Links use the new addresses, and a hand check

**Files:**
- Modify: `apps/web/src/components/AlertsPanel.jsx`, `Dashboard.jsx`, `Finance.jsx`, `GettingStarted.jsx`, `IssueDetail.jsx`, `ProjectDrawing.jsx`, `ReportDetail.jsx`, `Reports.jsx`, `BottomNav.jsx` (any `?tab=` link), and `packages/shared/src/logic/alerts.ts` only if alert `tab` values are passed straight into links (they resolve through old keys anyway, so change them only if it reads clearer).

New forms: issues → `?tab=progress&view=issues`; materials → `?tab=resources&view=materials`; budget → `?tab=money`; progress → `?tab=progress&view=programme`; photos → `?tab=reports&view=photos`; drawing pin → `?tab=resources&view=drawings&sheet=…&pin=…`. `?tab=reports&write=1` and `?tab=reports&request=1` stay.

- [ ] **Step 1:** Update the links.
- [ ] **Step 2: Run** `pnpm run test:shared && pnpm --filter @siteflow/web build` → PASS / builds.
- [ ] **Step 3: Hand check** against the emulators with sample projects, as an owner and as a supervisor (View as), at 360, 768 and 1280 px: each of the 5 tabs and every section opens; ⋯ → Team and Settings; Edit project opens Settings in edit mode; the Today checklist buttons; the 5 Review Focus items; no sideways scroll at 360. Take screenshots for the PR.
- [ ] **Step 4: Commit** `feat(web): links open the new project tabs`

### Task 4: PR

- [ ] **Step 1: Run** `pnpm test` → all PASS.
- [ ] **Step 2:** Push `feat/nav-project-page` and open a PR into `feat/navigation-responsive` (it stacks on PR #20) titled "Project page: 5 tabs (navigation PR 2 of 6)", with the screenshots and the Claude Code attribution line. The owner merges.
