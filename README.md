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
│           ├── paths.ts      Firestore paths as strings
│           ├── constants.ts  business rules (retention, alert thresholds, approval limits)
│           └── logic/        alerts, budget, schedule, wages, message text
├── firebase/                 the shared backend
│   ├── functions/            Cloud Functions (TypeScript): team invites, reminders, weekly digest
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
| Type-check shared and functions | `npm run typecheck` |
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
- **CI**: every pull request type-checks and builds.
- **Deploy web and backend**: push to `develop` deploys to dev, push to `main` deploys to production.
  Secrets: `FIREBASE_SERVICE_ACCOUNT` and the `VITE_FB_*` values, per GitHub environment.
- **Mobile build**: run by hand from the Actions tab. Secret: `EXPO_TOKEN`.
