// Checks that each environment's configuration is complete and points at the right project.
//   npm run check:env            (both)      node scripts/check-env.mjs dev
// Offline: it reads local files only. Exit code 1 if anything is wrong.
import { existsSync, readFileSync } from 'node:fs';

const ENVS = {
  dev: { project: 'siteflow-dev-gh', web: 'apps/web/.env.development', mobile: 'dev', pkg: 'com.digitalprime.siteflow.dev' },
  prod: { project: 'siteflow-prod-gh', web: 'apps/web/.env.production', mobile: 'prod', pkg: 'com.digitalprime.siteflow' },
};
const which = process.argv[2] ? [process.argv[2]] : Object.keys(ENVS);
const WEB_KEYS = ['VITE_FB_API_KEY', 'VITE_FB_AUTH_DOMAIN', 'VITE_FB_PROJECT_ID', 'VITE_FB_STORAGE_BUCKET', 'VITE_FB_MESSAGING_SENDER_ID', 'VITE_FB_APP_ID'];
const SECRET_NAME = /SECRET|TOKEN|PRIVATE|PASSWORD|SERVICE_ACCOUNT|WHATSAPP|EMAIL_API/i;
let problems = 0;
const bad = (env, msg) => { problems++; console.log(`  x ${msg}`); };
const ok = (msg) => console.log(`  ok ${msg}`);
const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).filter((l) => /^\s*[A-Z_]+=/.test(l)).map((l) => [l.split('=')[0].trim(), l.slice(l.indexOf('=') + 1).trim()]));

const rc = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects;
for (const name of which) {
  const e = ENVS[name];
  if (!e) { console.error(`Unknown environment "${name}"`); process.exit(2); }
  console.log(`${name} (${e.project})`);
  if (rc[name] === e.project) ok(`.firebaserc alias "${name}"`); else bad(name, `.firebaserc alias "${name}" should be ${e.project}`);

  // Web
  if (!existsSync(e.web)) bad(name, `${e.web} missing (npm run config:${name})`);
  else {
    const v = parseEnv(readFileSync(e.web, 'utf8'));
    const missing = WEB_KEYS.filter((k) => !v[k]);
    if (missing.length) bad(name, `${e.web} is missing ${missing.join(', ')}`); else ok(`${e.web} complete`);
    if (v.VITE_FB_PROJECT_ID && v.VITE_FB_PROJECT_ID !== e.project) bad(name, `${e.web} is for ${v.VITE_FB_PROJECT_ID}`);
    if (v.VITE_USE_EMULATORS === 'true') bad(name, `${e.web} has VITE_USE_EMULATORS=true`);
    const leaked = Object.keys(v).filter((k) => k.startsWith('VITE_') && SECRET_NAME.test(k));
    if (leaked.length) bad(name, `${e.web}: ${leaked.join(', ')} looks like a secret. VITE_* values are public; never put secrets there`);
  }

  // Mobile
  const json = `apps/mobile/google-services.${e.mobile}.json`;
  const plist = `apps/mobile/GoogleService-Info.${e.mobile}.plist`;
  if (!existsSync(json)) bad(name, `${json} missing (npm run config:${name})`);
  else {
    const g = JSON.parse(readFileSync(json, 'utf8'));
    const pkgs = g.client?.map((c) => c.client_info?.android_client_info?.package_name) || [];
    if (g.project_info?.project_id !== e.project) bad(name, `${json} is for ${g.project_info?.project_id}`);
    else if (!pkgs.includes(e.pkg)) bad(name, `${json} has no app ${e.pkg}`);
    else ok(`${json} (${e.pkg})`);
  }
  if (!existsSync(plist)) bad(name, `${plist} missing (npm run config:${name})`);
  else {
    const p = readFileSync(plist, 'utf8');
    if (!p.includes(`<string>${e.project}</string>`)) bad(name, `${plist} is not for ${e.project}`);
    else if (!p.includes(`<string>${e.pkg}</string>`)) bad(name, `${plist} has no app ${e.pkg}`);
    else ok(`${plist} (${e.pkg})`);
  }

  // Functions
  const fnEnv = `firebase/functions/.env.${e.project}`;
  if (!existsSync(fnEnv)) bad(name, `${fnEnv} missing`);
  else {
    const v = parseEnv(readFileSync(fnEnv, 'utf8'));
    const secretish = Object.keys(v).filter((k) => SECRET_NAME.test(k) && !['WHATSAPP_TEMPLATE_LANGUAGE'].includes(k));
    if (secretish.length) bad(name, `${fnEnv}: ${secretish.join(', ')} must be a Firebase secret, not in this file`);
    else if (!v.APP_URL) bad(name, `${fnEnv}: APP_URL is not set`);
    else ok(`${fnEnv} (APP_URL ${v.APP_URL})`);
  }
}
console.log(problems ? `\n${problems} problem(s).` : '\nAll configuration present and pointing at the right projects.');
process.exit(problems ? 1 : 0);
