// Bundles the functions and the shared package into lib/index.js.
// Firebase deploys this folder on its own, so @siteflow/shared must be bundled in, not installed.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['firebase-admin', 'firebase-functions'],
  // shared imports zod: fall back to this folder's node_modules if the root isn't installed
  nodePaths: [fileURLToPath(new URL('./node_modules', import.meta.url))],
  alias: { '@siteflow/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
});
console.log('Built lib/index.js');
