// Builds the web app for the Firebase project being deployed to. Firebase runs this before a
// hosting deploy (firebase.json predeploy) with GCLOUD_PROJECT set to the target project.
//   siteflow-prod-gh -> vite build (apps/web/.env.production)
//   anything else    -> vite build --mode development (apps/web/.env.development)
// Refuses to build if the env file belongs to a different project, so a dev deploy can never
// ship a web app that talks to production (or the other way round).
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const target = process.env.GCLOUD_PROJECT || process.argv[2];
if (!target) {
  console.error('No target project (GCLOUD_PROJECT). Deploy with: firebase deploy --project dev|prod');
  process.exit(1);
}
const prod = target === 'siteflow-prod-gh';
const mode = prod ? 'production' : 'development';
const file = `apps/web/.env.${mode}`;
if (!existsSync(file)) {
  console.error(`${file} is missing. Run: npm run config:${prod ? 'prod' : 'dev'}`);
  process.exit(1);
}
const projectId = readFileSync(file, 'utf8').match(/^VITE_FB_PROJECT_ID=(.*)$/m)?.[1]?.trim();
if (projectId !== target) {
  console.error(`${file} is for "${projectId}", but this deploy is to "${target}". Stopping.`);
  process.exit(1);
}
if (/^VITE_USE_EMULATORS=true/m.test(readFileSync(file, 'utf8'))) {
  console.error(`${file} has VITE_USE_EMULATORS=true. A deployed app must use the real project.`);
  process.exit(1);
}
console.log(`Building the web app for ${target} (${mode})`);
execSync(`npm run build -w @siteflow/web -- --mode ${mode}`, { stdio: 'inherit' });
