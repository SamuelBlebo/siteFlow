# SiteFlow: current state and product readiness audit

**Date:** 10 October 2026
**Branch audited:** `feat/prototype-redesign` at `eaa7ea4`.
- It is 44 commits ahead of `main` and has not been merged.
- The working tree was clean when the audit started.

**Scope:** audit and planning only. No application code, configuration or deployment was changed for this report.

## How to read the evidence

Every finding is tagged with how it was established.

| Tag | Meaning |
|---|---|
| **[Ran]** | Run on 10 Oct 2026 for this audit; the output is quoted. |
| **[CI]** | GitHub Actions results, read through the public GitHub API. |
| **[Live-dev]** | Checked end to end against the dev Firebase project (`siteflow-dp-dev`) during the development sessions of 9 and 10 Oct 2026. Those check scripts are not in the repository, so the results cannot be re-run from the repo. |
| **[Code]** | Read in the source; not executed. |
| **[Docs]** | Stated in documentation only. |
| **[Assumption]** | A judgement that needs confirming. |

"Previous audit" means the Stage 15 (quality) and Stage 16 (hardening) work, which ended around 3 to 5 October 2026 on `main`. There is no earlier audit document in the repository; their findings live in `docs/TESTING.md`, `docs/OPERATIONS.md` and `docs/CI_CD.md`.

---

## 1. Executive summary

SiteFlow is a working construction site-management product. It covers the daily site loop well and the money side only partly:
- **What works:** daily reports with photos, attendance and wage sheets, materials and stock, issues, a milestone programme, budgets and expenses, dashboards, WhatsApp/email notifications, and an offline-capable phone app.
- **What it is built on:** sound foundations. The security rules are role-based and checked per company, privileged actions go through Cloud Functions with validation and rate limits, and the logic is shared between web, phone and functions.
- **Test coverage:** about 400 automated tests across five suites.

It is **not ready for paying customers yet**, for four reasons:

1. **The release pipeline is broken. [CI]**
   - Every CI run since commit `75494b5` (9 Oct, project drawings) has failed at the **Install** step. That is 22 consecutive runs.
   - So the security-rule and integration tests have **not run** against any rule changed since then: drawings, report emails, report days, sample projects, pins and report reviews.
   - Those rule changes **were deployed to dev** from a developer machine.
   - The probable cause is a lock file rewritten by npm 12 locally while CI uses npm 10. This is unconfirmed, because the CI log needs a GitHub login.
2. **Production has never received any of the recent work. [CI] [Code]**
   - The "Deploy to production" workflow has never run.
   - Everything since the redesign exists only on dev and on an unmerged branch.
   - Accounts must be moved to company memberships when production is first upgraded. The move is written and was exercised on dev, but has not been rehearsed against a copy of production data.
3. **Money records can be changed without a trace. [Code]**
   - Finance roles can edit or hard-delete any expense, with no history.
   - Budgets change without a record.
   - Attendance, which drives wages, can be changed for any date by the site team.
   - For a product whose value is "control over site costs", this is the most important gap.
4. **Messaging and AI are wired up but switched off. [Code] [Live-dev]**
   - The email (Resend), WhatsApp (Meta) and Anthropic keys are placeholders, so every notification is logged as "Not sent".
   - Custom domain, legal pages, payments and mobile store releases are all outstanding.

**Product fit for Ghanaian contractors [Assumption]:**
- **Strong** on site visibility (reports, photos, attendance, materials, issues).
- **Thin** on what contractors pay to control: BoQ-based budgets, committed costs, purchase orders and supplier payments, subcontractor payments and variations, payment certificates.
- These areas need validating with real contractors before building, ideally through a pilot.

**Recommendation:** first restore the pipeline and close the financial-integrity gaps (Stage 2). Then pilot with 2 or 3 real contractors **before** building procurement and BoQ features, so those are shaped by real workflows.

---

## 2. Current architecture

