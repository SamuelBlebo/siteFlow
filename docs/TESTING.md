# Testing SiteFlow

## Running the tests

| Command | What it tests | Needs |
| --- | --- | --- |
| `npm run test:shared` | Shared logic: permissions, money, dates, alerts, reports, issues, progress, notifications, design tokens | Nothing |
| `npm test -w @siteflow/mobile` | Phone logic: write journal, outbox, server checks, drafts | Nothing (native modules are mocked) |
| `npm run test:rules` | Firestore and Storage security rules | Java 21 (emulators) |
| `npm run test:functions` | Scheduled jobs: 6pm reminders, weekly summary, message retries | Java 21 (emulators) |
| `npm run test:web` | Web data layer and Cloud Functions, end to end against the emulators | Java 21 (emulators) |
| `npm test` | All of the above except mobile | Java 21 |
| `npm run coverage` | Coverage for shared and mobile logic | Nothing |

- The emulator suites use the ports in `firebase.test.json`, so they don't clash with emulators you already have running.
- They never touch a real Firebase project, and nothing is sent: messages are logged as "skipped".
- CI (`.github/workflows/ci.yml`) runs every suite on every push and pull request.

## What is covered

| Area | Where |
| --- | --- |
| Authentication, first sign-in, password change | `apps/web/test/team.test.js`, `integration.test.js`, `apps/mobile/test/account.test.js` |
| Roles and permissions | `packages/shared/test/permissions.test.ts`. Also `firestore.rules.test.ts`, which checks that the rules match the permission table for every role |
| Tenant isolation | `firestore.rules.test.ts` ("tenant isolation"): every collection of another company is closed to every role (read and write), including company-wide queries, and nobody can move company or raise their own role. Storage photos are covered in `storage.rules.test.ts` |
| Firestore rules | `firebase/tests/firestore.rules.test.ts` |
| Storage rules | `firebase/tests/storage.rules.test.ts` (photos and thumbnails, size, type, closed sites, other companies) |
| Shared logic | `packages/shared/test/*` (about 98% of lines) |
| Daily reports | shared `reports.test.ts`, web `reports.test.js`, mobile `outbox.test.js` |
| Attendance | shared `attendance.test.ts`, web `attendance.test.js`, mobile `attendance.test.js` |
| Materials | shared `materials.test.ts`, web `materials.test.js`, mobile `materials.test.js` |
| Issues | shared `issues.test.ts`, web `issues.test.js`, mobile `outbox.test.js` and `checks.test.js` |
| Progress | shared `progress.test.ts`, web `progress.test.js` |
| Budgets and spending totals | shared `finance.test.ts`, web `finance.test.js` (including expenses saved at the same moment) |
| Notifications | shared `notifications.test.ts`, web `notifications.test.js`, `firebase/functions/test/scheduled.test.ts` |
| Offline and sync (phone) | mobile `sync.test.js` (journal, restart, retry, shared phone), `checks.test.js` (server checks, changed-since), `outbox.test.js` (photos, retries, app start) |
| Offline (web) | web `save.test.js` |

## Not covered by automated tests

These need a person and a device:

- **Screens:** layout and touch on real phones, screen readers, and dark mode. The UI is checked through builds and code review.
- **Offline on a real phone:**
  - turn on airplane mode, save a report, attendance and materials
  - close the app, reopen it, then turn the signal back on
  - check that everything arrives and the Sync screen clears
- **Real message delivery:**
  - WhatsApp templates must be approved by Meta first
  - email needs the provider key
