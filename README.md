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
5. **Two Firebase projects.** `siteflow-dev` for testing, `siteflow-prod` for customers. Never test on prod.
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

## Accounts and team
- **Sign-up** (web) creates the company and owner through the `createCompany` function.
- **Adding people**: owners and admins add members on the Team page (`inviteMember`). SiteFlow creates the login
  and shows a temporary password to send on WhatsApp. The person chooses their own password at first sign-in.
- **Team changes** (role, sites, switch off/on, new temporary password, remove) go through Cloud Functions
  (`updateMember`, `setMemberActive`, `resetMemberPassword`, `removeMember`). They apply the role rules and
  write the company activity log. Switching someone off also blocks their login and signs them out.
- **Everyone** can edit their own name and WhatsApp number and change their password (web Account page,
  mobile Account screen).

## First-time setup
```bash
nvm use                                  # Node 20
npm run setup                            # installs everything, including functions
npm i -g firebase-tools eas-cli
firebase login
cp .firebaserc.example .firebaserc       # then put your real project ids in it
cp apps/web/.env.example apps/web/.env.development
cp apps/web/.env.example apps/web/.env.production
```
Firebase console, for **each** project: enable Email/Password auth, Firestore, Storage, and the Blaze plan (needed for Functions).
Add a Web app, an Android app and an iOS app to each project. App ids:
- production: `com.digitalprime.siteflow`
- development: `com.digitalprime.siteflow.dev`

## Everyday commands
| Task | Command |
|---|---|
| Web app locally | `npm run dev:web` |
| Mobile app locally (dev build on a phone) | `npm run dev:mobile` |
| Local Firebase (no real data touched) | `npm run emulators`, with `VITE_USE_EMULATORS=true` |
| Type-check shared, functions and rule tests | `npm run typecheck` |
| Shared logic tests | `npm run test:shared` |
| Mobile logic tests | `npm test -w @siteflow/mobile` |
| Security-rule tests (needs Java 21) | `npm run test:rules` |
| Web data layer against the emulators (needs Java 21) | `npm run test:web` |
| Everything | `npm test` |

The emulator tests use their own ports (`firebase.test.json`), so they can run while `npm run emulators` is open.
| Deploy everything to dev | `npm run deploy:dev` |
| Deploy everything to production | `npm run deploy:prod` |
| Deploy rules only | `npm run deploy:rules` |

## Secrets for reminders
```bash
firebase functions:secrets:set WHATSAPP_TOKEN --project prod     # Meta WhatsApp Cloud API
firebase functions:secrets:set WHATSAPP_PHONE_ID --project prod
firebase functions:secrets:set EMAIL_API_KEY --project prod      # Resend (or swap provider in notify.ts)
```
WhatsApp messages that SiteFlow starts need a Meta-approved message template.

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
- **CI**: every push and pull request runs the typecheck, all tests (including the security rules on the
  emulators) and the web, functions and mobile builds.
- **Deploy web and backend**: manual only, from the Actions tab, choosing dev or prod.
  Secrets: `FIREBASE_SERVICE_ACCOUNT` and the `VITE_FB_*` values, per GitHub environment.
- **Mobile build**: run by hand from the Actions tab. Secret: `EXPO_TOKEN`.