| Part | Technology | Size (lines of source) | Notes |
|---|---|---|---|
| Web app | React 19, Vite 5, react-router 7 | ~7,300 (`apps/web/src`) | One page per project; dashboard; finance; team; modules; public landing page |
| Phone app | Expo / React Native, React Native Firebase | ~2,950 (`apps/mobile/src`) | Site team's daily work; offline outbox and change journal |
| Shared package | TypeScript, zod | ~2,860 (`packages/shared/src`) | Permissions, validation, business logic, paths, locale, email bodies, AI facts |
| Cloud Functions | Firebase Functions v2 (europe-west1), esbuild | ~1,700 (`firebase/functions/src`) | Team management, invitations, notifications, scheduled jobs, demo data, AI, project deletion |
| Security rules | Firestore (452 lines), Storage (68 lines) | `firebase/*.rules` | Membership-based, per company and per project |
| CI/CD | GitHub Actions | `.github/workflows/` | `ci.yml`, `deploy-dev.yml`, `deploy-prod.yml` (with an approval step), `mobile-build.yml`, `pr-preview.yml` |
| Environments | `siteflow-dp-dev`, `siteflow-dp-prod` | `.firebaserc`, `docs/ENVIRONMENTS.md` | Prod not updated since the early stages |

**Data model highlights [Code]:**
- **One login, several companies:**
  - `users/{uid}` holds the person;
  - `companies/{cid}/members/{uid}` holds their role, projects and on/off switch in each company.
  - Rules read the membership for the company in the path (`firebase/firestore.rules`, `member()` / `meIn()`).
- **Money is kept apart from the project:**
  - `sites/{sid}/finance/summary` holds budget and spent;
  - `workerPay/{id}` holds pay rates.
  - Both are readable only by finance roles.
- **Server-only collections** have no security rule, so the apps can't read or write them: `invites`, `rateLimits`, `system/mail`, `mailOptOut`, `companies/{cid}/mailThreads`, and `sites/{sid}/ai`.

---

## 3. Feature inventory

Platforms: **W** = web, **M** = phone app.

### 3.1 Accounts and organisation

| Feature | Intent | W | M | Verified by | Known gaps |
|---|---|---|---|---|---|
| Email/password sign-up creating a company | Owner creates their company on the server | ✓ | sign-in only | Ran: web integration tests exist but need emulators (not run locally). CI: passed up to `a6f3d70`. Live-dev | Company is created by the `createCompany` function; owner company id = owner uid, so one owned company per login |
| Google sign-in | One-tap sign-in | ✓ | ✗ | Code; Live-dev (button renders) | **Provider must be enabled in each Firebase console**; not on mobile |
| Invitations by link | New member sets own password via one-time link (7 days) | ✓ | ✗ (accept on web) | CI (passed at `a6f3d70`); Live-dev (29 checks) | Email delivery off until Resend is set up; link can be shared on WhatsApp manually |
| One login, several companies | Same email has different roles in different companies; switcher | ✓ | ✓ | CI rules tests at `a6f3d70`; Live-dev (29 checks) | Old-layout accounts migrate on first web sign-in or the hourly job; **not rehearsed on production data** |
| Roles and permissions | owner, admin, manager, finance, supervisor, viewer | ✓ | ✓ | Ran: shared `permissions.test.ts`; CI rules matrix (at `a6f3d70`) | Rules changed after `a6f3d70` not covered by a CI run |
| Team management | Invite, change role, assign projects, switch off, remove, password link | ✓ | ✗ | CI/Live-dev | Call/WhatsApp numbers added 10 Oct; **undocumented in README** |
| Localisation | 32 countries, currency, time zone, phone format | ✓ | ✓ | Ran: `locale.test.ts` | Ghana cedi is the default; money is not converted, only formatted |
| Onboarding and sample projects | Welcome steps, three sample projects | ✓ | partial | Ran: `demo.test.ts`; Live-dev | Sample data can be removed; samples never send messages |

### 3.2 Projects (sites)

| Feature | W | M | Verified by | Known gaps |
|---|---|---|---|---|
| Create, edit, status (active / on hold / closed) | ✓ | view | CI (to `a6f3d70`); Code | Status changes now confirm first (10 Oct) |
| One page per project for all roles (Today, Overview, Daily reports, Progress, Issues, Materials, Labour, Budget, Team, Settings) | ✓ | ✓ (own layout) | Live-dev (screenshots) | Old `/work/...` links redirect |
| Projects grid/list, project image, pins | ✓ | image only | Live-dev | **Pins and images undocumented**; pins rule untested (CI broken) |
| Project drawing (PDF/image), marked areas linked to stages, issue pins | ✓ | view + zoom | Ran: `drawings.test.ts`; Live-dev | Rules for drawings never run in CI; real PDF upload not tested end to end; area marking web only |
| Delete project (owner, typed confirmation) | ✓ | ✗ | Live-dev (10 checks) | Irreversible; relies on backups (PITR/backups not verified, see §7) |
| Report days (working days, skip a day with confirm/undo) | ✓ | shows state | Ran: `sites.test.ts`; Live-dev | **Undocumented**; rule untested in CI |

