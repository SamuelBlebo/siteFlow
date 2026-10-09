# SiteFlow

Construction management for Ghanaian contractors. One Firebase backend, one database,
a web app on Firebase Hosting and a mobile app on the App Store and Google Play.

```
siteflow/
├── apps/
│   ├── web/                  React + Vite → Firebase Hosting (owners, managers, site office)
│   │   ├── src/
│   │   │   ├── auth/         sign-in state and user profile
│   │   │   ├── components/   reusable UI pieces
│   │   │   ├── pages/        one file per screen
│   │   │   ├── lib/          Firestore reads/writes (web SDK) and hooks
│   │   │   └── firebase.js   Firebase setup (reads .env)
│   │   └── .env.example
│   └── mobile/               Expo + React Native Firebase → App Store / Play Store (site teams)
│       ├── src/
│       │   ├── auth/  site/  screens/  components/
│       │   └── lib/          Firestore writes (RN Firebase) and the offline photo queue
│       ├── assets/           icon, splash (replace before store release)
│       ├── app.config.js     dev and production app ids, Firebase files per environment
│       └── eas.json          build and store submission profiles
├── packages/
│   └── shared/               @siteflow/shared: used by web, mobile AND Cloud Functions
│       └── src/
│           ├── types.ts      shapes of every Firestore document
│           ├── schemas.ts    form validation (zod)
│           ├── modules.ts    module registry, plans, isOn()
│           ├── permissions.ts roles and what each can do (mirrored in the security rules)
│           ├── errors.ts     friendlyError(): what users see instead of raw Firebase errors
│           ├── paths.ts      Firestore and Storage paths as strings
│           ├── constants.ts  business rules (retention, alert thresholds, approval limits)
│           └── logic/        alerts, budget, schedule, wages, message text
├── firebase/                 the shared backend
│   ├── functions/            Cloud Functions (TypeScript): company setup, team management, reminders, weekly digest
│   ├── tests/                security-rule tests (run on the emulators)
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   └── storage.rules
├── .github/workflows/        CI, web + backend deploy, mobile builds
├── firebase.json             Hosting, Functions, rules and emulator config
└── package.json              npm workspaces
```

## Rules of the repo
1. **Shared first.** A type, validation rule, calculation or message used in more than one place goes in `packages/shared`.
2. **No Firebase SDK in shared.** Web uses the Firebase JS SDK, mobile uses React Native Firebase, functions use the Admin SDK. Shared only has plain TypeScript, so all three can use it.
3. **Paths from `paths.ts`.** Never hand-type a Firestore path in an app.
4. **Adding a module:** add its key to `types.ts` and `modules.ts`, its schema to `schemas.ts`, its alerts to `logic/alerts.ts`, its collection to `firestore.rules`, then build the screens in each app.
5. **Two Firebase projects.** `siteflow-dp-dev` for testing, `siteflow-dp-prod` for customers. Never test on prod.
6. **Permissions live in `permissions.ts` and the rules.** Hide what a role can't do in the UI *and* block it in
   `firestore.rules` / `storage.rules`. `firebase/tests` checks every role against the permission table.
7. **Money is kept apart.** Budgets and spending are in `sites/{sid}/finance/summary`, wage rates in
   `sites/{sid}/workerPay/{workerId}`. Only finance roles can read them.
8. **No silent failures.** Web writes go through `save()` (`apps/web/src/lib/save.js`), mobile writes through
   `track()` (`apps/mobile/src/lib/sync.js`). Show `friendlyError()` text, never a raw error.

## Roles
| Role | Sites | Site work (reports, attendance, materials) | Money | Team | Company settings |
|---|---|---|---|---|---|
| Owner | all | yes | yes | yes | yes |
| Admin | all | yes | yes | yes (not admins) | no |
| Project manager | all | yes | yes | no | no |
| Accounts / finance | all | view only | yes | no | no |
| Site supervisor | assigned | yes | no | no | no |
| Viewer | assigned | view only | no | no | no |

