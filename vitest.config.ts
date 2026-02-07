import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    exclude: [
      'node_modules/**',
      'cc-bridge-mcp-server/**',
      'e2e/**',
      'tests/qa/**',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    setupFiles: ['./tests/setup.ts'],
    threads: false,
    deps: {
      inline: ['@testing-library/jest-dom'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