### 3.3 Daily site work

| Feature | W | M | Verified by | Known gaps |
|---|---|---|---|---|
| Daily report (work, workers, stage, progress, weather, issues, notes, photos; fixed id per person per day) | ✓ | ✓ offline outbox | Ran: shared and mobile tests; CI rules (to `a6f3d70`) | One report per person per day by design |
| Report requests (ask someone for a report, WhatsApp/email) | ✓ | sees request | CI (to `a6f3d70`); Live-dev | |
| Report sent back for changes; author updates | ✓ | ✓ (online only) | Live-dev (19 checks) | **Undocumented**; rule untested in CI; phone update needs signal |
| Report emails as threads, 7pm summary, client copy, unsubscribe | server | n/a | Ran: `mail.test.ts`; Live-dev (25 checks) | Sending off until Resend is set up; photo links in emails are bearer links (see §5) |
| AI overviews (project and today) | ✓ | ✗ | Ran: `overview.test.ts`; Live-dev (plain summary) | **AI writing never exercised** (no Anthropic key); **undocumented in README**; project data would go to Anthropic: needs a privacy-policy line |
| Attendance | ✓ | ✓ offline | Ran: attendance tests | See §5: any date, editable |
| Wage sheets → Labour expense | ✓ | ✗ | Ran: `wages` logic tests | No lock or link between paid periods and attendance; can be recorded twice |
| Materials, deliveries, usage, stock counts, low stock | ✓ | ✓ offline | Ran: materials tests; rules (to `a6f3d70`) | Logs are permanent (good); no wastage analysis |
| Issues (priority, assignee, comments, photos, drawing pins) | ✓ | ✓ offline | Ran: issues tests; CI (to `a6f3d70`) | |
| Milestones / programme (% per stage, behind-plan detection) | ✓ | ✓ | Ran: `progress.test.ts` | No dependencies, no Gantt, no programme import |

### 3.4 Money and oversight

| Feature | W | M | Verified by | Known gaps |
|---|---|---|---|---|
| Budget (total and per category) | ✓ | ✗ | CI (to `a6f3d70`) | Changes not recorded (§5) |
| Expenses (record, edit, delete, CSV) | ✓ | ✗ | Ran: finance tests | Edits and deletes leave no trace (§5); no approvals; no attachments/receipts |
| Spent totals recalculated on the server | server | | Code; Live-dev (fixed missing index on 8 Oct) | |
| Portfolio dashboard (tiles clickable) | ✓ | attention list | Ran: dashboard tests; Live-dev | |
| Notifications log and settings | ✓ | ✗ | Ran: notifications tests | All "Not sent" until keys are set |
| Activity (audit) log | ✓ (owner/admin) | ✗ | Code | Covers team changes, modules, project deletion, demo, report update; **not** expenses, budgets, attendance, wages, report deletion |

### 3.5 Modules shown as "Coming soon" [Code: `packages/shared/src/modules.ts`]

These are listed but not built: Health and safety, Change orders, Scheduling, Drawings and documents (revisions), RFIs, Inspections and punch lists, Subcontractors, Equipment, Client portal and billing, Approvals and audit trail, Integrations. Placeholder types exist in `packages/shared/src/types.ts`.

Note: `DEFAULT_MODULES` switches **Health and safety** on for new companies even though it isn't built. It has no visible effect today, but it is counted in the plan calculation.

### 3.6 Implemented but missing from the README (documentation debt)

- Pins.
- Project images and grid/list views.
- Report days (working days and skipping).
- Reports sent back for changes.
- AI overviews.
- Call numbers.
- Grouped Daily reports page.
- Clickable dashboard tiles.
- The "Add team member" button flow.

The README does cover multi-company memberships, drawings, report emails and project deletion.

---

## 4. Verification results (run for this audit)

