# Super admin dashboard

Agreed with the owner on 2026-10-22.

## Intent

SiteFlow is about to take its first clients. The owner (the person who runs SiteFlow, not a client
company's owner) needs one place to see who has signed up, whether they are actually using it, and
to help people who are stuck, such as sending a password reset. Today there is no level above a
company: every screen and rule is scoped to one company.

Success: in the first weeks the owner can open one page and know how many companies and people
have joined, which clients are active, which are going quiet and which never started (so they can
phone them), and can fix account problems without touching the Firebase console.

## Decided by the owner

- **Counts and activity only.** The super admin sees numbers, names, dates and activity, never the
  content of a client's reports, photos, issues, finances or drawings. Nothing in this feature may
  read or show that content.
- First version, as proposed and accepted:
  - **Overview:** total companies and people, new sign-ups in the last 7 and 30 days with a
    sign-ups-over-time chart, and companies and people **active this week**.
  - **Companies list:** one row per company with country, owner, sign-up date, number of people,
    number of projects, reports in the last 7 days, last activity, and a status label:
    **Active**, **Going quiet** (no activity for 7+ days), **Never started** (signed up but no real
    project, i.e. only sample projects or none).
  - **Company detail:** its people (name, email, role, last sign-in), its projects (name, status,
    last report date; no report content), getting-started progress, and whether it only has sample
    projects.
  - **People:** search any user by email; see which companies they belong to and when they last
    signed in.
  - **Actions:** send a password reset email, resend an invitation, disable / re-enable a login,
    suspend / unsuspend a company.
  - **Only the owner** gets in. The flag is set from the command line, never from inside the app.
  - **Every admin action is recorded** (who, what, to whom, when).
- **Not in this version:** signing in as a client (impersonation), deleting companies, editing
  client data, billing and plans.

## Anti-goals

- A super admin who can read client data. That would break the promise above and the Privacy
  Policy.
- Any way for a normal user to become a super admin through the app or the database rules.
- Making normal app screens slower for clients.

## Builder's calls (not discussed; open to change)

### Access

- **Custom claim `platformAdmin: true`** on the owner's Firebase Auth account, set by a script
  `scripts/set-platform-admin.mjs <email> [--off]` run with Admin credentials against dev or prod.
  The user must sign out and in again (or the app forces a token refresh) to pick it up.
- **All admin data comes from Cloud Functions** (`onCall`) that check `req.auth.token.platformAdmin`.
  The Firestore rules stay as they are: no rule gives a super admin read access to client
  collections. This is what keeps "counts only" true: the functions return just the fields listed
  above.
- Admin functions keep the usual per-user rate limits (`checkLimit`).

### What "counts only" means on the server

- The admin functions may *read* client data on the server only where a yes/no or a date has to be
  worked out. They *return* only the fields listed in this document. Example: "budget set" reads the
  project's finance record (`budget > 0`, as `Dashboard.jsx` does) and returns done / not done.
- Lookups that only need a date ask Firestore for that field alone (`select(...)`), e.g. the latest
  report's date and the latest audit entry's time. Report and activity text never reaches the function.
- Tests check the shape of every admin response against an allow-list of fields.

### Internal and test companies

- The owner's own company and test companies would inflate the numbers at pilot size. Each company
  row has a **"Mark as internal / test"** toggle (`internal: true` on the company document, written
  by an admin function and logged). Internal companies are left out of every count and chart, and
  are listed under a separate "Internal" filter.

### Where the numbers come from

- **Companies, people, projects:** `companies`, `companies/{cid}/members`, `companies/{cid}/sites`
  (with `sample` to separate sample projects), read by the Admin SDK. Counts use Firestore
  `count()` aggregations where possible.
- **Reports in the last 7 days:** a `count()` on the `reports` collection group filtered by
  `companyId` and created date. If an index is needed, add it to `firestore.indexes.json`.
- **Last sign-in / last active:** Firebase Auth user metadata (`lastSignInTime`, and
  `lastRefreshTime`, which updates while someone keeps using the app). No new tracking is added to
  the app.
- **Last activity of a company:** the latest of: its members' last active time, its latest report,
  its latest audit-trail entry (`companies/{cid}/activity`).
- **Active this week:** a person is active if their last active time is in the last 7 days; a
  company is active if any member is, or it sent a report in that time.
- **Getting-started progress:** the same five steps as `GettingStarted.jsx`, worked out on the
  server from the data (company details, a real project, more than one member, a real project with
  a report, a budget set). Share the step logic through `packages/shared` so the two never differ.
- **Speed:** at pilot size (tens of companies) the overview is computed on demand, each time the page
  opens. If it gets slow (a few hundred companies), switch to a nightly scheduled summary document.
  That is not built now.

### Actions

- **Password reset:** generate a reset link with the Admin SDK and send it with the existing email
  sending (Resend, `mail.ts`), in the same style as current SiteFlow emails. This works even for a
  login shared by several companies, unlike the company-level `resetMemberPassword`, because it goes
  to the person's own email address.
- **Resend invitation:** reuse `issueInvite` for a member whose `invitePending` is set.
- **Disable / re-enable login:** Admin SDK `updateUser(uid, { disabled })` plus revoking refresh
  tokens on disable. This blocks the person in every company they belong to. A super admin cannot
  disable their own account.
- **Suspend company:** set `suspended: true` (plus who and when) on the company document, written
  only by the admin function. Effect: the company is paused everywhere. Its members can no longer
  read or write its data, files or functions:
  - `member(cid)` in **both** `firestore.rules` and `storage.rules` also requires the company not to
    be suspended. This adds one document read to rule checks, which must be measured against the
    rules' read limits and covered by the rules tests.
  - Company-scoped Cloud Functions refuse with a plain message, through one shared check in the
    function that loads the caller's membership.
  - The web app shows a plain "This company's account is paused. Contact SiteFlow." screen.
  - Scheduled emails, reminders and digests skip suspended companies.
  - Other companies the same people belong to are not affected.
- **Mobile app and suspension:** the mobile app is not in the store yet (foremen use the web app
  until Stage 19), so nothing is built for it now. A paused screen and outbox handling for suspended
  companies are added to the mobile release stage.
- **Confirm before acting:** each action asks for confirmation; disable and suspend name the person
  or company and what will happen.
- **Record of admin actions:** a top-level `adminLog` collection (`who`, `whoId`, `action`,
  `target`, `at`), written only by functions, readable by no client (`allow read, write: if false`).
  It is shown at the bottom of the dashboard through an admin function. Actions are not written to
  the client company's own audit trail. They don't show to the client.

### Screens (web only)

- Route `/admin`, outside the normal company shell, lazy-loaded so clients never download it. Anyone
  without the claim is sent to `/`.
- A link to it appears in the account menu only for platform admins.
- Uses the existing light look, components and skins. Tables become cards on phones like the rest of
  the app.
- Sections: Overview (number tiles plus a sign-ups chart over the last 90 days by week), Companies
  (sortable, filter by status, search by name), People (search by email), Admin log.
- Mobile app: nothing in this version.

### Tests

- Functions: a non-admin gets `permission-denied` on every admin function; admin results contain
  no report, issue, finance or photo fields.
- Rules: a suspended company's members are denied; nothing changes for normal companies.
- Shared: the getting-started step logic.

### Docs

- OPERATIONS.md: how to grant and remove the platform admin flag, and what each action does.
- Privacy Policy wording: SiteFlow staff can see account and usage information to run the service.
  Check what `Legal.jsx` already says, and flag it to the owner if it needs a change. Don't change
  the legal text without asking.
