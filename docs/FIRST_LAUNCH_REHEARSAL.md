# First-launch rehearsal and dev App Check (plan, not yet approved)

Production (`siteflow-dp-prod`) has never been launched. On 2026-10-10 a read-only check found:
- Firestore and Cloud Functions are not enabled;
- the hosting site shows "Site Not Found";
- three apps are registered.

So there is no production data to copy or migrate. What needs rehearsing is the **first launch**:
creating the database with its protection settings, deploying everything, and proving a backup can
be restored. This plan does that on a separate staging project.

**Nothing here has been done. Each step that costs money or creates a project needs approval.**

## 1. Costs (estimates; check the live pricing pages before approving)

All amounts in US dollars, for europe-west1.

| Item | Staging (rehearsal) | Production, pilot size |
| --- | --- | --- |
| Firestore reads, writes, storage | Within the free daily amounts (sample data) | Mostly within free amounts at a few companies |
| Point-in-time recovery | No free tier. About $0.15 per GiB-month of data (US rate, scaled; check the europe-west1 rate). Sample data is well under 0.1 GiB: cents | Same rate on the real data size: under $1/month for the first year at pilot size |
| Daily backups (14 weeks) | Billed per GiB-month of backup. Cents for sample data | Cents to a few dollars |
| Restore test | $0.20 per GiB restored, once. Cents | Only when needed |
| Cloud Functions, Cloud Build, Artifact Registry | Within free amounts. Container images about $0.10–0.30/month | About $0–5/month at pilot size |
| Storage (photos) | Within the free 5 GB | Depends on photos. About $0.02–0.03 per GB-month |
| App Check (reCAPTCHA) | 10,000 assessments/month free per project. Then $8 flat up to 100,000, then $1 per 1,000 | Same |
| **Total** | **Under $2/month while it exists, plus under $1 for the rehearsal itself** | **About $5–25/month at pilot size**, before WhatsApp, email and AI providers |

WhatsApp (Meta), email (Resend) and AI (Anthropic) are billed by those providers. They stay switched
off (`none`) on staging.

## 2. Billing setup and spending limits

- Link staging to the same billing account as dev (Blaze plan). Firebase needs Blaze for Functions
  and scheduled jobs.
- **Budget alerts** (Billing > Budgets & alerts), each emailed to the owner and one other admin:
  - **staging:** $5/month, alerts at 50%, 90% and 100%;
  - **dev:** $10/month, same thresholds;
  - **production:** $50/month at launch, alerts at 50%, 90% and 100%, reviewed after the first month.
- **Budgets only send alerts; they don't stop spending.** For a hard stop on staging, connect the
  budget to a Pub/Sub topic with a small function that unlinks billing when spend passes $20. That is
  optional; deleting the staging project after the rehearsal does the same job.
- Keep App Check token refresh at the default or longer (up to 7 days on web), so assessments stay
  in the free 10,000 per month.

## 3. People and permissions

| Who | Where | Role |
| --- | --- | --- |
| Owner (you) | staging | Owner (creates the project and links billing) |
| The person running the rehearsal | staging only | Firebase Admin, plus Cloud Datastore Owner for backups and restores |
| The person running the rehearsal | production | Viewer only (for read-only checks; never Editor) |
| CI deploy account | staging | Its own service account with Firebase Admin, Service Account User and Cloud Functions Admin. Never the production key |

A separate staging project keeps production and dev access separate. Nothing in staging can read
production data.

## 4. Isolation, secrets, sample data, clean-up

- **Isolation:** a new project, `siteflow-dp-staging`, in europe-west1. It has its own web, Android and
  iOS app registrations and its own `firebase/functions/.env.siteflow-dp-staging`.
- **Secrets:** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `EMAIL_API_KEY` and `ANTHROPIC_API_KEY` are all
  set to `none`. Messages are then logged as "not set up yet" and never sent; AI overviews fall back to
  plain sentences. Check: no secret on staging may be anything other than `none`.
- **Data:** only the built-in sample projects (Explore with sample data) and made-up test accounts
  (`*@example.com`). Sample projects never send messages, even with real keys. No production or
  customer data is copied.
- **Clean-up:** once the result is written down, delete the backups and restored databases, then
  delete the project (`firebase projects` > Settings > Delete; Google keeps it recoverable for 30
  days). Remove the staging alias and env files from the repo, or keep them for the next rehearsal.

## 5. Code changes needed first

The deploy scripts only know dev and prod.
- Add a `staging` entry to `scripts/fetch-firebase-config.mjs` and `scripts/build-web.mjs`, building
  with `apps/web/.env.staging`.
- Add a `staging` alias to `.firebaserc`, plus `firebase/functions/.env.siteflow-dp-staging` with
  `APP_URL=https://siteflow-dp-staging.web.app` and `ENFORCE_APP_CHECK=false`.

## 6. Rehearsal steps

Record each step's time, the command's output and any surprise in a copy of this file.

**Before you start**
1. Confirm the commit being rehearsed. CI must be green on it.
2. `npx firebase projects:list` shows staging. `npx firebase use` must not point at prod.
3. All four secrets on staging read `none`.