| Check | Result | Command |
|---|---|---|
| TypeScript (shared, functions, rule tests) | **Pass**, no errors **[Ran]** | `npm run typecheck` |
| Shared logic tests | **207 passed** (21 files) **[Ran]** | `npm run test:shared` |
| Mobile tests | **63 passed** (7 files) **[Ran]** | `npm test -w @siteflow/mobile` |
| Lint (undefined/unused names) | **0 errors**, 2 style warnings **[Ran]** | `oxlint` with no-undef/no-unused-vars |
| Web production build | **Pass**; vendor chunk 568 kB (gzip 165 kB), firebase chunk 651 kB (gzip 154 kB) **[Ran]** | `npm run build:web` |
| Functions build | **Pass** **[Ran]** | `npm run build:functions` |
| Rules tests (89 Firestore + 15 Storage) | **Not run locally** (needs Java). **Last passed in CI at `a6f3d70`**; not run since **[CI]** | `npm run test:rules` |
| Web integration tests (~111) and functions tests (20) | Same: last passed at `a6f3d70` **[CI]** | `npm run test:web`, `test:functions` |
| CI on this branch | **22 consecutive failures since `75494b5`, all at "Install"** **[CI]** | GitHub Actions |
| Lock file in sync locally | `npm ci --dry-run` reports up to date on Windows with npm 12.0.2 **[Ran]** | |

**Probable CI cause [Code + Assumption]:**
- The pdf.js install (`75494b5`) was done with npm **12.0.2** under Node 24.
- That rewrite removed nested optional entries, for example `node_modules/firebase/node_modules/@react-native-async-storage/async-storage`, that npm **10** (bundled with Node 22, which CI uses via `.nvmrc`) expects. `npm ci` then refuses.
- To confirm, read the CI log while signed in to GitHub.

---

## 5. Security and financial-integrity findings

Severity reflects impact on a paying contractor.

| # | Severity | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| S1 | **Critical (process)** | Rule changes since `75494b5` have never been run against the rules test suite, yet were deployed to dev. A rules mistake could expose or block data. | CI history; `firebase/firestore.rules` changes in commits `75494b5`…`eaa7ea4` | Fix CI; add tests for every new rule (drawings, pins, report days, sample mark, review/authorFix, cover, clientReports, emailPrefs, updatedBy) before any production deploy |
| F1 | **High** | **Expenses can be edited or hard-deleted** by any finance role (owner, admin, project manager, finance) with no history, no reason and no record of who changed it (no `updatedBy`). Totals then change silently. | `match /expenses/{id}` (update/delete by `financeEdit`); `apps/web/src/lib/db.js` `updateExpense`/`deleteExpense` | Correction model: no hard delete (void with reason), edit history subcollection or server-side append-only log, `updatedBy` checked by rules; optional approval above a threshold |
| F2 | **High** | **Attendance drives wages but can be written for any date** (past or future) and changed later by anyone doing site work. Wage sheets are then recorded as a Labour expense, with **no link to the period paid** and nothing to stop the same period being paid twice. | `match /attendance/{date}` (no date window; `markedBy` is only the last person); `recordWages` in `apps/web/src/lib/db.js` | Allow site-team edits only for today (and maybe yesterday), managers beyond; keep a per-worker change history; lock periods once wages are recorded; store the period on the expense and refuse overlaps |
| F3 | Medium | **Budget changes are not recorded.** Any project manager can change the budget with no trail. | `match /finance/{docId}` update | Log budget changes (who, from, to, when) in the activity log via a function or a history subcollection |
| F4 | Medium | **Daily reports can be hard-deleted** by site managers without trace. | `allow delete: if siteManager(cid)` on reports | Prefer "withdrawn" with reason; or log deletions |
| S2 | Medium | **Photo links in emails are bearer URLs** (Firebase Storage download tokens). Anyone with a forwarded email can open the photos indefinitely. | `firebase/functions/src/mail.ts` (thumbs embedded); `packages/shared/src/logic/mail.ts` | Accept and document, or serve photos through signed, expiring URLs or an app link instead |
| S3 | Medium | **App Check not enforced** on callable functions (`ENFORCE_APP_CHECK` unset). Functions still require sign-in, role checks and rate limits. | `callOpts` in `firebase/functions/src/*.ts`; `docs/OPERATIONS.md` | Turn on reCAPTCHA Enterprise App Check for the web, then enforce |
| S4 | Medium | **Project deletion is irreversible** (recursive delete plus Storage files). Recovery relies on backups whose configuration is **not verified**. | `firebase/functions/src/projects.ts`; `docs/OPERATIONS.md` (PITR and backup commands to run by hand) | Verify PITR and daily backups on prod; consider a 30-day soft delete |
| S5 | Low | Drawing `file`/`image` fields accept any `https://` address (managers only), so they could point at outside content. | drawings rule in `firebase/firestore.rules` | Restrict to the project's Storage bucket or the app's own origin |
| S6 | Low | Web expense creation uses a new id each time, so a double submit or a retry after a slow save can create **duplicate expenses**. | `addExpense` in `apps/web/src/lib/db.js` | Client-generated id held for the form's lifetime; disable the button while saving (partly done) |
| S7 | Info | AI overviews send project facts (names, reports, issues and, for finance roles, money) to Anthropic when a key is set. | `firebase/functions/src/overview.ts` | Privacy policy and data-processing terms; owner opt-in already exists (module switch) |

