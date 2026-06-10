import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/integration/**/*.spec.ts'],
    testTimeout: 30000,
  },
});
