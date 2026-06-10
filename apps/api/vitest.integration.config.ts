import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/integration/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    globalSetup: ['./src/integration/global-setup.ts'],
  },
});