**What is in good shape:**
- **[Code + CI to `a6f3d70` + Live-dev] Company isolation.** Every rule checks the membership in the company named in the path. The rules tests include "no role in company 1 can read or write company 2" across every collection, and 29 live checks covered one login in two companies.
- **[Code] Privileged operations go through Cloud Functions** with zod validation, role checks and per-person rate limits (`firebase/functions/src/limits.ts`). These cover team changes, invitations, module switches, demo data, report requests and reviews, project deletion and AI.
- **[Code] Invitation links** store only a SHA-256 hash, expire after 7 days, are single-use, and are replaced by newer links.
- **[Code + Live-dev] Email settings links** are HMAC-signed, a tampered link is refused, and a one-click unsubscribe works.
- **[Code + CI] Materials:** logs are permanent, stock can only change together with a matching log, and adjustments need a manager and a note.
- **[Code] Pay and money are separated from the project document;** site roles can't read `finance` or `workerPay`.
- **[Code] Duplicate submissions:**
  - reports have a fixed id per person per day;
  - phone issues get their id on the device;
  - outbox retries are idempotent (`apps/mobile/src/lib/reportOutbox.js`).
- **[Code] Conflicting updates:** stock uses an optimistic check, so conflicts are refused and shown in the phone's sync banner. Milestones and project details are last-write-wins.

---

## 6. Product gaps for Ghanaian contractors

Status: **Implemented**, **Partial**, **Missing**, or **Validate** (the need itself must be confirmed with customers).

| Area | Status | What exists | Business problem it solves | Validate with contractors |
|---|---|---|---|---|
| Project setup, contracts, BoQ | **Missing** (Partial: details, client, dates, stages) | `SiteForm`, stages by work type | Ties the budget to what was priced; basis for valuations | Do they price in Excel BoQs? Which format? Who keeps the BoQ, QS or owner? |
| Budgets and cost control | **Partial** | Budget per category; spent from expenses; overspend alerts | Knowing early that a job is losing money | Category vs BoQ-item control; weekly or monthly review? |
| Actual, committed, forecast cost | **Missing** (only actual) | Expenses | Committed cost (orders, subcontracts) is where overruns hide | Do SMEs track commitments at all today? |
| Purchase requests, approvals, POs | **Missing** | none | Stops unauthorised buying; links orders to deliveries | Approval limits? Who approves? Mobile Money payments? |
| Suppliers, deliveries, invoices, outstanding payments | **Partial** (deliveries with supplier name and cost) | `materialLogs` delivery with supplier/ref/cost | Supplier balances and credit are a big pain point [Assumption] | Credit terms, invoices, payment tracking needed? |
| Subcontractors, variations, payments | **Missing** (module "coming soon") | type placeholder | Paying subs against certified work, retention | How common are subcontracts for SMEs vs daily labour? |
| Site reports, photos, progress | **Implemented** | Reports, photos, requests, reviews, emails, drawings with areas | Owner sees the site without travelling | Report frequency; voice notes in Twi? |
| Attendance and labour cost | **Implemented / Partial** | Attendance, rates, wage sheets | Paying the right people for days worked | Fixes for F2; payment by MoMo; casual vs permanent labour |
| Materials inventory and wastage | **Partial** (no wastage) | Stock, usage, deliveries, counts, alerts | Theft and waste of cement, rods, blocks | How do they measure wastage? |
| Scheduling, delays, dependencies | **Partial** | Milestones with dates, behind-plan | Delay claims, planning labour and materials | Do SMEs use programmes? MS Project/Excel import value? |
| Documents, drawing revisions | **Partial** | Drawings per project (no revisions/approvals) | Building from the right drawing | Revisions and transmittals needed for SMEs? |
| Client-facing progress reports | **Partial** | Client email copy of daily reports | Client confidence, faster payments | Weekly PDF report? Client portal? (Stage 30 proposal pending) |
| WhatsApp communication | **Partial** | Templates, links, report requests; **not live** (Meta setup pending) | The channel everyone already uses | Group sharing vs individual messages; cost per message |
| Mobile use on poor networks | **Implemented** (reports, issues, attendance, materials offline) | Outbox and journal with server checks | Sites have weak signal | Phone models and data costs on site |
| GHS and local workflows; accounting | **Partial** | GHS default, 32 countries, CSV exports | Fits local money and accountants | VAT/NHIL/GETFund levies on invoices? Integration with QuickBooks/Sage/Tally? |

