# Launch checklist: first clients on production

Production (`siteflow-dp-prod`) has never been launched, so there is no data to move. This list
replaces the staging rehearsal in FIRST_LAUNCH_REHEARSAL.md: the database is created with backups and
point-in-time recovery from the start, and recovery is tested once on production before the first
client signs up. Each step says who does it. Nothing on production happens without the owner's go-ahead.

## A. Before launch (owner)

1. **Go-ahead and billing.** Approve the launch and link `siteflow-dp-prod` to billing (Blaze).
   Set a budget alert of $50/month with alerts at 50%, 90% and 100% (Billing > Budgets & alerts).
   Expected cost at pilot size is about $5–25/month, plus email, WhatsApp and AI usage.
2. **Legal details.** Fill in the bracketed details in `apps/web/src/pages/Legal.jsx` (company legal
   name, address, contact email, governing law) and have a lawyer read the Terms of Service and the
   Privacy Policy. If either changes in a way that matters, change `TERMS_VERSION` in
   `packages/shared/src/schemas.ts`.
3. **Data protection.** If you operate from Ghana, register with the Data Protection Commission as
   a data controller (Data Protection Act, 2012, Act 843).
4. **Email.** Create a Resend account, add and verify the sending domain (DNS records), create an
   API key. Decide the sender, e.g. `SiteFlow <reports@your-domain>`.
5. **Domain (optional at launch).** The app works at `https://siteflow-dp-prod.web.app`. A custom
   domain (e.g. `app.your-domain`) can be connected in Firebase Hosting later.
6. **WhatsApp (optional at launch).** Start Meta Business verification now. It can take days to weeks;
   messages go by email until it is done.
7. **Android app (optional at launch).** Create a Google Play developer account ($25). Until the app is
   in the store, foremen use the web app on their phones.

## B. Code (developer)

1. Merge `feat/light-skins` into `main` through a pull request. CI must pass.
2. In `firebase/functions/.env.siteflow-dp-prod`, set `EMAIL_FROM` to the verified sender and
   `APP_URL` to the production address. Commit.

## C. Launch (developer, with the owner's go-ahead)

1. Create the database with delete protection, point-in-time recovery and daily backups:
   ```
   gcloud firestore databases create --database='(default)' --location=europe-west1 --type=firestore-native --delete-protection --project=siteflow-dp-prod
   gcloud firestore databases update --database='(default)' --enable-pitr --project=siteflow-dp-prod
   gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14w --project=siteflow-dp-prod
   ```
2. In the console: Auth with email and password plus Google, and the production domain in
   Authorised domains. Storage in europe-west1, with object versioning:
   `gcloud storage buckets update gs://<prod bucket> --versioning`.
3. **Let Storage read the database (cross-service rules).** The storage rules look up each person's role in
   Firestore, which only works once Storage's service account has the role *Firebase Rules Firestore Service
   Agent*. Without it every upload (report photos, drawings, project images, 3D models) fails with
   `storage/unauthorized`. Grant it in the console: IAM & Admin > IAM > Grant access, principal
   `service-<project number>@gcp-sa-firebasestorage.iam.gserviceaccount.com`, role *Firebase Rules Firestore
   Service Agent*. (The Firebase CLI offers this on an interactive `firebase deploy --only storage`; a
   non-interactive deploy skips it.)
4. Secrets: `EMAIL_API_KEY` (Resend), `ANTHROPIC_API_KEY` (or `none`), `WHATSAPP_TOKEN` and
   `WHATSAPP_PHONE_ID` (`none` until WhatsApp is verified). See OPERATIONS.md.
5. Deploy with the **Deploy to production** workflow (Actions tab, type "deploy production"). It
   only deploys a `main` commit that passed CI, waits for an approver and tags the release.
6. Wait until the Firestore indexes show Enabled.

## D. Check before the first client (developer)

1. Sign up as a test owner, load the sample data, send a report with photos, invite a test foreman
   and check that the email arrives. Upload a programme and a 3D model.
2. Confirm the company document records the Terms version (`terms.version`).
3. Run one backup by hand, restore it into a second database, compare document counts, then delete
   the copy. Record how long the restore took.
4. Remove the test company and its sample data.

## E. First clients

- Onboard one or two friendly companies first. Sit with each owner while they create their company,
  add one project and invite their foreman.
- Watch the error logs (Functions > Logs) and the budget for the first two weeks.
- Rollback if needed: redeploy the previous `prod-…` tag with the workflow; `firebase hosting:rollback`
  for the web app; point-in-time recovery for data.
