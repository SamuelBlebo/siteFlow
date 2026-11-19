# Own company and roles everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any account can start its own company from the Account page, and the Account page and company switcher show the person's role in every company they belong to.

**Architecture:** Web only. The existing `createCompany` callable already supports a second company for an invited person. A shared summary function in `packages/shared` turns a membership plus site list into the row text; the web reads memberships and sites once per company.

**Tech Stack:** React 19, Firebase web SDK, Vitest (shared).

**Spec:** `docs/superpowers/specs/2026-11-19-own-company-and-roles-design.md`

## Global Constraints
- No changes to Firestore rules or Cloud Functions.
- Roles stay per company. Role names from `ROLE_LABELS`.
- "Start your own company" shows only when `companyIds` doesn't include the account's uid.
- Commits as `samuel.blebo@yahoo.com`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Owner of their own company** → no "Start your own company" card.
2. **Switched-off membership** in one company → row shows "Access switched off", no Switch, and the page doesn't fail.
3. **Paused company** → row shows "Paused"; reading its sites is refused and handled.
4. **Viewing as another role** (View as) → the Account list shows the real roles, not the previewed one.
5. **Site supervisor with 0 projects** → "No projects yet", not a blank line.

---

### Task 1: Membership summary (shared)
**Files:** Create `packages/shared/src/logic/memberships.ts` (exported from the index); Test `packages/shared/test/memberships.test.ts`.

**Produces:** `membershipSummary(m: { role: Role; active?: boolean; siteIds?: string[] }, sites: Pick<Site, 'id' | 'name' | 'status'>[], company: { suspended?: unknown } | null): { roleLabel: string; state: 'ok' | 'off' | 'paused'; projects: string }`.
- `projects`: all-projects roles → `All projects (N)` (N = sites given); site roles → open sites first, then the rest, names joined with ", ", at most 5 then ` and N more`; none → `No projects yet`.
- `state`: `off` when `active === false`; `paused` when `company.suspended`; else `ok`.

- [ ] **Step 1:** Write tests: owner with 3 sites → `All projects (3)`; supervisor with 7 assigned → 5 names + ` and 2 more`; supervisor with none → `No projects yet`; inactive → `off`; suspended → `paused`; role label `Site supervisor`.
- [ ] **Step 2:** Run `pnpm run test:shared -- memberships` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm run test:shared` → PASS.
- [ ] **Step 5:** Commit `feat: membership summary for the account page`.

### Task 2: Start your own company
**Files:** Create `apps/web/src/components/CompanySetupForm.jsx` (the form from `FinishSetup.jsx`, props `onDone`, `submitLabel`); modify `FinishSetup.jsx` to use it; modify `apps/web/src/pages/Account.jsx` (new section, shown when `!profile.companyIds.includes(user.uid)`; after success navigate to `/`).

- [ ] **Step 1:** Make the changes.
- [ ] **Step 2:** Run `pnpm --filter @siteflow/web build` → builds.
- [ ] **Step 3:** Commit `feat(web): any account can start its own company`.

### Task 3: Your companies and projects
**Files:** Create `apps/web/src/components/MyCompanies.jsx` (reads each company, the person's own member doc and the sites with `getDoc` / `getDocs`; site roles read only their assigned site docs; an error on one company shows that row as "Can't load" without failing the rest); modify `Account.jsx` (section), `apps/web/src/auth/AuthProvider.jsx` (switcher entries carry `role` from the member doc) and `Layout.jsx` (option text `Name · Role`).

- [ ] **Step 1:** Make the changes.
- [ ] **Step 2:** Run `pnpm --filter @siteflow/web build` → builds.
- [ ] **Step 3:** Commit `feat(web): your companies, roles and projects on the account page`.

### Task 4: Check and PR
- [ ] **Step 1:** Run `pnpm test` → all pass.
- [ ] **Step 2:** Hand check on the emulators: owner A invites B as Site supervisor on one sample project; B sees the row and starts their own company; B's switcher shows both with roles; Review Focus items.
- [ ] **Step 3:** Push `feat/own-company`, open a PR into `main` titled "Start your own company; see your roles".
