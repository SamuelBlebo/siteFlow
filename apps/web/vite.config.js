import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React and Firebase change rarely, so they get their own files: after an app update the
// browser keeps its cached copy and only downloads the (small) app code again.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Storage is loaded on demand (photo uploads), so it stays out of the main Firebase file
          if (/[\/]@?firebase[\/]storage/.test(id)) return 'firebase-storage';
          if (/[\/]@?firebase[\/]app-check/.test(id)) return 'firebase-app-check'; // only when App Check is switched on
          if (id.includes('@firebase') || /[\/]firebase[\/]/.test(id)) return 'firebase';
          if (/node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler)[\/]/.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
  },
});
