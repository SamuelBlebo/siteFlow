import { defineConfig } from 'vitest/config';

// Integration tests against the Firebase emulators (npm run test:web from the repo root)
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      VITE_USE_EMULATORS: 'true',
      VITE_FB_API_KEY: 'demo-key',
      VITE_FB_AUTH_DOMAIN: 'demo-siteflow.firebaseapp.com',
      VITE_FB_PROJECT_ID: 'demo-siteflow',
      VITE_FB_STORAGE_BUCKET: 'demo-siteflow.appspot.com',
      VITE_FB_APP_ID: 'demo-app',
    },
  },
});
