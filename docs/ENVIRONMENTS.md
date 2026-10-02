# SiteFlow environments

Two Firebase projects on the same account, kept completely apart:

| | Development | Production |
| --- | --- | --- |
| Project id | `siteflow-dev-gh` | `siteflow-prod-gh` |
| Console | https://console.firebase.google.com/project/siteflow-dev-gh | https://console.firebase.google.com/project/siteflow-prod-gh |
| Web address | https://siteflow-dev-gh.web.app | https://siteflow-prod-gh.web.app (a custom domain can be added later) |
| Apps registered | Web, Android and iOS `com.digitalprime.siteflow.dev` | Web, Android and iOS `com.digitalprime.siteflow` |
| Data | Test companies only | Real companies only |

Region: **europe-west1 (Belgium)**, for both Firestore and Functions, and for both projects.

- It is the nearest Google region to Ghana by network: Ghana's internet traffic is routed through Europe.
- Firestore's location can never be changed once the database is created.

## Done already (from the code side)

- Both projects are created, with the web, Android and iOS apps registered.
- `.firebaserc` has the aliases `dev` and `prod`.
- The config files for both projects are downloaded:
  - `npm run config:dev` / `config:prod` writes them
  - `npm run check:env` verifies them
- Function settings per project live in `firebase/functions/.env.<project>`. They are not secret, so they are committed.
- Deploys build the web app for the target project and stop on any mismatch.
- `npm run emulators` and every test use the offline `demo-siteflow` project.

## To do in the console (once per project)

Do these for **siteflow-dev-gh** now. Do them for **siteflow-prod-gh** when you are ready to launch.

1. **Blaze plan.** Console > Usage and billing > Modify plan > Blaze, then pick a billing account. Cloud Functions, Storage and scheduled jobs need it.
   - Set a budget alert at the same time (Stage 16, `docs/OPERATIONS.md`).
   - At SiteFlow's size, most usage fits in the free amounts that come with Blaze.
2. **Firestore.** Build > Firestore Database > Create database.
   - Pick **Standard edition**.
   - Location: **europe-west1 (Belgium)**.
   - Start in **production mode**. Our rules replace the default ones on the first deploy.
3. **Authentication.** Build > Authentication > Get started > Sign-in method > **Email/Password** > Enable. Leave "Email link" off.
   - Settings: turn on **Email enumeration protection** and set the password policy to a minimum of 8 characters.
4. **Storage.** Build > Storage > Get started.
   - Location: **europe-west1**.
   - Start in **production mode**. This needs Blaze, from step 1.
5. **Hosting.** Build > Hosting > Get started. You can skip the CLI steps the wizard shows; the repo is already set up.

Then tell me, and I'll deploy everything to dev and check it end to end. Or deploy it yourself:

```
npm run deploy:dev
```

## Secrets (not needed to start)

Without these, messages are logged as "not set up yet" instead of being sent. Set them when you have the accounts:

```
npx firebase functions:secrets:set WHATSAPP_TOKEN --project dev
npx firebase functions:secrets:set WHATSAPP_PHONE_ID --project dev
npx firebase functions:secrets:set EMAIL_API_KEY --project dev
```

- `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID` come from Meta Business > WhatsApp > API setup.
- `EMAIL_API_KEY` comes from Resend > API keys.
- Use test numbers, or a separate WhatsApp test number, for dev.
- Production gets its own values.

## CI deploys (Stage 18)

The manual "Deploy web and backend" workflow needs a GitHub secret named `FIREBASE_SERVICE_ACCOUNT` for each environment (GitHub > Settings > Environments > development / production). Its value is a service-account key for that project.

## Production rules

- **Production is only deployed when asked** (`npm run deploy:prod`, or the workflow with target `prod`).
- **No experiments on production.** New features are tried on dev with test companies.
- **Changes reach production in this order:** tests pass in CI, then they are deployed to dev and checked, then to production.
