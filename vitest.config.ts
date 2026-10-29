import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['core/tests/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
