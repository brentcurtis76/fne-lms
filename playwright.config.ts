import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters
   * CI additionally emits a JSON report so scripts/ci/e2e-mandatory.mjs can prove
   * every mandatory spec actually ran (a skipped test reports as a success). It is
   * written under test-results/ — Playwright wipes that directory before the run,
   * never after, whereas the HTML reporter rewrites playwright-report/ at the end. */
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'test-results/e2e-results.json' }],
      ]
    : 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Local: dev server. CI: production server (CI builds beforehand — see .github/workflows/ci.yml) */
  webServer: {
    command: process.env.CI ? 'npm run start' : 'npm run dev:unsafe',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
});