**Launch, exactly as production would be done**
4. Create the database:
   `gcloud firestore databases create --database='(default)' --location=europe-west1 --type=firestore-native --delete-protection --project=siteflow-dp-staging`
5. Turn on point-in-time recovery:
   `gcloud firestore databases update --database='(default)' --enable-pitr --project=siteflow-dp-staging`
6. Add daily backups:
   `gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14w --project=siteflow-dp-staging`
7. Set up Auth (email and password, plus Google) and Storage (europe-west1) in the console.
8. Turn on Storage object versioning, with a rule to delete old versions after 30 days:
   `gcloud storage buckets update gs://<staging bucket> --versioning`
9. Deploy: `pnpm run config:staging`, then
   `npx firebase deploy --only firestore,storage,functions,hosting --project staging`.
   Wait until the indexes show Enabled.

**Check the launch**
10. Sign up as a new owner, create a company, load the sample data, record an expense, void it, and
    record wages for a week.
11. Validation queries:
    - each sample project's `finance/summary.spent` equals the sum of its non-voided expenses (Admin script);
    - every voided expense has a `history` entry with action `voided`;
    - every day of the recorded wage week has `paidBy` set to that expense;
    - no document in `notifications` has status `sent` (nothing left the system).

**Prove recovery**
12. Wait for the first daily backup (or run one by hand:
    `gcloud firestore backups list --project=siteflow-dp-staging`).
13. Restore it into a second database:
    `gcloud firestore databases restore --source-backup=<backup name> --destination-database=restored --project=siteflow-dp-staging`
14. Compare document counts per collection between `(default)` and `restored`, and run the queries
    from step 11 against `restored`.
15. Point-in-time read: delete one test expense with the Admin SDK, then read it back at a time from
    before the deletion (`readTime`). Confirm it is there.
16. Write down how long the restore took. That is the measured recovery time.

**Rollback procedure (written down, and run once)**
17. Functions and rules: redeploy the previous commit (`git checkout <previous> && npx firebase deploy
    --only functions,firestore:rules --project staging`). Time it.
18. Hosting: `npx firebase hosting:rollback --project staging` (Hosting keeps earlier releases).
19. Data: restore from the backup or point-in-time recovery (steps 13–15). Copy back only what was lost.

**Afterwards**
20. Write the results in this file (times, any failures, what to change for production).
21. Clean up (section 4).

Recovery objectives this checks for production: **at most 5 minutes of data lost** (point-in-time
recovery) and **under 4 hours to restore**.

## 7. Dev App Check (monitor only)

**Status:** the web app's code is ready. It reads `VITE_APPCHECK_SITE_KEY` and uses reCAPTCHA
Enterprise. No key exists yet. The mobile app has no App Check. Functions enforcement is off on both
projects (`ENFORCE_APP_CHECK=false`).

**Billing:** dev is on Blaze, so a reCAPTCHA key there is billed on the Premium tier:
- the first 10,000 assessments a month are free;
- dev traffic (a few testers) stays far below that.

Safeguards:
- the $10 budget alert on dev (section 2);
- check reCAPTCHA usage in the console a week after turning it on.

**Steps, once approved:**
1. Console > App Check > the dev web app > reCAPTCHA Enterprise > create a key for
   `siteflow-dp-dev.web.app` and `localhost`.
2. Put the key in `apps/web/.env.development` as `VITE_APPCHECK_SITE_KEY` (it is public, not a
   secret), and in the CI `development` environment as a variable.
3. Build and deploy the web app to dev.
4. **Do not** press Enforce for Firestore, Storage or Functions. Leave `ENFORCE_APP_CHECK=false`.
5. After a week, read App Check > APIs: the share of verified requests per service. Expect web near
   100%, and mobile at 0% (unverified) until it has App Check.

**Effect on older mobile builds:** they send no App Check token. Under enforcement, Firestore and
Storage would refuse them entirely, and every function would refuse them too, except email settings,
which is never enforced. While nothing is enforced, they keep working.

**Proposed rollout:**
1. Web on dev, monitor only.
2. Web on production, monitor only.
3. Functions enforced on production, once web verification is near 100%. Mobile doesn't call the
   protected functions, so this is safe once checked.
4. A mobile release with `@react-native-firebase/app-check` (Play Integrity / App Attest).
5. Wait until about 95% of active devices run that release; older versions are told to update.
6. Firestore and Storage enforced.

## Sources for prices

Checked on 2026-10-10.
- Firestore pricing: https://cloud.google.com/firestore/pricing
- Point-in-time recovery: https://firebase.google.com/docs/firestore/pitr
- reCAPTCHA billing: https://docs.cloud.google.com/recaptcha/docs/billing-information
- reCAPTCHA tiers: https://docs.cloud.google.com/recaptcha/docs/compare-tiers
- App Check with reCAPTCHA Enterprise: https://firebase.google.com/docs/app-check/flutter/recaptcha-enterprise-provider