## Web app layout
A navy sidebar (company, menu, each project with a red dot when today's report is missing) and the page beside it.
Owners and managers land on the **Portfolio dashboard**: headline tiles (portfolio value, spent, daily reports, workforce,
open issues), weekly spend against plan, where the money goes, needs your attention, budget against progress, the
projects table, workforce by project and the latest reports. Money parts show only to finance roles with the Budget module on.
Owners also get **Modules** (switch built modules on or off; the `setModule` function applies it and sets the plan; modules not
built yet show as Coming soon) and **Reminders** (which alerts go by WhatsApp and email, and the message log). Materials, Labour
and Budget screens follow the modules, on web and mobile; switching a module off keeps its data.

## Countries, currency and time zone
SiteFlow works in any country (`packages/shared/src/locale.ts`: Ghana, Nigeria, Kenya, South Africa and 28 more). Each company picks its
country at sign-up (guessed from the device), which sets its **currency**, **time zone** and **dialling code**; the owner can change all
three on the Company page. Companies from before this have none stored and count as Ghana.
- **Apps:** the signed-in company is loaded with the profile and `setLocale()` is called before screens render, so `money()` / `big()`,
  `todayKey()`, form labels like "Budget (KSh)" and phone examples all follow it.
- **Server:** passes each company's currency and time zone explicitly (one function instance serves many companies). The missing-report
  reminder and weekly summary run every hour and act at 6 pm (Monday to Saturday) and 5 pm Friday in each company's own time zone.
- **Phone numbers:** any country, local or international. WhatsApp turns local numbers into international ones with the company's code.
- **Sample projects** move to the company's country: its cities, local names, and money scaled to its currency.

## Onboarding and sample projects
- **Sign-up** opens **Set up SiteFlow** (`/welcome`): company details, features (modules), the team, then the first project. Every step can be skipped and reopened from Company.
- **Getting started** on the dashboard: company details, first project, team, first daily report, budget. Worked out from real data; it disappears when done, or with Hide (per browser).
- **No projects yet**: the dashboard offers Add your first project, Explore with sample data, or the setup steps.
- **Sample projects** (`loadDemo` / `removeDemo` functions, owner only): three Ghanaian projects (a house, an office block, a road drainage job) with about eight weeks of reports, photos, attendance, materials, spending, issues and milestones, built by `packages/shared/src/demo.ts` relative to the day they are added. They are marked `sample: true` with ids starting `sample-`, labelled Sample everywhere, never send WhatsApp or email (the triggers and scheduled jobs skip them) and are removed in one click from the dashboard or Company. Photos: `apps/web/public/demo`, from Wikimedia Commons under CC BY-SA 4.0, credited in `apps/web/public/demo/CREDITS.md` and on the Photo credits page.
- **Phone**: site staff see a short welcome card the first time they open the app.

## Sites
One project = one site, for any kind of construction work. Owners, admins and project managers create sites (name, location,
type of work and stage, picked from the usual list or typed in, planned
dates, foreman, client, budget) and manage them from the Sites page: details, status and budget under
**Settings**, and who works there under **Team** (`assignToSite` function).
- **Active**: daily reports expected and chased.
- **On hold**: work paused; reports still allowed, not chased.
- **Closed**: finished; records stay readable, but nobody can add reports, attendance, materials or photos
  (enforced in the rules). Sites are never deleted.

## Report requests
Owners, admins and project managers ask named people for the daily report on a project (project page, Daily reports tab, or
**Request report** on a missing-report alert): the day it is for, an optional note, and WhatsApp and/or email (`requestReport`).
The person sees it on their Today screen (web and phone) until their report for that day comes in, which marks it **Report sent**
(`onReportSent`); the person who asked can cancel it. Requests on sample projects send nothing.

Reports record the sender's **role and email** with their name (the rules check both against their profile), shown as
"Yaw Boateng, Project manager" on reports, the feed and the phone.

## Daily reports
One report per person per site per day (document id `{date}_{uid}`), built by `reportDoc` in shared so web
and mobile store exactly the same thing. A report has work done, workers on site, stage and progress,
weather, issues, notes, materials used that day and up to 8 photos (resized on the device).
- **Mobile** sends through the report outbox (`apps/mobile/src/lib/reportOutbox.js`): saved on the phone first,
  sent when there is signal, retried on connection problems, and shown as *Waiting for signal / Sending / Sent /
  Not sent*. A report that can't be sent stays on the phone with Try again and Delete.
- **Web**: Reports page (every site, filters and search), report history per site (missing days highlighted),
  full report view with photo viewer.

## Attendance
One document per site per day (`attendance/{date}`) with a status per worker: **present**, **late**, **absent**
or **leave**. Present and late count as a day worked and paid (`isWorked` in shared). Apps write one worker at a
time (merged), so two people marking at once never overwrite each other.
- Site team: mark today or a past day, "mark the rest present", add workers and fix their details.
- Site managers switch workers off (their history stays). Finance sets daily rates (`workerPay`).
- Web history: any period, grid per worker with totals, attendance CSV; finance also gets wages and a wage sheet CSV.

## Materials
Each material has a balance that only changes with an entry (`materialLogs`), checked by the rules in the
same batch: **received** (supplier, waybill, cost for finance roles), **used** (what for) or a **stock count**
(site managers, with a reason, recording the difference). Entries are never edited or deleted; materials are
archived, not deleted. Usage may take the balance below zero (flagged as "count needed") so nothing recorded
on site is refused.
- Web: Stock (days left from the last 14 days of use), Record, History (totals, CSV), Set up.
- Mobile: fast Used / Received entry, stock with days left, today's entries.

## Issues
Problems reported on site (`sites/{sid}/issues`, comments in `issues/{id}/comments`). Priority **critical / high /
medium / low**, status **open → in progress → resolved → closed**. Who may do what is `issueActions` in shared and
the same in the rules: site managers do anything (assign, prioritise, fix-by date, close, reopen); the assignee
starts and resolves (saying how it was fixed); the reporter edits details while open; the site team comments.
Issues and comments are never deleted. Open critical and high issues appear in the dashboard alerts.
- Web: Issues page (critical banner, filters), issue view with actions and timeline, Issues tab per site.
- Mobile: report a problem through the outbox (works offline with photos), follow and resolve issues.

## Progress
Milestones per site (`sites/{sid}/milestones`): name, order, weight, planned start and finish, percent done.
Project managers set them up (or start from the usual stages for the kind of work: building, roads, civil works,
utilities or renovation); the site team updates the
percentage. The site's overall progress is the weighted average of its milestones and is written in the same
batch; without milestones it comes from daily reports. `scheduleStatus` compares done with planned (from
milestone dates, else the site's planned dates): on track, ahead, behind (with weeks), finished. Behind
programme and overdue milestones appear in the dashboard alerts for active sites.

## Money
Finance roles only. Each site's `finance/summary` holds the budget (total and per category, set by project
managers) and the spending totals, which are worked out by the `recalcSiteSpending` Cloud Function from the
site's expenses after every change: no app can write them. Expenses (date, category, amount, paid to, paid by,
receipt) are recorded and corrected by finance roles; costed material deliveries add an expense; wages worked
out from attendance can be recorded as a Labour expense. All calculations (variance, forecast at completion,
overspend risk, monthly spend) are in `packages/shared/src/logic/finance.ts`.
- Web: Budget tab per site, Finance page across sites. Mobile shows no money.

