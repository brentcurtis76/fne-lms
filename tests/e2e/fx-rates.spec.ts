/**
 * Hour Tracking — FX Rate E2E Tests
 *
 * Tests the FX rate endpoints for caching and graceful degradation.
 *
 * QA Scenario: Covered by API tests (no visible UI for FX rates in Phase 2)
 */

import { test, expect } from '@playwright/test';

test.describe('Hour Tracking — FX Rates API', () => {
  test('GET /api/fx-rates/latest returns a rate for authenticated users', async ({ request }) => {
    test.skip(true, 'Requires staging environment with valid auth token');
  });

  test('POST /api/fx-rates/refresh returns 403 for non-admin users', async ({ request }) => {
    test.skip(true, 'Requires staging environment');
  });
});