---

## 7. Technical debt and deployment readiness

### Release and operations

- **CI broken since 9 Oct.** See §4. Nothing should be merged or released until it is green.
- **Branch drift:**
  - 44 commits on `feat/prototype-redesign` are not merged to `main`.
  - The "Deploy to dev" workflow last ran on 3 Oct from `main`, so dev is currently fed by manual deploys from a laptop. Dev therefore does not match any reviewed branch state.
- **Production:**
  - It has never been deployed by the pipeline.
  - The membership migration runs automatically on first web sign-in and the hourly job, but has not been rehearsed on a copy of production data.
  - The new composite index (expenses category+amount) must be built before release.
- **Secrets are placeholders (`none`):** `EMAIL_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` and `ANTHROPIC_API_KEY`. Also needed: `EMAIL_FROM`, `APP_URL` and a custom domain.
- **Backups and monitoring [Docs]:**
  - `docs/OPERATIONS.md` lists the PITR, daily backup, Storage versioning and TTL commands, all to be run by hand. Whether they were run on prod is **not verified**.
  - There's no error monitoring or alerting (e.g. Cloud Monitoring alerts, crash reporting) in the code.
- **Mobile release (Stage 19) not done:** no store listings, and no beta builds on testers' phones.
- **Performance:**
  - The web bundle is about 320 kB gzip for vendor plus Firebase, before app code. That's acceptable on 4G, slow on poor 3G.
  - pdf.js loads only on demand (good).
  - There's no performance budget in CI.

### Code and documentation

- **Undocumented features:** see §3.6.
- **Live check scripts** used during development are not in the repo, so they can't be repeated. Convert them into emulator integration tests.
- **Duplicate role sources:** the permission table in shared and the role lists in rules are kept in sync by tests (good), but only when CI runs.
- **Native `confirm()` dialogs** are used for destructive actions. They work, but they aren't styled and are inconsistent with the app.
- **Lint:** 2 style warnings only.

### Launch requirements (none in place)

- Terms of Service and Privacy Policy, plus registration with Ghana's Data Protection Commission.
- An AI and processor disclosure.
- Support channel and help pages.
- Pricing, payments (e.g. Paystack for cards and Mobile Money) and invoicing.
- Status/incident communication.

---

## 8. Product quality review

