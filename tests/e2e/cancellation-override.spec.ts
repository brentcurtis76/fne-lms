/**
 * Hour Tracking — Cancellation Admin Override E2E Tests
 *
 * Tests that an admin can override the auto-calculated cancellation clause.
 *
 * QA Scenario: QA-6
 */

import { test, expect } from '@playwright/test';

test.describe('Hour Tracking — Admin Cancellation Override', () => {
  test('QA-6: Admin can change penalizada → devuelta with reason', async ({ page }) => {
    test.skip(true, 'Requires staging environment with seeded penalized session');
  });
});
