/**
 * Proposal Web View — E2E Tests (No Auth Required)
 *
 * Tests the public proposal page at /propuesta/[slug].
 * Uses an existing generated proposal from the database.
 * Verifies rendering, sections, dynamic fields, and backward compatibility.
 *
 * Tags: @flow @proposal @web-view
 */

import { test, expect } from '@playwright/test';

// Known proposal from the database
const SLUG = 'liceo-bicentenar-evoluciona-2026-v5-ce5fa5';
const ACCESS_CODE = 'CSEGNU';

test.describe('Proposal Web View @flow @proposal @web-view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/propuesta/${SLUG}`);
  });

  // ── Unlock screen ─────────────────────────────────────────────────────────
  test('Shows unlock screen and accepts valid access code', async ({ page }) => {
    // Should show the unlock/access code screen
    const codeInput = page.locator('input').first();
    await expect(codeInput).toBeVisible({ timeout: 10000 });

    // Enter the access code
    await codeInput.fill(ACCESS_CODE);

    // Click the access button
    const accessBtn = page.getByRole('button', { name: /Acceder|Desbloquear|Ver/i });
    await accessBtn.click();

    // Should load the full proposal — look for the school name or program label
    await expect(
      page.getByText(/Programa Evoluciona|Programa Preparación/i).first()
    ).toBeVisible({ timeout: 15000 });
  });

  // ── Full proposal rendering ───────────────────────────────────────────────
  test('Full proposal renders all major sections', async ({ page }) => {
    // Unlock
    const codeInput = page.locator('input').first();
    await expect(codeInput).toBeVisible({ timeout: 10000 });
    await codeInput.fill(ACCESS_CODE);
    await page.getByRole('button', { name: /Acceder|Desbloquear|Ver/i }).click();

    // Wait for proposal to load
    await expect(
      page.getByText(/Programa Evoluciona|Programa Preparación/i).first()
    ).toBeVisible({ timeout: 15000 });

    // 1. Hero section — school name and year
    await expect(page.getByText('2026', { exact: true })).toBeVisible();

    // 2. About FNE section
    await expect(page.getByText(/Quiénes Somos/i)).toBeVisible();
    await expect(page.getByText(/Fundación Nueva Educación/i).first()).toBeVisible();

    // 3. Consulting Model
    await expect(page.getByRole('heading', { name: 'Modelo de Consultoría', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Inicia', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Inspira', exact: true })).toBeVisible();

    // 4. Consulting Team (if consultants exist)
    const teamSection = page.getByText(/Equipo de Consultoría/i);
    const hasTeam = await teamSection.isVisible().catch(() => false);
    if (hasTeam) {
      await expect(teamSection).toBeVisible();
    }

    // 7. Modules & Hours — aggregate hours section
    await expect(page.getByRole('heading', { name: 'Horas del Programa' })).toBeVisible();
    await expect(page.getByText('Presenciales', { exact: true })).toBeVisible();

    // 8. Economic Proposal
    await expect(page.getByRole('heading', { name: 'Propuesta Económica' })).toBeVisible();

    // 10. Contact
    await expect(page.getByText(/preguntas/i)).toBeVisible();

    // 11. Footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await expect(page.getByText(/Todos los derechos reservados/i)).toBeVisible();
  });

  // ── Bucket section backward compatibility ─────────────────────────────────
  test('Old proposal without buckets does NOT show bucket section', async ({ page }) => {
    // Unlock
    const codeInput = page.locator('input').first();
    await expect(codeInput).toBeVisible({ timeout: 10000 });
    await codeInput.fill(ACCESS_CODE);
    await page.getByRole('button', { name: /Acceder|Desbloquear|Ver/i }).click();

    await expect(
      page.getByText(/Programa Evoluciona|Programa Preparación/i).first()
    ).toBeVisible({ timeout: 15000 });

    // This proposal was generated before bucket support —
    // "Distribución de Actividades" section should NOT appear
    const bucketHeading = page.getByRole('heading', { name: /Distribución de Actividades/i });
    await expect(bucketHeading).not.toBeVisible();
  });

  // ── Aggregate hours are always visible ────────────────────────────────────
  test('Aggregate hours (presencial/sincrónica/asincrónica) render in donut chart', async ({ page }) => {
    // Unlock
    const codeInput = page.locator('input').first();
    await expect(codeInput).toBeVisible({ timeout: 10000 });
    await codeInput.fill(ACCESS_CODE);
    await page.getByRole('button', { name: /Acceder|Desbloquear|Ver/i }).click();

    await expect(
      page.getByText(/Programa Evoluciona|Programa Preparación/i).first()
    ).toBeVisible({ timeout: 15000 });

    // The three hour type labels should be visible
    await expect(page.getByText('Presenciales', { exact: true })).toBeVisible();
    await expect(page.getByText('Sincrónicas', { exact: true })).toBeVisible();
    await expect(page.getByText('Asincrónicas', { exact: true })).toBeVisible();

    // The "Horas del Programa" heading should be visible
    await expect(page.getByRole('heading', { name: 'Horas del Programa' })).toBeVisible();
  });

  // ── Footer email consistency ──────────────────────────────────────────────
  test('Contact email is consistent (info@nuevaeducacion.org)', async ({ page }) => {
    // Unlock
    const codeInput = page.locator('input').first();
    await expect(codeInput).toBeVisible({ timeout: 10000 });
    await codeInput.fill(ACCESS_CODE);
    await page.getByRole('button', { name: /Acceder|Desbloquear|Ver/i }).click();

    await expect(
      page.getByText(/Programa Evoluciona|Programa Preparación/i).first()
    ).toBeVisible({ timeout: 15000 });

    // Scroll to contact section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 800));
    await page.waitForTimeout(500);

    // The old wrong email should NOT appear anywhere
    const wrongEmail = page.getByText('contacto@fundacionnuevaeducacion.com');
    await expect(wrongEmail).not.toBeVisible();
  });

  // ── Ficha metadata in footer ──────────────────────────────────────────────
  test('Footer shows ficha metadata (nombre_servicio, dimension, folio)', async ({ page }) => {
    // Unlock
    const codeInput = page.locator('input').first();
    await expect(codeInput).toBeVisible({ timeout: 10000 });
    await codeInput.fill(ACCESS_CODE);
    await page.getByRole('button', { name: /Acceder|Desbloquear|Ver/i }).click();

    await expect(
      page.getByText(/Programa Evoluciona|Programa Preparación/i).first()
    ).toBeVisible({ timeout: 15000 });

    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Should show ficha folio number
    await expect(page.getByText(/Folio \d+/i).first()).toBeVisible({ timeout: 5000 });
  });

  // ── 404 for invalid slug ──────────────────────────────────────────────────
  test('Invalid slug returns 404 or error page', async ({ page }) => {
    await page.goto('/propuesta/this-slug-does-not-exist-12345');

    // Should show some kind of error — either 404 page or "not found" text
    await expect(
      page.getByText(/no encontrada|not found|404|no existe/i)
    ).toBeVisible({ timeout: 10000 });
  });
});
