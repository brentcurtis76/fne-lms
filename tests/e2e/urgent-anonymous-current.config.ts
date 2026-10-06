import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: ['urgent-anonymous-current.spec.ts', 'community-document-links.spec.ts'], workers: 1,
  reporter: [['list'], ['json', { outputFile: '.doclinks/current-acceptance.json' }]],
  use: { ...devices['Desktop Chrome'], baseURL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:55140', acceptDownloads: true },
});
