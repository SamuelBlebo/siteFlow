// PNG copies of the sample drawings (the phone app can't show SVG), at twice the sheet size so they
// stay sharp when zoomed. Needs Chrome (or set CHROME to its path).   node scripts/demo-drawings-png.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/web/public/demo/plans');
const chrome = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(existsSync);
if (!chrome) throw new Error('Chrome not found: set CHROME to its path.');

for (const f of readdirSync(dir).filter((x) => x.endsWith('.svg'))) {
  const png = resolve(dir, f.replace(/\.svg$/, '.png'));
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=1680,1188',
    `--screenshot=${png}`, pathToFileURL(resolve(dir, f)).href], { stdio: 'ignore' });
  console.log(`Wrote ${png}`);
}
