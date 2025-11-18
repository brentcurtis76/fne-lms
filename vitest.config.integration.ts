import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'Role-Based Access Integration Tests',
    environment: 'jsdom',
    globals: true,
    include: ['__tests__/integration/**/*.test.{ts,tsx,js,jsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      enabled: false,
      provider: 'v8'
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      'canvas': path.resolve(__dirname, './tests/mocks/canvas.ts'),
    },
  },
});
