import { defineConfig } from 'vitest/config';

// Integration tests against the Firebase emulators (npm run test:web from the repo root)
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    fileParallelism: false, // one emulator set; keep the load predictable
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      VITE_USE_EMULATORS: 'true',
      VITE_FB_API_KEY: 'demo-key',
      VITE_FB_AUTH_DOMAIN: 'demo-siteflow.firebaseapp.com',
      VITE_FB_PROJECT_ID: 'demo-siteflow',
      VITE_FB_STORAGE_BUCKET: 'demo-siteflow.appspot.com',
      VITE_FB_APP_ID: 'demo-app',
      // must match firebase.test.json
      VITE_EMULATOR_AUTH_PORT: '19099',
      VITE_EMULATOR_FIRESTORE_PORT: '18080',
      VITE_EMULATOR_STORAGE_PORT: '19199',
      VITE_EMULATOR_FUNCTIONS_PORT: '15001',
    },
  },
});
