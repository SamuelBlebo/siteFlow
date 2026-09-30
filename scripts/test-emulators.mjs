// Runs a command against SiteFlow's test emulators (firebase.test.json ports) with a
// temp folder of its own. Emulators on the same machine otherwise share one temp folder
// (the Storage emulator keeps uploads there), and another project's emulators can delete
// our files mid-test.
//   node scripts/test-emulators.mjs <emulators> "<command>"
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const [only, command] = process.argv.slice(2);
if (!only || !command) {
  console.error('Usage: node scripts/test-emulators.mjs <emulators> "<command>"');
  process.exit(2);
}
const tmp = resolve('.emulator-tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// One command string, with the inner command quoted (works in cmd.exe and sh)
const line = `npx firebase emulators:exec --config firebase.test.json --only ${only} --project demo-siteflow ${JSON.stringify(command)}`;
const child = spawn(line, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp },
});
child.on('exit', (code) => {
  rmSync(tmp, { recursive: true, force: true });
  process.exit(code ?? 1);
});
