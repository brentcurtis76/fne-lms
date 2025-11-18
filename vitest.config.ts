/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      '**/__tests__/**/*.{test,spec}.{js,ts,tsx}',
      '**/tests/**/*.{test,spec}.{js,ts,tsx}'
    ],
    exclude: ['node_modules', 'node_modules.old', '.next', 'mcp-servers/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'components/**/*.{ts,tsx}',
        'pages/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'utils/**/*.{ts,tsx}'
      ],
      exclude: [
        'node_modules',
        '__tests__/**',
        'e2e/**',
        '**/*.d.ts',
        '**/*.config.{ts,js}',
        '**/coverage/**',
        '**/.next/**'
      ],
      // @ts-ignore - Vitest 0.34.6 supports thresholds but TypeScript types don't reflect it
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 80,
        statements: 80
      }
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './') },
      { find: '@/config', replacement: path.resolve(__dirname, './config') },
      { find: '@/components', replacement: path.resolve(__dirname, './components') },
      { find: '@/lib', replacement: path.resolve(__dirname, './lib') },
      { find: '@/types', replacement: path.resolve(__dirname, './types') },
      { find: '@/utils', replacement: path.resolve(__dirname, './utils') },
      { find: /^canvas(\/.*)?$/, replacement: path.resolve(__dirname, './tests/mocks/canvas.ts') },
    ],
  },
});
