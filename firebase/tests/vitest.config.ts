import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Security-rule tests. They need the emulators, so run them with `npm run test:rules`.
export default defineConfig({
  resolve: {
    alias: { '@siteflow/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['firebase/tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false, // both files share one emulator
  },
});
