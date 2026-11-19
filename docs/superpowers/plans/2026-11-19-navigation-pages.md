# Page by page (navigation PR 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page fits every screen: lists become cards below 768 px, the attendance grid scrolls in its own box with the worker column fixed, wide screens get a side column on Home and the project Today tab, long names are shortened with "…", and nothing scrolls sideways from 320 px.

**Architecture:** CSS-led. Phone table cards already exist (`.scroll:not(.keep-table)` in `styles.css`, labels from `lib/tableLabels.js`); their breakpoint moves from 639 to 767 and the attendance grid opts out with `keep-table`. Home's alerts panel and the project's live Today panel move to a side column at ≥ 1440 px through CSS grid placement, so the DOM order (and the phone/tablet/laptop stacking) is unchanged.

**Tech Stack:** React 19, CSS.

**Spec:** `docs/superpowers/specs/2026-11-13-navigation-and-responsive-design.md` (Part 3 "Rules for every page", Wide row; build step 6). Starts from `main` (PRs 1–5 merged).

## Global Constraints

- Lists (reports, expenses, materials, team, notifications, admin) become cards below 768 (`max-width: 767px`).
- Wide grids (attendance history with its wage column) scroll inside their own box, first column fixed.
- Wide (≥ 1440): a side column on Home (alerts) and on the project Today tab (today's checklist); text lines don't stretch past a readable width.
- Long project, company and people names end in "…" with the full name on hover (`title`).
- Page headers wrap onto two lines instead of squeezing. No sideways page scroll from 320 px.
- No data, rule or function changes. Commits as `samuel.blebo@yahoo.com`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **640–767 px**: tables are cards, Home projects show the phone cards (not both, not neither).
2. **Attendance history on a phone**: a scrolling grid with the worker column fixed, not one card per worker with 30 day lines.
3. **1440 px with no money (budget off or a viewer without finance)**: alerts sit in the side column with no empty gap; site staff on Today still see their checklist first below 1440.
4. **A 60-character project name** at 320 px: crumb, page title and sidebar don't push the page sideways.
5. **320 px**: no sideways scroll on Home, Projects, a project's five tabs, Site activity, Money, Team, Settings.

---

### Task 1: Tables and grids

**Files:** `apps/web/src/styles.css` (card block and `.pcards-m` block: 639 → 767), `apps/web/src/components/AttendanceHistory.jsx` (`className="scroll keep-table"`).

- [ ] **Step 1:** Make the changes.
- [ ] **Step 2: Run** `pnpm --filter @siteflow/web build` → builds.
- [ ] **Step 3: Commit** `feat(web): list tables as cards below 768; attendance grid keeps scrolling`

### Task 2: Wide-screen side column

**Files:** `apps/web/src/pages/Dashboard.jsx` (`AlertsPanel` gets class `dside`), `apps/web/src/pages/SiteDetail.jsx` (Today wraps overview and live panel in `.today-cols` with `.today-main` / `.today-side`; DOM order unchanged), `apps/web/src/styles.css` (≥ 1440: `.dgrid` adds a 360 px 13th column, `.dside` fills it from row 1, `.dgrid > .c5` spans 12; `.today-cols` two columns, `minmax(0,1fr) 380px`).

- [ ] **Step 1:** Make the changes.
- [ ] **Step 2: Run** `pnpm --filter @siteflow/web build` → builds.
- [ ] **Step 3: Commit** `feat(web): side column on Home and project Today on wide screens`

### Task 3: Names, headers, 320 px

**Files:** whatever the hand check at 320 / 360 / 768 / 1024 / 1440 / 1920 px turns up (crumb and title ellipsis with `title`, header wrapping, overflowing rows).

- [ ] **Step 1:** Hand check every page listed in Review Focus 5 at each width; fix each overflow.
- [ ] **Step 2: Run** `pnpm --filter @siteflow/web build` and `pnpm test` → pass.
- [ ] **Step 3: Commit** `fix(web): long names and headers fit from 320 px`
- [ ] **Step 4:** Push `feat/nav-pages`, open a PR into `main` titled "Page by page (navigation PR 6 of 6)".
