import { defineConfig } from 'vitest/config';
import { BaseSequencer } from 'vitest/node';

class LastSequencer extends BaseSequencer {
  async sort(files) {
    const sorted = await super.sort(files);
    const last = (f) => (f.moduleId ?? f[1] ?? '').toString().replaceAll('\\', '/').endsWith('test/demo.test.js');
    return [...sorted.filter((f) => !last(f)), ...sorted.filter(last)];
  }
}

// Integration tests against the Firebase emulators (npm run test:web from the repo root)
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    fileParallelism: false, // one emulator set; keep the load predictable
    // Loading and removing the sample projects fires a couple of thousand triggers, which the
    // emulator runs one by one: run that file last so other files don't wait behind them
    sequence: { sequencer: LastSequencer },
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
