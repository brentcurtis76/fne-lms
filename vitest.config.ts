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
    exclude: ['node_modules', '.next'],
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
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 80,
          statements: 80
        }
      }
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@/config': path.resolve(__dirname, './config'),
      '@/components': path.resolve(__dirname, './components'),
      '@/lib': path.resolve(__dirname, './lib'),
      '@/types': path.resolve(__dirname, './types'),
      '@/utils': path.resolve(__dirname, './utils'),
    },
  },
});
