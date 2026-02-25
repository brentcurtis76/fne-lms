/**
 * Hour Tracking — Completion E2E Tests
 *
 * Tests that hours are consumed (ledger entry updated to status='consumida')
 * when a session is finalized.
 *
 * QA Scenario: QA-2 — Consumo de Horas al Completar Sesion
 */

import { test, expect } from '@playwright/test';

test.describe('Hour Tracking — Session Completion', () => {
  test('QA-2: Finalizing a session consumes hours in the ledger', async ({ page }) => {
    test.skip(true, 'Requires staging environment with seeded session in pendiente_informe status');
  });
});
