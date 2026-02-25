/**
 * Hour Tracking — Cancellation E2E Tests
 *
 * Tests that the CancellationDialog correctly evaluates clauses
 * and records the cancellation with the appropriate ledger status.
 *
 * QA Scenarios: QA-3, QA-4, QA-5, QA-7
 */

import { test, expect } from '@playwright/test';

// These tests are stubs — they document the QA scenarios but require
// staging environment with seed data to execute.
test.describe('Hour Tracking — Cancellation', () => {
  test('QA-3: Online session cancelled < 48h by school → clause_2 (penalizada)', async ({ page }) => {
    test.skip(true, 'Requires staging environment with seeded session in programada status');
  });

  test('QA-4: Online session cancelled >= 48h by school → clause_1 (devuelta)', async ({ page }) => {
    test.skip(true, 'Requires staging environment with seeded session in programada status');
  });

  test('QA-5: Presencial session cancelled < 2 weeks by school → clause_4 (penalizada)', async ({ page }) => {
    test.skip(true, 'Requires staging environment with seeded session in programada status');
  });

  test('QA-7: Force majeure cancellation → clause_5 (devuelta, no penalty)', async ({ page }) => {
    test.skip(true, 'Requires staging environment with seeded session in programada status');
  });
});