| Aspect | Finding | Evidence |
|---|---|---|
| Visual consistency | Strong after the redesign: navy and brass tokens, shared design tokens tested (`design.test.ts`), light and dark themes on web | Ran: `design.test.ts`; Live-dev screenshots |
| Onboarding a company | Good: welcome steps, sample projects, getting-started checklist, invite button | Live-dev |
| Inviting and training site workers | Link-based invites, Call/WhatsApp buttons; **blocked in practice until email/WhatsApp are live** (links must be shared by hand) | Code |
| Web/mobile consistency | Phone lacks: Google sign-in, dark mode, AI overviews, drawing area marking, expenses, team management, accepting invites in-app | Code |
| Errors and recovery | Friendly errors (`errors.ts`, tested); phone sync banner and retry; web "saved on this device" queue | Ran: `errors.test.ts`, mobile `sync`/`outbox` tests |
| Accessibility | Labels, focus styles, aria on toggles/tabs, reduced-motion support. **Not tested** with a screen reader or automated a11y tools | Code |
| Responsive layout | Checked at 390 px and 1440 px for several pages | Live-dev screenshots |
| Complexity | The project page has up to 10 tabs; the owner sidebar has 10 items. A simplification (5-item sidebar, Resources tab, "+ New" button) was proposed but not done | Code |
| Steps for core tasks | Report: 1 tap from any project card. Skipping a day: 2 clicks. Expenses: web only. Wage sheet: several screens | Live-dev |

---

## 9. Prioritised roadmap

The order is adjusted to the evidence:
- Reliability and money integrity come first.
- A **pilot with real contractors moves earlier**, before procurement and BoQ, so that those big features are built for validated workflows.

### Stage 2: Pipeline, security and financial integrity (next)

**Objective:** a trustworthy, releasable base. Every rule tested, money changes traceable, and production upgraded safely.
**Business outcome:** SiteFlow can be shown to a paying contractor without risk of silent money changes or data exposure.

**Tasks** (affected areas in brackets):
1. **Restore CI.**
   - Regenerate the lock file with the npm version CI uses, or pin npm in CI and in `package.json` `packageManager` (`package-lock.json`, `.github/workflows/ci.yml`).
   - Confirm the root cause from the CI log.
2. **Add rules tests for every rule added since `a6f3d70`** (`firebase/tests/firestore.rules.test.ts`, `storage.rules.test.ts`). Several tests were written but have never run.
3. **Expense integrity (F1).**
   - Replace hard delete with "void" plus reason.
   - Record `updatedBy` (enforced in the rules) and an append-only history, written by a function trigger.
   - Show the history in Finance (`firebase/firestore.rules`, `apps/web/src/lib/db.js`, `apps/web/src/components/BudgetPanel.jsx`, new trigger in `firebase/functions/src/finance.ts`).
4. **Attendance and wages (F2).**
   - Date window for site roles.
   - Change history.
   - Wage periods stored on the Labour expense, with overlap refused and a lock once paid.
   - Affects `firebase/firestore.rules`, `packages/shared/src/logic/wages.ts`, `LabourPanel`, and the mobile workers screen.
5. **Budget change log (F3)** and **report deletion trace (F4).**
6. **Expense duplicate guard (S6).**
7. **Operations.**
   - Verify or enable PITR, backups, Storage versioning and TTL on prod.
   - Add error alerting.
   - Write a production upgrade runbook, including a migration rehearsal on a copy of prod data.
8. **Merge `feat/prototype-redesign` to `main`** through a pull request with CI green; deploy dev from `main` through the pipeline only.

**Dependencies and risks:**
- Changing expense and attendance rules can break the phone's offline journal.
- Migrating existing expenses: add new fields without breaking old documents.

**Acceptance criteria:** see §10.

**Tests:**
- Automated:
  - rules tests for F1 to F4 (allowed and refused cases);
  - functions tests for the history triggers;
  - web integration tests for void, edit history, wage overlap and the attendance window;
  - mobile journal tests for refused attendance edits.
- Manual: the full owner, PM, finance and supervisor journey on dev, and a production upgrade rehearsal.

**Definition of done:**
- CI green on `main`.
- Production upgraded through the approved workflow.
- Backups verified.
- No open Critical or High findings.

**Do not change:** the report, issue and materials flows (beyond tests); the UI layout; the module list.

### Stage 3: Pilot readiness (usability, onboarding, launch basics)

**Objective:** 2 or 3 real contractors can use SiteFlow daily without hand-holding.

**Tasks:**
- Email (Resend) and WhatsApp (Meta templates) live; custom domain; Google sign-in enabled in prod.
- Simplification: 5-item sidebar, Resources tab, "+ New" quick add.
- Phone parity for the core flow: accepting invites, dark mode, today's overview.
- Help pages and a support WhatsApp line.
- Terms of Service and Privacy Policy (including the AI processor).
- Mobile beta builds (Play internal testing, TestFlight).
- Documentation for the features in §3.6.

