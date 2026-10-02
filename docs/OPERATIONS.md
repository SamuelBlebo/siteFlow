# Running SiteFlow in production

Settings that live in Firebase and Google Cloud rather than in the code. Do these for **siteflow-prod-gh**. Doing them for **siteflow-dev-gh** too is a good rehearsal.

Each step says where to do it. Nothing here is automatic: deploys and console changes are done by a person.

## 1. Before the first real user

### Backups and recovery

**Point-in-time recovery.** This keeps 7 days of every change, so data can be read back as it was at any minute.

```
gcloud firestore databases update --database='(default)' --enable-pitr --project=siteflow-prod-gh
```

**Daily backups, kept for 14 weeks:**

```
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14w --project=siteflow-prod-gh
```

**Storage (photos):**

- Turn on object versioning so a deleted photo can be recovered:

  ```
  gcloud storage buckets update gs://<prod bucket> --versioning
  ```

- Add a lifecycle rule that deletes old versions after 30 days.

**Recovering data:**

- **Restore a backup into a new database.** Use `gcloud firestore databases restore --source-backup=… --destination-database=restored`, then copy back what was lost.
- **Read data as it was at a point in time.** Use PITR, for example via a read at `readTime` with the Admin SDK, or `gcloud firestore export --snapshot-time=…`.
- **Write down every restore** in the incident log (who, when, what was restored).

### Message log expiry (privacy)

Each entry in the message log has an `expireAt` field set 180 days ahead. Switch on the time-to-live policy so Firestore deletes old entries:

```
gcloud firestore fields ttls update expireAt --collection-group=notifications --enable-ttl --project=siteflow-prod-gh
```

### Indexes and rules

Deploy the indexes, Firestore rules and Storage rules together with the functions:

```
firebase deploy --only firestore,storage,functions --project prod
```

- Index builds take a few minutes. Wait until they show **Enabled** (Firebase console > Firestore > Indexes) before you announce a release.
- `packages/shared/test/config.test.ts` checks that every query the apps run has its index.

### Sign-in settings

In the Firebase console, under Authentication > Settings:

- **Email enumeration protection:** on. Sign-in errors then don't reveal whether an email has an account.
- **Password policy:** require at least 8 characters, matching what the app asks for.
- **Authorised domains:** only the production web domain, plus `siteflow-prod-gh.firebaseapp.com`.

### App Check (recommended)

App Check blocks scripts that use a stolen login to call the team functions.

1. Firebase console > App Check > the web app > reCAPTCHA Enterprise. Create a site key for the production domain.
2. Put the key in `apps/web/.env.production` as `VITE_APPCHECK_SITE_KEY` (`npm run config:prod` keeps it), and in CI as a `VITE_APPCHECK_SITE_KEY` variable. It's public, not a secret. Build and deploy the web app.
3. Watch App Check > APIs > Cloud Functions for a few days. When the verified share is close to 100%, set `ENFORCE_APP_CHECK=true` in `firebase/functions/.env.siteflow-prod-gh` and deploy the functions.
4. Leave Firestore and Storage enforcement **off** until the mobile app has App Check too (it needs the `@react-native-firebase/app-check` module and Play Integrity / App Attest).

### Secrets

The functions use Firebase secrets, never files or app settings:

```
firebase functions:secrets:set WHATSAPP_TOKEN --project prod
firebase functions:secrets:set WHATSAPP_PHONE_ID --project prod
firebase functions:secrets:set EMAIL_API_KEY --project prod
```

- Rotate them if anyone who had access leaves.
- Nothing secret goes in `VITE_*` variables or in the repository. A history scan found none.

### Monitoring and cost alerts

**Budget alert.** Google Cloud console > Billing > Budgets. Set an alert at a monthly amount you would notice (for example GH₵ equivalent of $50, then $100).

**Error alerts.** Cloud Monitoring > Alerting. Create a policy on the log-based metric "functions errors":

```
resource.type="cloud_run_revision" severity>=ERROR
```

Send it by email to the owner.

**Which log messages matter:**

- "failed for company" (reminders or summary)
- "WhatsApp send failed" / "Email send failed": phone numbers and emails are scrubbed from these messages
- "Page crashed" (web, browser console only)

## 2. Built into the code

| Area | What is in place |
| --- | --- |
| Access | Firestore and Storage rules enforce roles, sites and companies. Tested in `firebase/tests`, including a sweep of every collection of another company |
| Validation | One set of schemas (`packages/shared/src/schemas.ts`) used by the forms and the functions. The rules check every field again |
| Rate limits | Per-person, per-hour limits on the team functions: sign-up 5, invites 30, password resets 20, other team changes 200 (`firebase/functions/src/limits.ts`) |
| Web headers | Content security policy, no framing, nosniff, a strict referrer policy and a permissions policy. Every app address is no-cache, so updates arrive. Checked by `config.test.ts`; the hosting emulator ignores headers, so also check them once in a browser after the first deploy |
| Crashes | Web and mobile show a "Something went wrong / Reload" screen instead of a blank page. After an update, the web offers a reload |
| Offline | Nothing saved on a phone is lost (see the README, "Working offline") |
| Scheduled jobs | 9-minute limit and one retry. Messages have fixed ids, so a retried run never sends twice. One company failing doesn't stop the others |
| Totals | Spending totals are counted by the server in a transaction. Apps can't write them |
| Logs | No passwords, tokens or full contact details. Provider errors are scrubbed |

## 3. Privacy

**What SiteFlow stores about people:**

- name, email, phone, role and assigned sites (team members)
- foreman and client contacts (site records)
- authorship of reports, issues, materials and expenses

**Who sees it.** Only people in the same company, according to their role. Message logs are visible to owners and admins only. They keep a masked contact (…4567), and the full number or email is removed once the message is handled.

**Removing a person.**

- *Team > Remove* deletes their login and profile.
- Their name stays on the reports and records they made, because those are the company's records of the work.

**Requests for deletion or a copy of someone's data.**

- Handle them from the Firebase console. Export the user's profile, then search reports and issues by `createdBy`.
- Answer within 30 days.
- For Ghana's Data Protection Act, 2012 (Act 843), register with the Data Protection Commission as a data controller before launch.

**Photos.**

- They are taken on site and may show workers.
- They are only visible to the company's own team.

**A privacy policy is required for the app stores (Stage 19).** It should cover:

- what is stored
- why
- who can see it
- how long it is kept
- how to ask for deletion

## 4. If something goes wrong

1. **Bad release.** Roll back:
   - web: Firebase console > Hosting > previous release > Rollback
   - functions: redeploy the previous commit
   - rules: redeploy from the previous commit
2. **Data damaged.** Restore from point-in-time recovery or a backup into a new database (see above). Copy back only what was lost.
3. **Account compromised.** Switch the person off in *Team*, which takes effect at once. Then reset their password. Rotate the secrets if an admin was affected.
4. **Messages failing.** Look at the message log (*Company > Notifications*) and the function logs. Failed messages retry by themselves up to 3 times.
