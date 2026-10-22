// Grants or removes the platform admin claim (platformAdmin: true) on one login.
// This is the only way the claim is ever set: the app itself can never grant it.
//   node scripts/set-platform-admin.mjs --project <project id> <email> [--off]
// Uses application default credentials (gcloud auth application-default login).
// For the local emulator, set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 and use --project demo-siteflow.
import { createRequire } from 'node:module';

// firebase-admin lives with the functions, not at the repo root
const require = createRequire(new URL('../firebase/functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const args = process.argv.slice(2);
const off = args.includes('--off');
const pi = args.indexOf('--project');
const project = pi >= 0 ? args[pi + 1] : undefined;
const email = args.find((a, i) => !a.startsWith('--') && i !== pi + 1);
if (!project || project.startsWith('--') || !email) {
  console.error('Usage: node scripts/set-platform-admin.mjs --project <project id> <email> [--off]');
  process.exit(2);
}

try {
  initializeApp({ projectId: project });
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  // Merge into the existing claims so nothing else on the login is lost
  const claims = { ...(user.customClaims || {}) };
  if (off) delete claims.platformAdmin;
  else claims.platformAdmin = true;
  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`${off ? 'Removed' : 'Granted'} platform admin for ${email} in ${project}. Claims now:`);
  console.log(claims);
  console.log('Sign out and back in to pick it up.');
} catch (e) {
  console.error(`Failed: ${e.message}`);
  process.exit(1);
}
