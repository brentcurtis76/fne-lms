import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * CI-only overlay for the `fix/p02b-r1` Gate 4 run (.github/workflows/ci.yml selects it on that branch only).
 *
 * Everything in playwright.config.ts is kept as is — testDir, testIgnore, retries, workers, reporters (the JSON
 * report scripts/ci/e2e-mandatory.mjs checks), projects, webServer and the mail outbox. This file sits next to the
 * base config, so every relative path resolves exactly as before. The single addition: Chromium resolves nothing but
 * localhost and 127.0.0.1, the local Supabase stack and the app, so a page cannot fetch production Supabase, fonts or
 * CDN assets. Node processes are held to loopback separately by scripts/ci/egress-guard.cjs.
 */
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    launchOptions: {
      ...base.use?.launchOptions,
      // MAP rules may also apply to IP literals, so the local API origin is excluded explicitly.
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
    },
  },
});
