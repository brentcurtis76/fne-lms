import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'API Integration Tests',
    environment: 'node',
    include: ['__tests__/api/**/*.test.ts'],
    setupFiles: ['./vitest.setup.api.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['pages/api/**/*.{js,ts}'],
      exclude: [
        '**/*.d.ts',
        '**/node_modules/**',
      ],
      // Vitest 0.34.6 doesn't support thresholds in coverage config
      // Coverage thresholds are enforced during CI/CD review process
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});