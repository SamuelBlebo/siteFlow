# Four screen sizes in the shell (navigation PR 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app shell uses four screen sizes. Phones get the bottom bar, tablets get an icon-only sidebar that a button expands, laptops get a full sidebar that can be folded to icons (remembered on the device), and wide screens get the full sidebar. The stylesheet's scattered widths are brought into line with these four.

**Architecture:** `Layout.jsx` gains a fold button and two classes on `.shell`: `side-icons` (laptop, folded by choice, saved in `localStorage`) and `side-open` (tablet, expanded for now, not saved). CSS draws the icon-only sidebar for `side-icons` and for every tablet without `side-open`. Menu labels are wrapped in a span so icon mode can hide them; each link carries `title` so the name shows on hover. Media queries are rewritten to the four sizes.

**Tech Stack:** React 19, CSS.

**Spec:** `docs/superpowers/specs/2026-11-13-navigation-and-responsive-design.md` (Part 3 "screen sizes", build step 5). Stacks on `feat/nav-new-button` (PR #24).

## Global Constraints

- Sizes: Phone `< 640` (`max-width: 639px`), Tablet `640–1023` (`min-width: 640px) and (max-width: 1023px)`), Laptop `1024–1439`, Wide `≥ 1440`.
- Phone: bottom bar with ＋ (as now, but switching at 639 px instead of 860 px).
- Tablet: icon-only sidebar; names on hover; a button expands it over the page; route change, Escape or a click outside folds it again.
- Laptop: full sidebar with a fold button; the choice is stored in `localStorage` key `sf.sideIcons` inside try/catch, default expanded. Wide: full sidebar (the fold button still works).
- No sideways page scroll at any width from 320 px. Touch targets stay ≥ 44 px on `pointer: coarse`.
- Breakpoint mapping: `380` stays (a landing-page phone-only tweak); `560`, `640`, `700`, `760` → `639`; `860` → `639` for the shell, bottom bar, top bar and admin; `860` → `1023` for the setup wizard (`.wgrid`); `960`, `1100` → `1023`; `1400` → `1439`.
- No data, rule or function changes. Commits as `samuel.blebo@yahoo.com`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **640–860 px** (old phone layout, now tablet): sidebar icons, no bottom bar, no ＋ hidden on both (top-bar ＋ must show).
2. **Tablet expanded** then navigate → folds; Escape folds; focus stays sensible.
3. **Private window / storage blocked** → the fold button still works for the session, no crash.
4. **Folded on laptop**: active item still visible (icon highlight), red "report missing" dots not lost entirely (the project list is hidden in icon mode; the ＋/Projects page still reach them).
5. **320 px**: no sideways scroll on Home, Projects, a project page.

---

### Task 1: The fold button and icon-only sidebar

**Files:**
- Modify: `apps/web/src/components/Layout.jsx` (state `icons` from `localStorage` `sf.sideIcons`; state `open` for tablets; a button at the top of `.side` with `aria-label` "Fold the menu" / "Show the menu names" and `aria-expanded`; on tablet widths (`matchMedia('(min-width: 640px) and (max-width: 1023px)')`) it toggles `open`, otherwise toggles and saves `icons`; `open` resets on route change and Escape and outside click; menu labels wrapped in `<span className="snav-t">`; `title` on each menu link)
- Modify: `apps/web/src/components/Icons.jsx` (add `sidebar` icon), `apps/web/src/styles.css` (icon-mode rules for `.shell.side-icons` and tablet-without-`side-open`: 68 px column, hide `.org`, `.lbl`, `.site-link`, `.snav-t`, brand wordmark, `.me .who-text`; centre icons; tablet `side-open` shows the full sidebar fixed over the page with a shadow)

- [ ] **Step 1:** Make the changes.
- [ ] **Step 2: Run** `pnpm --filter @siteflow/web build` → builds.
- [ ] **Step 3: Commit** `feat(web): fold the sidebar to icons; icon sidebar on tablets`

### Task 2: Breakpoints brought into line

**Files:**
- Modify: `apps/web/src/styles.css` (every `@media (max-width: …)` per the mapping above; the shell's phone switch moves from 860 to 639)

- [ ] **Step 1:** Rewrite the media queries.
- [ ] **Step 2: Run** `grep -o "@media[^{]*" apps/web/src/styles.css | sort | uniq -c` → only 380, 639, 1023, 1439 max-widths, the tablet range, `pointer: coarse`, `prefers-*`.
- [ ] **Step 3: Run** `pnpm --filter @siteflow/web build` → builds.
- [ ] **Step 4: Commit** `refactor(web): four screen sizes across the stylesheet`

### Task 3: Check and PR

- [ ] **Step 1: Run** `pnpm test` → all PASS (the known flaky `finance.test.js` may need a re-run).
- [ ] **Step 2: Hand check** (iframes at 320, 375, 768, 1024, 1280, 1920 px) on Home, Projects and a project page: sidebar mode per size, fold button, tablet expand and fold, no sideways scroll, Review Focus items.
- [ ] **Step 3:** Push `feat/nav-screen-sizes`, open a PR into `feat/nav-new-button` titled "Four screen sizes (navigation PR 5 of 6)" with the check list and the Claude Code attribution line.
