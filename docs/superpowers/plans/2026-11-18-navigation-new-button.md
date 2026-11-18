# "+ New" button (navigation PR 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **＋ New** button in the top bar (laptop and tablet) and a round **＋** in the middle of the phone bottom bar open a menu of what the person can add. Picking one goes to the right project and opens the existing form.

**Architecture:** One `NewMenu` component uses the shared rules from PR 1 (`newChoices`, `pickProject`, `newChoiceHref`). It shows a popover in the top bar and a bottom sheet on phones. The project page reads `?new=` and tells the existing panels to open their forms.

**Tech Stack:** React 19, react-router-dom 7.

**Spec:** `docs/superpowers/specs/2026-11-13-navigation-and-responsive-design.md` (Part 2, build step 4). Stacks on `feat/nav-sidebar` (PR #23).

## Global Constraints

- Choices only from `newChoices({ role, company })`; nothing is shown that the person can't add. No choices → no button.
- Project: the one you're on, else your only open one, else a list of open projects (pinned first) to pick from (`pickProject`). Closed projects never appear.
- The existing forms are reused, opened by `new=`: `issue` (Progress / Issues), `attendance` (Resources / Labour), `delivery` (Resources / Materials, record form with type Delivery), `expense` (Money, the expense form scrolled into view and focused). Daily report keeps `write=1`. Project goes to `/sites/new`.
- Phone: the ＋ sits in the middle of the bottom bar and opens a bottom sheet; it never jumps straight to a form. Site staff's old Report button is replaced by ＋.
- View as: the menu follows the previewed role (it reads `useAuth().role`).
- Commits as `samuel.blebo@yahoo.com`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **＋ New on a closed project page** → the picker over open projects, not the closed one. (Shared test in PR 1; check by hand.)
2. **A viewer** (no choices) → no ＋ anywhere, and the phone bar has no gap.
3. **Issue chosen while already on Progress / Issues** → the form opens (the panel reacts to `new=` changing, not only on first load).
4. **Escape, outside click, and route change** close the menu and the sheet.
5. **Keyboard:** the menu opens from the button, its items are reachable with Tab, and focus returns to the button on close.

---

### Task 1: Panels open their form from `new=`

**Files:**
- Modify: `apps/web/src/components/SiteIssues.jsx` (prop `startOpen`), `apps/web/src/components/MaterialsPanel.jsx` (prop `startRecord` → view `record`), `apps/web/src/components/MaterialLogForm.jsx` (prop `startType`, default `'usage'`), `apps/web/src/components/BudgetPanel.jsx` (prop `focusExpense` → `ExpenseForm` scrolls into view and focuses its first field), `apps/web/src/components/LabourPanel.jsx` (prop `focusAttendance` → scrolls the attendance sheet into view), `apps/web/src/pages/SiteDetail.jsx` (read `params.get('new')` and pass the props; key the panels on `new` so a fresh `new=` reopens the form).

- [ ] **Step 1:** Make the changes; each prop only acts when the person may use the form (`canReport`, `canWork`, `finance.edit`).
- [ ] **Step 2: Run** `pnpm --filter @siteflow/web build` → builds.
- [ ] **Step 3: Commit** `feat(web): project panels open their form from new=`

### Task 2: The ＋ New menu

**Files:**
- Create: `apps/web/src/components/NewMenu.jsx`: `NewMenu({ variant: 'top' | 'bar' })`. Loads open projects (all-sites roles: `sitesCol`; others: `useDocsByIds(siteDoc, profile.siteIds)`), the company doc, pins (`usePins`), and the current project from the path (`/sites/:sid`). Step 1 lists the choices; choosing one either navigates (`newChoiceHref`) or shows step 2, the project list. `top` renders a popover (`.upanel` style, `role="menu"`); `bar` renders the round ＋ and a bottom sheet (`.bsheet` style, `role="dialog"`). Closes on Escape, outside click and route change; focus returns to the button.
- Modify: `apps/web/src/components/TopBar.jsx` (add `<NewMenu variant="top" />` before the user menu; hidden at ≤ 860 px where the bottom bar shows), `apps/web/src/components/BottomNav.jsx` (remove the Report link; put `<NewMenu variant="bar" />` in the middle of the bar), `apps/web/src/styles.css` (`.new-btn`, `.bnav .new-fab` round accent button, `.new-top` hidden ≤ 860 px).

- [ ] **Step 1:** Make the changes.
- [ ] **Step 2: Run** `pnpm --filter @siteflow/web build` → builds.
- [ ] **Step 3: Commit** `feat(web): + New in the top bar and the phone bottom bar`

### Task 3: Check and PR

- [ ] **Step 1: Run** `pnpm test` → all PASS.
- [ ] **Step 2: Hand check** against the emulators as owner: each choice from Home (picker), from a project page (no picker), Issue while on Issues, phone frame at 375 px (＋ in the middle, sheet, no sideways scroll), the Review Focus items.
- [ ] **Step 3:** Push `feat/nav-new-button`, open a PR into `feat/nav-sidebar` titled "+ New button (navigation PR 4 of 6)" with the check list and the Claude Code attribution line.