**Acceptance criteria:**
- A new contractor signs up, invites a supervisor by email, and gets a first report from the phone in under 30 minutes, unassisted.
- Notifications arrive.
- Legal pages are live.

**Do not change:** money rules from Stage 2; data model.

### Stage 4: Pilot and customer validation

**Objective:** evidence for what to build next, and willingness to pay.

**Tasks:**
- Onboard the pilots.
- Weekly interviews (questions in §11).
- Usage analytics (privacy-respecting): weekly active projects, reports per working day, time to first report.
- Fix friction.
- Decide pricing.

**Exit criteria:**
- At least 2 pilots use SiteFlow on 80% or more of working days for 4 weeks.
- A ranked list of validated needs for Stage 5.

### Stage 5: Cost control, BoQ and procurement (shaped by the pilot)

Likely scope, to be validated:
- BoQ import (Excel) into budget lines.
- Committed cost: purchase requests, approvals by limit, purchase orders.
- Deliveries matched to POs.
- Supplier balances.
- Cost-to-complete forecast.

Affects the shared logic, new collections with rules and tests, Finance pages, and phone delivery capture.

**Do not change:** daily reports/attendance contracts.

### Stage 6: Subcontractors, variations, scheduling, documents, client reporting

Possible scope:
- Subcontract values, certified work and retention.
- Variations / change orders.
- Programme import (Excel or MS Project XML) with dependencies.
- Drawing revisions.
- The Client role with weekly PDF progress reports (the Stage 30 proposal).

### Stage 7: Commercial launch

- Payments (e.g. Paystack, cards and Mobile Money), plans and trials, invoices.
- Store releases.
- Status page and incident process.
- Marketing site with pricing.

---

## 10. Acceptance criteria for the next stage (Stage 2)

1. CI (`ci.yml`) passes on `feat/prototype-redesign` and then on `main` after merge, including the emulator rules and integration tests. The cause of the Install failure is recorded in `docs/CI_CD.md`.
2. Every rule added or changed since `a6f3d70` has at least one allowed and one refused test, and all pass.
3. An expense can no longer be hard-deleted from an app. Voiding requires a reason. Every edit records who and when, and keeps the previous values, visible to finance roles. The rules refuse edits without `updatedBy == auth.uid`.
4. Site roles can mark attendance only for today (and the previous working day, if the business agrees); managers for any date. Each mark change is kept with who and when.
5. A wage sheet stores its period. Recording a second wage sheet overlapping a recorded period is refused with a clear message. Attendance in a paid period can't be changed without a manager unlocking it, and the unlock is logged.
6. Budget changes appear in the activity log with old and new amounts.
7. Deleting a report is either replaced by "withdraw with reason" or logged with who, when and the report's date.
8. Production upgrade:
   - the runbook is written;
   - a migration rehearsal on a copy of prod data succeeds;
   - PITR and daily backups are confirmed enabled;
   - the prod deploy is made through `deploy-prod.yml` with approval.
9. No Critical or High findings from §5 remain open.

---

## 11. Open questions for customer validation

1. **Who** decides to buy: owner, project manager, or QS/accountant? Who uses it daily?
2. **Daily reports:** do supervisors write them today (WhatsApp messages, paper, Excel)? Would voice notes in Twi help?
3. **Labour:** casual daily workers or permanent? How are they paid (cash, Mobile Money, bank)? Who approves wage sheets?
4. **BoQ:** is the budget built from a priced BoQ? In what format? Is progress claimed against BoQ items?
5. **Purchasing:** who can buy materials? Is there an approval limit? Do suppliers give credit? How are supplier debts tracked?
6. **Subcontractors:** how common, and how are they paid (lump sum, measured work, retention)?
7. **Clients:** do clients ask for progress reports? Weekly or monthly? Would a client login or a PDF be preferred?
8. **Accounting:** which taxes and levies appear on invoices (VAT, NHIL, GETFund, COVID levy)? Which accounting software, if any?
9. **WhatsApp:** individual messages, or posts to existing site groups? Is the per-message cost acceptable?
10. **Devices and data:** phone types and data budgets on site; is offline use common?
11. **Price:** what would they pay per month, per project, or per user? Is Mobile Money billing preferred?
12. **Trust:** what would make them comfortable putting company money data in the cloud (backups, data location, export)?
