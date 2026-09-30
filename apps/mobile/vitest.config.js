import { defineConfig } from 'vitest/config';

// Unit tests for mobile logic. Native modules are mocked in each test file.
export default defineConfig({
  test: { include: ['test/**/*.test.js'], environment: 'node' },
});
