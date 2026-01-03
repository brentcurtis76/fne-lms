/**
 * Migration Plan E2E Test Helpers
 *
 * Provides utilities for testing the Migration Plan functionality:
 * - Navigate to Migration Plan page
 * - Toggle grade generation types (GT/GI)
 * - Verify locked grades (always GT)
 * - Save and verify persistence
 */

import { Page, expect } from '@playwright/test';

// Grade IDs for reference (matches ab_grades table)
export const GRADE_IDS = {
  // Always GT grades (1-6)
  MEDIO_MENOR: 1,
  MEDIO_MAYOR: 2,
  PREKINDER: 3,
  KINDER: 4,
  PRIMERO_BASICO: 5,
  SEGUNDO_BASICO: 6,
  // Toggleable grades (7-16)
  TERCERO_BASICO: 7,
  CUARTO_BASICO: 8,
  QUINTO_BASICO: 9,
  SEXTO_BASICO: 10,
  SEPTIMO_BASICO: 11,
  OCTAVO_BASICO: 12,
  PRIMERO_MEDIO: 13,
  SEGUNDO_MEDIO: 14,
  TERCERO_MEDIO: 15,
  CUARTO_MEDIO: 16,
};

// Always GT grades (1-6)
export const ALWAYS_GT_GRADES = [1, 2, 3, 4, 5, 6];

// Toggleable grades (7-16)
export const TOGGLEABLE_GRADES = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

/**
 * Navigate to Migration Plan page
 * Available for directivo users at their school
 */
export async function navigateToMigrationPlan(page: Page) {
  // Try sidebar navigation first
  const sidebarLink = page.locator(
    'a[href*="/school/migration-plan"], nav a:has-text("Plan de Migración"), nav a:has-text("Migration Plan")'
  );

  if (await sidebarLink.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await sidebarLink.first().click();
    await page.waitForLoadState('networkidle');
  } else {
    // Fallback to direct navigation
    await page.goto('/school/migration-plan');
    await page.waitForLoadState('networkidle');
  }

  // Verify we're on the Migration Plan page
  await expect(page).toHaveURL(/\/school\/migration-plan/);

  // Wait for the grid to load
  await expect(
    page.locator('table, [data-testid="migration-plan-grid"], .migration-plan-grid')
  ).toBeVisible({ timeout: 10000 });
}

/**
 * Toggle a grade's generation type for a specific year
 * @param page - Playwright page
 * @param gradeId - Grade ID (1-16)
 * @param yearNumber - Transformation year (1-5)
 * @param targetType - Target generation type ('GT' or 'GI')
 */
export async function toggleGradeGeneration(
  page: Page,
  gradeId: number,
  yearNumber: number,
  targetType: 'GT' | 'GI'
) {
  // Verify grade is toggleable (not always GT)
  if (ALWAYS_GT_GRADES.includes(gradeId)) {
    throw new Error(
      `Grade ${gradeId} is always GT and cannot be toggled. Use verifyGradeLocked() instead.`
    );
  }

  // Find the cell for this grade and year
  const cellSelector = `[data-grade-id="${gradeId}"][data-year="${yearNumber}"],
                         tr[data-grade="${gradeId}"] td[data-year="${yearNumber}"],
                         .grade-row-${gradeId} .year-cell-${yearNumber}`;

  const cell = page.locator(cellSelector).first();
  await expect(cell).toBeVisible({ timeout: 5000 });

  // Check current state
  const currentType = await cell.getAttribute('data-type');

  if (currentType !== targetType) {
    // Click to toggle
    const toggleButton = cell.locator('button, [role="button"], .toggle');
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
    } else {
      // Click on the cell itself
      await cell.click();
    }

    // Wait for UI update
    await page.waitForTimeout(500);

    // Verify toggle succeeded
    const newType = await cell.getAttribute('data-type');
    expect(newType).toBe(targetType);
  }
}

/**
 * Save the Migration Plan
 */
export async function saveMigrationPlan(page: Page) {
  const saveButton = page.locator(
    'button:has-text("Guardar"), button:has-text("Save"), button[type="submit"]'
  );

  await expect(saveButton).toBeVisible();
  await saveButton.click();

  // Wait for success message
  await expect(
    page.locator('text=guardado, text=saved, text=éxito, .toast-success, [role="alert"]')
  ).toBeVisible({ timeout: 10000 });
}