## Dashboard
For roles that see every site. Answers three questions with shared logic (`logic/dashboard.ts`, `siteAlerts`):
- **What needs attention**: alerts ranked urgent first (critical issues, missing reports, stock, budget, delays),
  filterable by kind, each with an action (remind on WhatsApp, open issue, materials, budget, progress).
- **What is happening**: reports in, workers on site, open issues, latest reports and issues across sites.
- **How each site is doing**: progress against the plan, report reliability over two weeks, issues, stock, budget.
- Two-week analytics: workers reported per day, reports sent, issues reported and resolved.
Mobile shows managers the top five items on the sites screen.

## Accounts and team
- **Sign-up** (web) creates the company and owner through the `createCompany` function.
- **Adding people** (`inviteMember`): owners and admins add members on the Team page. SiteFlow creates the login with
  a password nobody knows and emails an **invitation link** (`/invite/<token>`, works once, expires after 7 days,
  `INVITE_DAYS`). The person sees the company, their role and email, sets their own password and is signed in. The same
  link can be copied or sent on WhatsApp. Only a hash of the token is stored (`invites/{hash}`, server-only); a newer
  link replaces the older one, and removing the person cancels it (`invites.ts`: `inviteInfo`, `acceptInvite`).
- **Status** on the Team page: Invited, waiting / Invitation expired, with Resend invitation; for people who have joined,
  **Send password link** (their current password keeps working until they use the link; other devices are signed out after).
