import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load environment variables - prefer local test environment if it exists
if (!process.env.CI) {
  const localEnvPath = './.env.test.local';
  const testEnvPath = './.env.test';
  
  if (fs.existsSync(localEnvPath)) {
    console.log('Using local Supabase environment from .env.test.local');
    dotenv.config({ path: localEnvPath });
  } else {
    dotenv.config({ path: testEnvPath });
  }
}

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',
    
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Global timeout for actions */
    actionTimeout: 10000,
    
    /* Global timeout for navigation */
    navigationTimeout: 30000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },

    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },

    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },

    },

    /* Test against mobile viewports. */
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    /* Test against branded browsers. */
    {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },

    /* Visual regression testing */
    {
      name: 'visual',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
      testMatch: '**/*.visual.spec.ts',
    },

    /* Performance testing */
    {
      name: 'performance',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
      testMatch: '**/*.perf.spec.ts',
    },

    /* Accessibility testing */
    {
      name: 'accessibility',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/*.a11y.spec.ts',
    },

    /* Role-based testing projects */
    {
      name: 'admin-flows',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/*admin*.spec.ts',
    },
    {
      name: 'consultant-flows',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/*consultant*.spec.ts',
    },
    {
      name: 'student-flows',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/*student*.spec.ts',
    },
  ],

  /* Global setup and teardown - USING SAFE VERSION */
  globalSetup: require.resolve('./e2e/global-setup-safe'),
  globalTeardown: require.resolve('./e2e/global-teardown-safe'),

  /* Run your local dev server before starting the tests */
  webServer: process.env.SKIP_WEB_SERVER ? undefined : {
    command: 'NODE_ENV=test next dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  /* Expect options */
  expect: {
    /* Maximum time expect() should wait for the condition to be met */
    timeout: 5000,
    
    toMatchSnapshot: { maxDiffPixels: 100 },
  },

  /* Output directory for test artifacts */
  outputDir: 'test-results/',
});