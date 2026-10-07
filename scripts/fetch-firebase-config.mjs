// Downloads the Firebase app configuration for one environment into the files the apps read.
// These values identify the project; they are not secrets (security comes from the rules),
// but they are kept out of git so each machine and CI fetches its own.
//   node scripts/fetch-firebase-config.mjs dev|prod
// Needs the Firebase CLI to be signed in to an account with access to the project.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENVS = {
  dev: { project: 'siteflow-dp-dev', webEnv: 'apps/web/.env.development', suffix: 'dev' },
  prod: { project: 'siteflow-dp-prod', webEnv: 'apps/web/.env.production', suffix: 'prod' },
};
const env = ENVS[process.argv[2]];
if (!env) {
  console.error('Usage: node scripts/fetch-firebase-config.mjs dev|prod');
  process.exit(2);
}

// The CLI's own JSON answer decides success. (On Windows, firebase-tools can crash while exiting
// after it has already printed a complete answer; that answer is still good.)
function cli(args) {
  const r = spawnSync(`npx firebase ${args} --project ${env.project} --json`, { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'inherit'] });
  let out;
  try { out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { out = null; }
  if (out?.status !== 'success') throw new Error(`firebase ${args} failed (exit ${r.status}): ${(out?.error || r.stdout || '').toString().slice(0, 300)}`);
  return out.result;
}
const apps = cli('apps:list');
const app = (platform) => {
  const a = apps.find((x) => x.platform === platform);
  if (!a) throw new Error(`No ${platform} app registered in ${env.project}`);
  return a.appId;
};

// Web: VITE_* variables (public by design; nothing secret may ever go in VITE_*)
const web = cli(`apps:sdkconfig WEB ${app('WEB')}`).sdkConfig;
// The App Check site key isn't part of the Firebase config: keep the one already in the file,
// or take it from the environment (CI)
const previous = existsSync(env.webEnv) ? readFileSync(env.webEnv, 'utf8').match(/^VITE_APPCHECK_SITE_KEY=(.*)$/m)?.[1]?.trim() : '';
const appCheckKey = process.env.VITE_APPCHECK_SITE_KEY || previous || '';
const lines = [
  `# ${env.project}: written by scripts/fetch-firebase-config.mjs. Public project identifiers, not secrets.`,
  `VITE_FB_API_KEY=${web.apiKey}`,
  `VITE_FB_AUTH_DOMAIN=${web.authDomain}`,
  `VITE_FB_PROJECT_ID=${web.projectId}`,
  `VITE_FB_STORAGE_BUCKET=${web.storageBucket || `${web.projectId}.firebasestorage.app`}`,
  `VITE_FB_MESSAGING_SENDER_ID=${web.messagingSenderId}`,
  `VITE_FB_APP_ID=${web.appId}`,
  'VITE_USE_EMULATORS=false',
  '# App Check (optional): reCAPTCHA Enterprise site key, see docs/OPERATIONS.md',
  `VITE_APPCHECK_SITE_KEY=${appCheckKey}`,
];
writeFileSync(env.webEnv, `${lines.join('\n')}\n`);
console.log(`Wrote ${env.webEnv}`);

// Mobile: the native config files React Native Firebase reads at build time
const android = cli(`apps:sdkconfig ANDROID ${app('ANDROID')}`);
writeFileSync(`apps/mobile/google-services.${env.suffix}.json`, android.fileContents);
const ios = cli(`apps:sdkconfig IOS ${app('IOS')}`);
writeFileSync(`apps/mobile/GoogleService-Info.${env.suffix}.plist`, ios.fileContents);
console.log(`Wrote apps/mobile/google-services.${env.suffix}.json and GoogleService-Info.${env.suffix}.plist`);
