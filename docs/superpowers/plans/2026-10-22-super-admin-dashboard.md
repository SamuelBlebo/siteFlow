# Super Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/admin` page, only for SiteFlow's owner, showing sign-ups, usage and activity per client company, with account-help actions (password reset, resend invite, disable login, suspend company, mark internal).

**Architecture:** A custom Auth claim `platformAdmin: true` (set by a script) gates a set of `onCall` Cloud Functions in a new `firebase/functions/src/admin.ts`. They read with the Admin SDK and return only allow-listed fields. Firestore rules give the admin no extra reads. Suspension is a `suspended` flag on the company, enforced in both rules files, in `actorOf`, and in the scheduled jobs. The web page is a lazy-loaded route outside the company shell.

**Tech Stack:** Firebase (Auth, Firestore, Functions v2, Admin SDK 14), React 19 + Vite, zod schemas in `@siteflow/shared`, vitest against the emulators.

**Spec:** `docs/superpowers/specs/2026-10-22-super-admin-dashboard-design.md`

## Global Constraints

- Counts and activity only: no admin response may contain report, issue, finance, photo, drawing or activity text. Responses are built from the allow-lists in `ADMIN_FIELDS` (Task 1).
- Firestore rules give a platform admin no extra read access. `adminLog` is `allow read, write: if false`.
- The admin claim is never set from inside the app, only by `scripts/set-platform-admin.mjs`.
- Every admin action writes one `adminLog` entry `{ who, whoId, action, target, at }`. Actions are not written to the client's `companies/{cid}/activity`.
- Status labels: **Active**, **Going quiet** (no activity for 7+ days), **Never started** (no real project: none, or only `sample` ones).
- Paused copy, exactly: "This company's account is paused. Contact SiteFlow."
- Internal companies are left out of every count and chart.
- Web only; the mobile app is untouched.
- Commits: conventional commits, no Claude co-author trailer, push after each task (owner's git workflow).

## Review Focus

1. **A login in a suspended company and a normal company:** the person keeps full access to the normal one. Test in Task 2 (rules, `MULTI` user) and Task 5 (`actorOf`).
2. **An admin disabling their own login, or suspending a company they belong to:** disabling self is refused. Suspending your own company is allowed but asks for confirmation. Test in Task 4.
3. **A user with no Firestore profile (signed up but never finished company setup):** they appear in People search with `companies: []` and are counted as a person. Test in Task 3.
4. **Companies from before `createdAt` existed or with no `country`:** they sort last in the list and show "—" for missing values. Missing country means Ghana (`GH`), as in `Company.country`. Test in Task 3.
5. **The admin claim is removed while the page is open:** the next call returns `permission-denied` and the page shows "You no longer have admin access." Test in Task 3 (function); web shows the friendly error.

---

### Task 1: Shared admin logic and schemas

**Files:**
- Create: `packages/shared/src/logic/admin.ts`
- Modify: `packages/shared/src/index.ts` (export it), `packages/shared/src/types.ts` (`Company` gets `suspended?: { by: string; at: unknown } | null; internal?: boolean`), `apps/web/src/components/GettingStarted.jsx` (use `gettingStartedSteps`)
- Test: `packages/shared/test/admin.test.ts`

**Interfaces:**
- Produces:
  - `type StepKey = 'details' | 'project' | 'team' | 'report' | 'budget'`
  - `gettingStartedSteps(f: { hasDetails: boolean; realProjects: number; members: number; reported: boolean; budgetSet: boolean | null }): { key: StepKey; title: string; done: boolean }[]`. Titles are copied from `GettingStarted.jsx`: 'Company details', 'First project', 'Your team', 'First daily report', 'Project budget'. When `budgetSet === null` the budget step is left out, matching the web's current filtering.
  - `type CompanyStatus = 'active' | 'quiet' | 'never'`
  - `companyStatus(f: { realProjects: number; lastActive: number | null }, now: number): CompanyStatus`, using `QUIET_DAYS = 7`
  - `ADMIN_FIELDS = { overview: [...], companyRow: [...], companyDetail: [...], person: [...], project: [...], user: [...], logEntry: [...] } as const`, with the exact keys listed in Task 3
  - zod inputs: `adminCompanyInput = { cid: string 1..128 }`, `adminFindUserInput = { email: string email }`, `adminUserActionInput = { uid: string 1..128 }`, `adminDisableInput = { uid, disabled: boolean }`, `adminCompanyFlagInput = { cid, on: boolean }`, `adminInviteInput = { cid, uid }`

- [ ] **Step 1: Write the failing tests** in `packages/shared/test/admin.test.ts`

```ts
const now = Date.parse('2026-10-22T12:00:00Z'); const day = 86_400_000;
it('never started without a real project, whatever the activity', () => {
  expect(companyStatus({ realProjects: 0, lastActive: now }, now)).toBe('never');
});
it('going quiet after 7 days without activity', () => {
  expect(companyStatus({ realProjects: 1, lastActive: now - 7 * day }, now)).toBe('quiet');
  expect(companyStatus({ realProjects: 1, lastActive: now - 7 * day + 1 }, now)).toBe('active');
  expect(companyStatus({ realProjects: 1, lastActive: null }, now)).toBe('quiet');
});
it('getting-started steps match the web checklist', () => {
  const s = gettingStartedSteps({ hasDetails: true, realProjects: 1, members: 1, reported: false, budgetSet: null });
  expect(s.map((x) => [x.key, x.done])).toEqual([['details', true], ['project', true], ['team', false], ['report', false]]);
});
it('admin inputs refuse bad values', () => {
  expect(validate(adminFindUserInput, { email: 'nope' }).ok).toBe(false);
  expect(validate(adminCompanyFlagInput, { cid: 'c1', on: true }).ok).toBe(true);
});
```

- [ ] **Step 2: Run them to make sure they fail.** Run: `pnpm run test:shared -- admin`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `logic/admin.ts`** with the signatures above. Export it from `index.ts` and add the `Company` fields.
- [ ] **Step 4: Switch `GettingStarted.jsx` to `gettingStartedSteps`.** Keep its `why` / `to` / `go` per key in a local map and keep the permission filtering, so it behaves exactly as before.
- [ ] **Step 5: Run the checks.** Run: `pnpm run test:shared && pnpm --filter @siteflow/shared typecheck && pnpm run build:web`. Expected: all pass.
- [ ] **Step 6: Commit and push** `feat(shared): admin status, getting-started steps and admin inputs`

### Task 2: Rules: suspended companies and the admin log

**Files:**
- Modify: `firebase/firestore.rules` (`member(cid)`, new `match /adminLog/{id}`), `firebase/storage.rules` (`member(cid)`)
- Test: `firebase/tests/firestore.rules.test.ts`, `firebase/tests/storage.rules.test.ts`, `firebase/tests/setup.ts` (helper `suspend(env, cid)` that sets `suspended` with rules disabled)

**Interfaces:**
- Produces: the company document field `suspended` (a map, or missing/null when not suspended), which blocks members. The `internal` field has no effect in rules.

- [ ] **Step 1: Write the failing tests**
  - `describe('suspended company')`:
    - after `suspend(env, C1)`, `getDoc(company C1)`, a site read and a report write as `USERS.owner` are all denied (`assertFails`)
    - `MULTI` can still read C2's company and site S9 (`assertSucceeds`)
    - the owner of C1 cannot clear `suspended` with `updateDoc` (denied)
    - before suspension, every existing test still passes
  - `adminLog`: reading or writing `adminLog/x` as an owner is denied.
  - Storage: after suspension, an upload of a report photo by C1's supervisor is denied, and the same upload in C2 by `MULTI` succeeds.
- [ ] **Step 2: Run the tests to make sure they fail.** Run: `pnpm run test:rules`. Expected: the new tests FAIL.
- [ ] **Step 3: Change `member(cid)` in both files** to also require `get(/…/companies/$(cid)).data.get('suspended', null) == null`. Storage uses `firestore.get`. Add `match /adminLog/{id} { allow read, write: if false; }`. The company `update` rule already excludes `suspended` and `internal` through `onlyChanges`; confirm it does.
- [ ] **Step 4: Run all the rules tests.** Run: `pnpm run test:rules`. Expected: all pass, with no "too many document reads" errors. If a rule goes over the read limit, report it and stop rather than reworking the rules.
- [ ] **Step 5: Commit and push** `feat(rules): a suspended company's members lose access; admin log closed to clients`

### Task 3: Admin access and read functions

**Files:**
- Create: `firebase/functions/src/admin.ts`
- Modify: `firebase/functions/src/index.ts` (exports), `firebase/functions/src/limits.ts` (`admin: { max: 600, windowMs: 3600000 }`), `package.json` `test:functions` (emulators `auth,firestore`), `firebase/firestore.indexes.json` (only if a query needs it)
- Test: `firebase/functions/test/admin.test.ts`

**Interfaces:**
- Consumes: `companyStatus`, `gettingStartedSteps`, `ADMIN_FIELDS`, the inputs (Task 1).
- Produces (callables, all `onCall(callOpts)`):
  - `requireAdmin(req): { uid: string; name: string }`. It throws `permission-denied` "You no longer have admin access." unless `req.auth?.token.platformAdmin === true`, then calls `checkLimit(uid, 'admin')`.
  - `adminOverview() → { companies, people, newCompanies7, newCompanies30, newPeople7, newPeople30, activeCompanies7, activePeople7, signupsByWeek: { week: 'YYYY-MM-DD', companies: number, people: number }[] }`. The chart covers 13 weeks, each starting Monday (UTC), oldest first.
  - `adminCompanies() → { rows: CompanyRow[] }` with `CompanyRow = { id, name, country, ownerName, ownerEmail, createdAt: string|null, people, projects, sampleOnly, reports7d, lastActive: string|null, status, suspended: boolean, internal: boolean }`. Dates are ISO strings.
  - `adminCompany({ cid }) → CompanyRow & { members: { id, name, email, role, lastActive, disabled, invitePending }[], projectList: { id, name, status, lastReportDate, sample }[], steps: { key, title, done }[] }`
  - `adminFindUser({ email }) → { user: { id, email, name, disabled, createdAt, lastActive, companies: { id, name, role }[] } | null }`
  - `adminLogList() → { entries: { id, who, action, target, at }[] }`, the newest 100.
  - Internal helpers (exported for tests): `lastActiveOf(u: UserRecord): number | null` (= `lastRefreshTime ?? lastSignInTime`, parsed) and `pick<T>(obj, keys): T`. Every response row goes through `pick` with its `ADMIN_FIELDS` list.
- Data rules:
  - People come from `getAuth().listUsers(1000, pageToken)`, paged.
  - A company's `lastActive` is the max of its members' `lastActiveOf`, its latest report (a collection-group query on `reports` with `companyId == cid`, ordered by `date` desc, limit 1, `.select('date','createdAt')`), and its latest `activity` entry (`.select('at')`).
  - `reports7d` is a `count()` over `companyId == cid && date >= todayKey(now - 6 days)`.
  - Budget-set reads `paths.finance(cid, sid)` and returns only the boolean.
  - Internal companies are left out of overview totals and charts, but stay in `adminCompanies` rows with `internal: true`.
  - "Active this week": a person whose `lastActiveOf` is within 7 days, or a company that is `status === 'active'` and not internal.

- [ ] **Step 1: Write the failing tests.** Seed two companies: one with a real project and a report today, one with only a `sample` site. Add one internal company, and create Auth users with the Admin SDK against the auth emulator. Call the handlers through `firebase-functions-test`'s `wrap`, or by exporting the plain handler functions; follow the style of the existing test files. Assert:
  - every function called without the claim rejects with `{ code: 'permission-denied' }`
  - statuses come out as `['active', 'never']` for the two real companies; the internal one is excluded from `adminOverview().companies` (which is 2)
  - for every row from `adminCompanies` and `adminCompany`, `Object.keys(row)` is a subset of the allow-list, and `JSON.stringify(result)` does not contain the seeded report text `'Cast lintels'` or the budget amount `'250000'`
  - `adminFindUser` finds a user with no profile and returns `companies: []`
  - a company with no `createdAt` and no `country` returns `createdAt: null` and `country: 'GH'`, and sorts last
- [ ] **Step 2: Run the tests to make sure they fail.** Run: `pnpm run test:functions -- admin`. Expected: FAIL.
- [ ] **Step 3: Implement `admin.ts`** with the read callables and helpers above. Export them from `index.ts`.
- [ ] **Step 4: Run the checks.** Run: `pnpm run test:functions && npm --prefix firebase/functions run typecheck`. Expected: all pass.
- [ ] **Step 5: Commit and push** `feat(functions): admin overview, companies, company and people lookups (counts only)`

### Task 4: Admin actions and the admin log

**Files:**
- Modify: `firebase/functions/src/admin.ts`, `firebase/functions/src/index.ts`
- Test: `firebase/functions/test/admin.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, the inputs (Task 1); `issueInvite(db, invitee, by, 'invite')` from `invites.ts`; `sendEmail(to, subject, text, { html })` from `notify.ts`.
- Produces (callables):
  - `adminSendPasswordReset({ uid })`. Uses `getAuth().generatePasswordResetLink(email, { url: APP_URL + '/login' })` and emails it with the subject "Reset your SiteFlow password", using `secrets: [EMAIL_KEY]`. Returns `{ email: 'sent' | 'failed' | 'skipped' }`.
  - `adminResendInvite({ cid, uid })`. Only when the member has `invitePending`, otherwise `failed-precondition`. Returns `IssuedInvite` without `link` (the admin doesn't need the token).
  - `adminSetLoginDisabled({ uid, disabled })`. Uses `updateUser(uid, { disabled })`, plus `revokeRefreshTokens(uid)` when disabling. `uid === admin uid` gives `failed-precondition` "You can't switch off your own login."
  - `adminSetCompanySuspended({ cid, on })`. Sets `suspended: on ? { by: adminName, at: serverTimestamp() } : null`.
  - `adminSetCompanyInternal({ cid, on })`. Sets `internal: on`.
  - `logAdmin(db, admin, action: string, target: string)`. Writes to `adminLog`. Each action calls it once after it succeeds. Example values: action `'password reset'`, target `'kofi@x.com'`.

- [ ] **Step 1: Write the failing tests**
  - each action without the claim gives `permission-denied`
  - suspend, then unsuspend, sets and clears `suspended`, and writes two `adminLog` entries with matching `action`/`target`; nothing is written to `companies/{cid}/activity`
  - disabling your own uid is refused; disabling another user makes `getAuth().getUser(uid).disabled` true
  - resending an invite for a member without `invitePending` gives `failed-precondition`
  - `adminLogList` returns the newest entries first, with only allow-listed keys
- [ ] **Step 2: Run the tests to make sure they fail.** Run: `pnpm run test:functions -- admin`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement the actions and `logAdmin`.**
- [ ] **Step 4: Run all the functions tests.** Run: `pnpm run test:functions`. Expected: all pass.
- [ ] **Step 5: Commit and push** `feat(functions): admin actions: password reset, resend invite, disable login, suspend and mark internal; admin log`

### Task 5: Suspension in functions and scheduled jobs

**Files:**
- Modify: `firebase/functions/src/members.ts` (`actorOf`), `firebase/functions/src/reminders.ts` (`eachCompany`). Check `requests.ts`, `demo.ts`, `projects.ts`, `overview.ts`, `ledger.ts` for callers that bypass `actorOf`, and give them the same check through one helper.
- Test: `firebase/functions/test/members.test.ts`, `firebase/functions/test/scheduled.test.ts`

**Interfaces:**
- Produces: `assertNotSuspended(db, cid): Promise<void>` in `members.ts`. It throws `permission-denied` with exactly "This company's account is paused. Contact SiteFlow." `actorOf` calls it. `eachCompany` skips companies whose `suspended` is set, and logs how many it skipped.

- [ ] **Step 1: Write the failing tests**
  - `actorOf` for a member of a suspended company rejects with the paused message
  - the same uid with `companyId` switched to another company resolves
  - `eachCompany` calls `fn` for normal companies only
- [ ] **Step 2: Run the tests to make sure they fail.** Run: `pnpm run test:functions`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement the check** and route the other callable entry points through it.
- [ ] **Step 4: Run all the functions tests.** Run: `pnpm run test:functions`. Expected: all pass.
- [ ] **Step 5: Commit and push** `feat(functions): paused companies are refused and skipped by scheduled jobs`

### Task 6: Admin claim script and operations docs

**Files:**
- Create: `scripts/set-platform-admin.mjs`
- Modify: `docs/OPERATIONS.md` (new "Platform admin" section), `docs/LAUNCH.md` (step D: grant your own admin claim on prod)

**Interfaces:**
- Usage: `node scripts/set-platform-admin.mjs --project <dev|prod project id> <email> [--off]`. It uses `firebase-admin` with application default credentials (`gcloud auth application-default login`). It merges into existing custom claims instead of replacing them, and prints the resulting claims.

- [ ] **Step 1: Write the script.** It refuses to run without `--project`, and prints "Sign out and back in to pick it up."
- [ ] **Step 2: Verify the script against the auth emulator.** Run: `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/set-platform-admin.mjs --project demo-siteflow test@x.com` with a user created in the emulator. Expected: it prints `{ platformAdmin: true }`. Run it again with `--off` and expect `{}`.
- [ ] **Step 3: Write the docs.** In OPERATIONS.md: how to grant and remove the claim, what each action does (including that disabling a login blocks every company the person belongs to), and that suspension pauses data, files, functions and scheduled emails.
- [ ] **Step 4: Commit and push** `feat(scripts): grant or remove the platform admin claim; docs`

### Task 7: Web: the admin page, the menu link and the paused screen

**Files:**
- Create: `apps/web/src/pages/Admin.jsx`, `apps/web/src/lib/admin.js` (`call(...)` wrappers named like the callables)
- Modify: `apps/web/src/App.jsx` (lazy route `/admin` outside `Guard`/`Layout`, with its own check), `apps/web/src/auth/AuthProvider.jsx` (expose `platformAdmin` from `getIdTokenResult().claims.platformAdmin === true`, refreshed on sign-in), the account menu in `apps/web/src/components/TopBar.jsx` ("Admin" link only when `platformAdmin`), `Guard` in `App.jsx` (when `company?.suspended` is set, show the paused screen; reuse the "Access switched off" layout with the company switcher), `apps/web/src/styles.css` (only what the existing classes don't cover)

**Interfaces:**
- Consumes: the callables from Tasks 3 and 4.
- Page sections, using existing components (`PageHead`, `SearchBox`, `StatusPill`, `Spark`/a bar chart in `Charts.jsx`, the existing confirm pattern, `toast`, `friendlyError`):
  - **Overview:** 6 tiles (companies, people, new this week, new this month, active companies this week, active people this week), plus a weekly sign-ups bar chart for 13 weeks.
  - **Companies:** a table that becomes cards on phones (existing `tableLabels` pattern). Filters: All / Active / Going quiet / Never started / Internal. Search by name. Sorted by sign-up date, newest first. A row opens the company detail as a panel with members, projects, steps and the actions (suspend/unsuspend, mark internal, resend invite on pending members, password reset, disable login).
  - **People:** an email search showing the user card and actions.
  - **Admin log:** the latest 100 entries.
- Confirmations name the target and the effect. Suspend: "Pause {company}? Its people can't open it until you unpause it." Disable: "Switch off {name}'s login? They can't sign in to any company."
- Without the claim, `/admin` redirects to `/`.

- [ ] **Step 1: Build the page and its wiring.**
- [ ] **Step 2: Check the build.** Run: `pnpm run build:web`. Expected: success, with `Admin` in its own chunk (`ls apps/web/dist/assets | grep -i admin`).
- [ ] **Step 3: Run the existing web integration tests.** Run: `pnpm run test:web`. Expected: all pass, including GettingStarted after the Task 1 refactor.
- [ ] **Step 4: Check it by hand in the emulators or on dev, at desktop and phone width:**
  - an admin sees the link and every section
  - a non-admin going to `/admin` lands on `/`
  - a suspended company's member sees the paused copy
  - a person in two companies can switch to the other one
- [ ] **Step 5: Commit and push** `feat(web): super admin dashboard, admin menu link and paused-company screen`

### Task 8: Privacy check, dev deploy and verification

**Files:**
- Read: `apps/web/src/pages/Legal.jsx`

- [ ] **Step 1: Check the Privacy Policy.** If it does not say that SiteFlow staff can see account and usage information to run and support the service, write suggested wording for the owner. Do not edit the legal text.
- [ ] **Step 2: Run the full test suite.** Run: `pnpm run typecheck && pnpm test`. Expected: all pass.
- [ ] **Step 3: Deploy to dev and grant the owner's claim there.** Run: `pnpm run deploy:dev`, then `node scripts/set-platform-admin.mjs --project <dev id> afrowjack99@gmail.com`. Never deploy prod.
- [ ] **Step 4: Check dev.** Open `/admin`, compare the counts with the Firestore console, send a password reset to a test account and confirm it is logged.
- [ ] **Step 5: Commit any fixes and push.**