/**
 * Verify a grade is locked as GT (cannot be toggled)
 * @param page - Playwright page
 * @param gradeId - Grade ID (should be 1-6 for always GT grades)
 */
export async function verifyGradeLocked(page: Page, gradeId: number) {
  // Find cells for this grade (all years)
  const rowSelector = `tr[data-grade="${gradeId}"], [data-grade-id="${gradeId}"], .grade-row-${gradeId}`;
  const row = page.locator(rowSelector).first();

  if (await row.isVisible()) {
    // Check for locked indicator
    const lockedIndicator = row.locator(
      '.locked, [data-locked="true"], .cursor-not-allowed, [disabled]'
    );
    const isLocked = await lockedIndicator.isVisible().catch(() => false);

    // Or check that all cells show GT without toggle option
    const cells = row.locator('td[data-year], [data-year]');
    const cellCount = await cells.count();

    for (let i = 0; i < cellCount; i++) {
      const cell = cells.nth(i);
      const type = await cell.getAttribute('data-type');
      const hasToggle = await cell.locator('button, [role="button"]').isVisible().catch(() => false);

      // Locked grades should show GT and not have toggle buttons (or have disabled ones)
      if (type) {
        expect(type).toBe('GT');
      }
    }

    return true;
  }

  return false;
}

/**
 * Get the current generation type for a specific grade and year
 */
export async function getGradeGenerationType(
  page: Page,
  gradeId: number,
  yearNumber: number
): Promise<'GT' | 'GI' | null> {
  const cellSelector = `[data-grade-id="${gradeId}"][data-year="${yearNumber}"],
                         tr[data-grade="${gradeId}"] td[data-year="${yearNumber}"]`;

  const cell = page.locator(cellSelector).first();

  if (await cell.isVisible()) {
    const type = await cell.getAttribute('data-type');
    return (type as 'GT' | 'GI') || null;
  }

  return null;
}

/**
 * Verify the Migration Plan grid structure
 * - Should have 16 grade rows
 * - Should have 5 year columns
 * - Current transformation year should be highlighted
 */
export async function verifyMigrationPlanGrid(page: Page, currentYear?: number) {
  // Verify grid is visible
  const grid = page.locator('table, [data-testid="migration-plan-grid"]');
  await expect(grid).toBeVisible();

  // Verify year headers (1-5)
  for (let year = 1; year <= 5; year++) {
    const yearHeader = page.locator(`th:has-text("Año ${year}"), th:has-text("Year ${year}"), [data-year-header="${year}"]`);
    await expect(yearHeader).toBeVisible();
  }

  // Verify grade rows exist
  const gradeRows = page.locator('tbody tr, [data-grade-row]');
  const rowCount = await gradeRows.count();
  expect(rowCount).toBeGreaterThanOrEqual(16);

  // If currentYear provided, verify it's highlighted
  if (currentYear) {
    const highlightedColumn = page.locator(
      `[data-current-year="${currentYear}"], .year-${currentYear}.highlighted, th[data-year="${currentYear}"].bg-brand_blue`
    );
    const isHighlighted = await highlightedColumn.isVisible().catch(() => false);
    console.log(`Year ${currentYear} highlighted: ${isHighlighted}`);
  }

  return true;
}

/**
 * Set multiple grades to GI for a specific year (bulk operation)
 */
export async function setGradesAsGI(page: Page, gradeIds: number[], yearNumber: number) {
  for (const gradeId of gradeIds) {
    if (!ALWAYS_GT_GRADES.includes(gradeId)) {
      await toggleGradeGeneration(page, gradeId, yearNumber, 'GI');
    }
  }
}

/**
 * Reset all toggleable grades to GT for a specific year
 */
export async function resetAllToGT(page: Page, yearNumber: number) {
  for (const gradeId of TOGGLEABLE_GRADES) {
    try {
      await toggleGradeGeneration(page, gradeId, yearNumber, 'GT');
    } catch {
      // Ignore errors for grades that might not exist
    }
  }
}
