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
      // @ts-ignore - Vitest 0.34.6 supports thresholds but TypeScript types don't reflect it
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './') },
      { find: /^canvas(\/.*)?$/, replacement: path.resolve(__dirname, './tests/mocks/canvas.ts') },
    ],
  },
});