- **Email** needs the `EMAIL_API_KEY` secret (Resend) and `EMAIL_FROM` set to an address on a verified domain. Until then
  nothing is emailed and the Team page says so and shows the link to share.
- **Team changes** (role, sites, switch off/on, password link, remove) go through Cloud Functions
  (`updateMember`, `setMemberActive`, `resetMemberPassword`, `removeMember`). They apply the role rules and
  write the company activity log. Switching someone off also blocks their login and signs them out.
- **Everyone** can edit their own name and WhatsApp number and change their password (web Account page,
  mobile Account screen).

## Working offline (mobile)

Sites often have no signal. Nothing a supervisor saves on the phone may be lost.

- **Reports and issues** (with photos) go through the outbox (`apps/mobile/src/lib/reportOutbox.js`). They are saved on the phone first, with private photo copies, then sent when there is signal. Fixed ids (`{date}_{uid}` for reports) mean a retry can never make a second copy. Leftover photo files are cleaned up at start.
- **Everything else** (attendance, materials, workers, issue changes and comments, milestones, profile) goes through the write journal (`apps/mobile/src/lib/sync.js`):
  - Each change is written to the journal before it is sent, and leaves only when the server confirms it.
  - Ids are made on the phone and kept with the change.
  - When the app is reopened, any change still unconfirmed is checked on the server. If it arrived, it is cleared. If not, it shows as not saved, with Try again. Try again checks the server first, so nothing is counted twice.
  - Refused changes (no permission, or someone else changed the issue first) keep their data and a plain message.
- **Firestore** keeps its cache and its unsent writes on disk, with no size limit (`firestoreSetup.js`).
- **Status:** a banner shows Offline, Syncing or Not saved, and tapping it opens the **Sync** screen (also under Account), which lists everything waiting or failed, with Send now, Try again and Remove. Signing out with unsent changes asks first.
- **Drafts:** report and issue forms keep their text on the phone as it is typed.

## Environments
| | Development | Production |
|---|---|---|
| Firebase project | `siteflow-dp-dev` (alias `dev`) | `siteflow-dp-prod` (alias `prod`) |
| Web config | `apps/web/.env.development` | `apps/web/.env.production` |
| Mobile app id | `com.digitalprime.siteflow.dev` ("SiteFlow Dev") | `com.digitalprime.siteflow` |
| Mobile config | `apps/mobile/google-services.dev.json`, `GoogleService-Info.dev.plist` | `...prod.json`, `...prod.plist` |
| Function settings | `firebase/functions/.env.siteflow-dp-dev` | `firebase/functions/.env.siteflow-dp-prod` |
| Used for | Building and testing, demo data | Real companies only |

Never test or experiment on production. Config files are fetched, not hand-edited (they are public
identifiers, kept out of git). Console setup for each project: `docs/ENVIRONMENTS.md`.

