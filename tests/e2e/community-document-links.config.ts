import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'community-document-links.spec.ts', workers: 1,
  reporter: [['list'], ['json', { outputFile: '.doclinks/e2e-results.json' }]],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:55140', acceptDownloads: true },
});
