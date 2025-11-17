import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'Role-Based Access Integration Tests',
    environment: 'node',
    globals: true,
    include: ['__tests__/integration/**/*.test.{ts,tsx,js,jsx}'],
    setupFiles: [],
    coverage: {
      enabled: false
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