## First-time setup
```bash
nvm use                      # Node 22
npm run setup                # installs everything, including functions
npx firebase login           # an account with access to both projects
npm run config:dev           # writes the web and mobile config for siteflow-dp-dev
npm run config:prod          # same for siteflow-dp-prod (only if you release)
npm run check:env            # checks every config file points at the right project
```

## Everyday commands
| Task | Command |
|---|---|
| Web app on the dev project | `npm run dev:web` |
| Web app on the local emulators | `npm run emulators`, then `npm run dev:web` with `VITE_USE_EMULATORS=true` in `apps/web/.env.development.local` |
| Mobile app (dev build on a phone, dev project) | `npm run dev:mobile` |
| Type-check shared, functions and rule tests | `npm run typecheck` |
| Shared logic tests | `npm run test:shared` |
| Mobile logic tests | `npm test -w @siteflow/mobile` |
| Security-rule tests (needs Java 21) | `npm run test:rules` |
| Scheduled jobs (needs Java 21) | `npm run test:functions` |
| Web data layer against the emulators (needs Java 21) | `npm run test:web` |
| Everything | `npm test` |
| Check environment config | `npm run check:env` |
| Deploy everything to dev | `npm run deploy:dev` |
| Deploy rules and indexes to dev | `npm run deploy:rules` |
| Deploy everything to production (only when asked) | `npm run deploy:prod` |

The emulator tests use their own ports (`firebase.test.json`) and temp folder (`scripts/test-emulators.mjs`),
so they can run while `npm run emulators`, or another project's emulators, are open. `npm run emulators`
uses the offline demo project, so it never touches dev or production.

A deploy builds the web app for the project it deploys to (`scripts/build-web.mjs`) and stops if the
config file belongs to the other project.

## Notifications
WhatsApp and email alerts are sent only by Cloud Functions (`firebase/functions/src/deliver.ts`), never by the apps.
The catalogue (who gets what, default channels, WhatsApp template wording) is `logic/notifications.ts` in shared:
critical issue, issue given to you, daily report missing, material running low, daily report sent (off by default)
and weekly summary. The owner switches each on or off per channel on the Company page. Each message is logged in
`companies/{cid}/notifications` (Team page) with a fixed id so an event never messages someone twice; failures worth
retrying are retried every 30 minutes. In the emulator nothing is sent (logged as "Not sent"). WhatsApp needs approved
templates: see [docs/WHATSAPP_TEMPLATES.md](docs/WHATSAPP_TEMPLATES.md).

## Secrets for reminders
```bash
firebase functions:secrets:set WHATSAPP_TOKEN --project prod     # Meta WhatsApp Cloud API
firebase functions:secrets:set WHATSAPP_PHONE_ID --project prod
firebase functions:secrets:set EMAIL_API_KEY --project prod      # Resend (or swap provider in notify.ts)
```
WhatsApp messages that SiteFlow starts need Meta-approved templates: see docs/WHATSAPP_TEMPLATES.md.

## Mobile release
```bash
cd apps/mobile
eas init                                  # once, links the Expo project
eas env:create --name GOOGLE_SERVICES_JSON  --type file --value ./google-services.json      --environment production
eas env:create --name GOOGLE_SERVICES_PLIST --type file --value ./GoogleService-Info.plist --environment production
npm run build:preview                     # APK for testers
npm run build:prod                        # store builds (Android .aab, iOS .ipa)
npm run submit:prod                       # uploads to Play Console and App Store Connect
```
Before the first store release you need: a Google Play developer account, an Apple Developer account,
real icon and splash images, a privacy policy URL, store screenshots, and test logins for the reviewers.

## CI/CD (GitHub Actions)
Every push and pull request runs the full checks (one required check: **CI passed**). `main` is deployed to dev
automatically; production is only deployed by hand, after approval. Setup and the release steps: `docs/CI_CD.md`.

