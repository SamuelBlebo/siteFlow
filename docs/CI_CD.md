# CI/CD

GitHub Actions in `.github/workflows`. The rule: everything is checked automatically, dev is deployed automatically, and **production is never deployed or submitted without a person choosing it and an approver agreeing**.

## The workflows

| Workflow | When it runs | What it does |
| --- | --- | --- |
| **CI** (`ci.yml`) | Every push and pull request | Checks the change (details below). Ends in one check, **CI passed** |
| **Deploy to dev** (`deploy-dev.yml`) | After CI passes on `main`, or by hand | Deploys web, functions, rules and indexes to `siteflow-dp-dev` |
| **PR preview** (`pr-preview.yml`) | Each pull request from this repository | Web preview on a temporary dev address (7 days), linked in a PR comment |
| **Deploy to production** (`deploy-prod.yml`) | By hand only | Deploys a `main` commit that passed CI to `siteflow-dp-prod`, after approval, and tags it `prod-YYYYMMDD-HHMM` |
| **Mobile build** (`mobile-build.yml`) | By hand only | EAS builds. A preview build uses dev. A production build uses prod and needs approval. Submission to the stores only for production, only when ticked, only after approval |
| **Dependabot** (`dependabot.yml`) | Weekly | Pull requests for updates. Each one goes through CI |

What CI checks:

- install (`npm ci` for the apps and the functions)
- typecheck
- shared logic and production config
- mobile logic
- web build
- functions build
- mobile bundle
- Firestore and Storage rules
- scheduled jobs
- web data layer and functions against the emulators
- dependency audit: blocking for Cloud Functions, report-only for the apps

The deploy and preview workflows **skip with a note** until their deploy key exists, so they are safe to have before the projects are ready.

## One-time setup in GitHub

These are done in the GitHub settings by the repository owner.

### 1. Protect `main`

Settings > Branches > Add rule for `main`:

- Require a pull request before merging.
- Require status checks to pass, and select **CI passed**.
- Do not allow bypassing, including for administrators (recommended).

### 2. Environments

Settings > Environments:

- **development**
  - Secret `FIREBASE_SERVICE_ACCOUNT`: a key for a service account in `siteflow-dp-dev` (see below).
- **production**
  - Required reviewers: you, and anyone else who may approve a release.
  - Deployment branches: `main` only.
  - Secret `FIREBASE_SERVICE_ACCOUNT`: a key for a service account in `siteflow-dp-prod`.
  - Secret `EXPO_TOKEN` for production mobile builds.
- **Optional:** a `VITE_APPCHECK_SITE_KEY` variable in each environment, once App Check is set up (`docs/OPERATIONS.md`).
- **Repository secret:** `EXPO_TOKEN` (expo.dev > Account > Access tokens) for preview mobile builds.

### 3. The deploy service accounts

Do this once per project, in the Google Cloud console for that project: IAM and Admin > Service accounts > Create.

1. Name it `github-deploy`.
2. Give it these roles:
   - Firebase Admin
   - Cloud Functions Admin
   - Service Account User
   - Cloud Scheduler Admin
   - Secret Manager Viewer
   - Artifact Registry Administrator
   - API Keys Viewer
3. Keys > Add key > JSON. Paste the whole file into the environment secret, then delete the file from your computer.

Use the dev key only in `development` and the prod key only in `production`, so a dev workflow can never reach production.

## Releasing to production

1. **Merge to `main`.** CI runs, then **Deploy to dev** puts it on https://siteflow-dp-dev.web.app.
2. **Check it on dev** with a test company.
3. **Start the deploy.** Actions > **Deploy to production** > Run workflow. Type `deploy production`; optionally give the commit to deploy (it defaults to the latest `main`).
4. **Approve it.** An approver approves the waiting deployment on the run page.
5. **It deploys and is tagged.** To roll back, run the workflow again with the previous `prod-…` tag's commit. To roll back the web app alone, use Firebase console > Hosting > Rollback.

## Known reports

- **Mobile toolchain (report-only audit).** Expo SDK 53 and React Native 0.79 bring build tools (Metro, the Expo CLI) with published advisories.
  - These tools run on build machines, not in the app.
  - The fix is the Expo SDK upgrade, planned with the mobile release (Stage 19) so it can be tested on devices.
  - Dependabot leaves Expo, React, React Native and every native module alone, at any version step. The Expo SDK fixes their exact versions, and web and mobile share one install, so they move together in the SDK upgrade (`npx expo install --fix`).
- **Web (report-only audit).** npm counts Firestore's server-only gRPC library and tooling from the shared install. Neither is in what browsers download.
