import { defineConfig, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The outbound-mail outbox the authentication-lifecycle spec reads.
 *
 * `tests/e2e/auth-lifecycle.spec.ts` has to open the link that was ACTUALLY
 * placed in the invitation message — it used to mint its own through the admin
 * API, in a different format from the one the product sends, so the test that
 * was supposed to prove the invitation chain connects proved it for a URL nobody
 * receives.
 *
 * `lib/email/outbox.ts` appends every outbound message here when this variable
 * is set, and REFUSES to do so on a Vercel deployment whatever the variable
 * says. The directory is created here, at config-evaluation time, because the
 * server starts before any test does and `appendFileSync` will not create a
 * missing parent.
 */
const OUTBOX_DIR = join(__dirname, '.e2e-outbox');
mkdirSync(OUTBOX_DIR, { recursive: true });
export const E2E_MAIL_OUTBOX = join(OUTBOX_DIR, 'outbox.jsonl');

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
    // Spread first: Playwright REPLACES the child environment with this object,
    // so omitting process.env would strip the Supabase keys the server needs.
    env: { ...(process.env as Record<string, string>), E2E_MAIL_OUTBOX },
  },
});
