import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for mobile logic. Native modules are mocked in each test file; react-native itself
// (Flow source that Node can't load) is replaced by a small stub.
export default defineConfig({
  resolve: { alias: { 'react-native': fileURLToPath(new URL('./test/stubs/react-native.js', import.meta.url)) } },
  test: { include: ['test/**/*.test.js'], environment: 'node' },
});
