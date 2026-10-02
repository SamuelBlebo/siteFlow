import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Tests for the scheduled jobs (reminders, weekly summary, retries), run against the Firestore
// emulator with `npm run test:functions`. Test mode: no message leaves the machine.
export default defineConfig({
  resolve: {
    alias: { '@siteflow/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['firebase/functions/test/**/*.test.ts'],
    testTimeout: 30000,
    fileParallelism: false,
    env: { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-siteflow' },
  },
});
