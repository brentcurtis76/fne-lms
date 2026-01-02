/**
 * Assessment Builder E2E Test Helpers
 *
 * Provides utilities for testing the assessment builder vertical slice:
 * - Admin template creation
 * - Directivo transversal context and docente assignment
 * - Docente response form and results
 */

import { Page, expect } from '@playwright/test';

// Test data constants - ALL use TEST_QA_ prefix for easy cleanup
export const TEST_TEMPLATE = {
  name: 'TEST_QA_Template_Personalizacion',
  description: 'Template de prueba para E2E tests del Assessment Builder',
  area: 'personalizacion',
};

export const TEST_MODULE = {
  name: 'TEST_QA_Modulo_Principal',
  description: 'Modulo de prueba con indicadores de los tres tipos',
};

export const TEST_INDICATORS = {
  cobertura: {
    name: 'TEST_QA_Indicador_Cobertura',
    description: 'Indicador de prueba tipo cobertura (Sí/No): ¿Existe una política de personalización?',
    category: 'cobertura',
    code: 'TEST_QA_COB_001',
  },
  frecuencia: {
    name: 'TEST_QA_Indicador_Frecuencia',
    description: 'Indicador de prueba tipo frecuencia: ¿Cuántas veces por semestre se realizan evaluaciones personalizadas?',
    category: 'frecuencia',
    unit: 'veces por semestre',
    code: 'TEST_QA_FRE_001',
  },
  profundidad: {
    name: 'TEST_QA_Indicador_Profundidad',
    description: 'Indicador de prueba tipo profundidad: Nivel de madurez en personalización',
    category: 'profundidad',
    code: 'TEST_QA_PRO_001',
    descriptors: {
      level_0: 'No existe ninguna práctica de personalización',
      level_1: 'Práctica inicial: Se reconoce la necesidad pero no hay implementación',
      level_2: 'En desarrollo: Existen iniciativas aisladas sin sistematización',
      level_3: 'Práctica avanzada: Hay procesos sistematizados con seguimiento',
      level_4: 'Práctica consolidada: La personalización está integrada en toda la cultura escolar',
    },
  },
};

// Test users - must match qa-seed-users.js
export const TEST_QA_USERS = {
  admin: {
    email: 'test_qa_admin@test.com',
    password: 'TestQA2025!',
    role: 'admin',
  },
  directivo: {
    email: 'test_qa_directivo@test.com',
    password: 'TestQA2025!',
    role: 'directivo',
  },
  docente: {
    email: 'test_qa_docente@test.com',
    password: 'TestQA2025!',
    role: 'docente',
  },
};

// Test school
export const TEST_QA_SCHOOL = {
  name: 'TEST_QA_School',
};

// ============================================================
// ADMIN HELPERS
// ============================================================

/**
 * Navigate to Assessment Builder admin page
 * Uses sidebar navigation to maintain auth session
 */
export async function navigateToAssessmentBuilder(page: Page) {
  // First try sidebar navigation to maintain session
  const sidebarLink = page.locator('a[href*="/admin/assessment-builder"], nav a:has-text("Evaluaciones"), nav a:has-text("Constructor")');

  if (await sidebarLink.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await sidebarLink.first().click();
    await page.waitForLoadState('networkidle');
  } else {
    // Fallback to direct navigation if sidebar not visible
    await page.goto('/admin/assessment-builder');
    await page.waitForLoadState('networkidle');
  }

  // Wait for page to fully render - check for Assessment Builder heading or content
  const pageReady = await Promise.race([
    page.waitForSelector('main h1, [role="main"] h1', { timeout: 10000 }).then(() => true),
    page.waitForSelector('text=Constructor de Evaluaciones', { timeout: 10000 }).then(() => true),
    page.waitForURL(/\/login/).then(() => false), // Catch redirect to login
  ]).catch(() => false);

  if (!pageReady) {
    // Check if we got redirected to login
    if (page.url().includes('/login')) {
      throw new Error('Session lost during navigation to Assessment Builder');
    }
  }

  // Look for h1 in main content area or title text
  const heading = page.locator('main h1, [role="main"] h1').first();
  const title = page.locator('text=Constructor de Evaluaciones');

  // Either heading or title should be visible
  const isVisible = await heading.isVisible().catch(() => false) ||
                    await title.isVisible().catch(() => false);

  if (!isVisible) {
    throw new Error('Could not find Assessment Builder page heading');
  }
}

/**
 * Create a new template
 */
export async function createTemplate(page: Page, template = TEST_TEMPLATE) {
  console.log('📝 createTemplate: Starting, current URL:', page.url());

  // Navigate via UI to maintain session (not direct goto)
  await navigateToAssessmentBuilder(page);
  console.log('📝 createTemplate: After navigateToAssessmentBuilder, URL:', page.url());

  // Click "Nuevo Template" link - use navigation promise
  const nuevoTemplateLink = page.locator('a[href="/admin/assessment-builder/create"]');
  await expect(nuevoTemplateLink).toBeVisible();
  console.log('📝 createTemplate: Found Nuevo Template link, clicking...');

  await Promise.all([
    page.waitForURL(/\/admin\/assessment-builder\/create/),
    nuevoTemplateLink.click(),
  ]);

  await page.waitForLoadState('networkidle');
  console.log('📝 createTemplate: After navigation, URL:', page.url());

  // Wait for page to fully load (auth check completes)
  await page.waitForTimeout(2000);

  // Check if we got redirected to login
  if (page.url().includes('/login')) {
    throw new Error('Session lost during navigation to create page');
  }

  // Wait for form to be visible
  const nameInput = page.locator('input[name="name"], input[placeholder*="nombre"], input[id="name"]');
  await expect(nameInput).toBeVisible({ timeout: 10000 });

  // Fill template form
  await nameInput.fill(template.name);

  // Select area
  const areaSelect = page.locator('select[name="area"], [data-testid="area-select"]');
  if (await areaSelect.isVisible()) {
    await areaSelect.selectOption(template.area);
  } else {
    // Try clicking on area card/button
    await page.click(`text=${template.area}, [data-area="${template.area}"]`);
  }

  // Fill description if field exists
  const descField = page.locator('textarea[name="description"], input[name="description"]');
  if (await descField.isVisible()) {
    await descField.fill(template.description);
  }

  // Submit form
  await page.click('button[type="submit"], button:has-text("Crear"), button:has-text("Guardar")');

  // Wait for redirect to template editor
  await page.waitForURL(/\/admin\/assessment-builder\/[a-f0-9-]+/);

  // Return template ID from URL
  const url = page.url();
  const templateId = url.match(/\/admin\/assessment-builder\/([a-f0-9-]+)/)?.[1];

  return templateId;
}

/**
 * Add a module to the current template
 */
export async function addModule(page: Page, module = TEST_MODULE) {
  // Click add module button
  await page.click('button:has-text("Agregar Módulo"), button:has-text("Nuevo Módulo"), button:has-text("+ Módulo")');

  // Wait for modal/form
  await page.waitForSelector('input[name="name"], input[placeholder*="módulo"]', { timeout: 5000 });

  // Fill module form
  await page.fill('input[name="name"], input[placeholder*="módulo"]', module.name);

  const descField = page.locator('textarea[name="description"], input[name="description"]');
  if (await descField.isVisible()) {
    await descField.fill(module.description);
  }

  // Submit
  await page.click('button:has-text("Guardar"), button:has-text("Crear"), button[type="submit"]');

  // Wait for module to appear
  await expect(page.locator(`text=${module.name}`)).toBeVisible({ timeout: 5000 });
}

/**
 * Add an indicator to the first module
 */
export async function addIndicator(
  page: Page,
  indicator: typeof TEST_INDICATORS.cobertura | typeof TEST_INDICATORS.frecuencia | typeof TEST_INDICATORS.profundidad
) {
  // Expand first module if collapsed
  const moduleHeader = page.locator('[data-testid="module-header"], .module-header').first();
  const isExpanded = await moduleHeader.getAttribute('data-expanded');
  if (isExpanded === 'false') {
    await moduleHeader.click();
  }

  // Click add indicator button
  await page.click('button:has-text("Agregar"), button:has-text("+ Indicador")');

  // Wait for modal
  await page.waitForSelector('input[name="name"]', { timeout: 5000 });

  // Fill indicator form
  await page.fill('input[name="name"]', indicator.name);

  // Select category
  const categorySelect = page.locator('select[name="category"]');
  if (await categorySelect.isVisible()) {
    await categorySelect.selectOption(indicator.category);
  }

  // Category-specific fields
  if (indicator.category === 'frecuencia' && 'unit' in indicator) {
    const unitField = page.locator('input[name="unit"], input[placeholder*="unidad"]');
    if (await unitField.isVisible()) {
      await unitField.fill(indicator.unit);
    }
  }

  if (indicator.category === 'profundidad' && 'descriptors' in indicator) {
    // Fill level descriptors
    const descriptors = indicator.descriptors;
    for (let level = 0; level <= 4; level++) {
      const key = `level_${level}` as keyof typeof descriptors;
      const field = page.locator(`textarea[name="level_${level}_descriptor"], input[name="level_${level}_descriptor"]`);
      if (await field.isVisible()) {
        await field.fill(descriptors[key]);
      }
    }
  }

  // Submit
  await page.click('button:has-text("Guardar"), button[type="submit"]');

  // Wait for indicator to appear
  await expect(page.locator(`text=${indicator.name}`)).toBeVisible({ timeout: 5000 });
}

/**
 * Set year expectations for indicators
 */
export async function setExpectations(page: Page, templateId: string) {
  await page.goto(`/admin/assessment-builder/${templateId}/expectations`);
  await page.waitForLoadState('networkidle');

  // Wait for expectations matrix to load
  await expect(page.locator('table, [data-testid="expectations-matrix"]')).toBeVisible({ timeout: 10000 });

  // Set expectations for first indicator (Year 1 = 1, Year 2 = 2, etc.)
  const inputs = page.locator('input[type="number"]');
  const count = await inputs.count();

  for (let i = 0; i < Math.min(count, 5); i++) {
    await inputs.nth(i).fill(String(Math.min(i + 1, 4)));
  }

  // Save
  await page.click('button:has-text("Guardar")');

  // Wait for success message
  await expect(page.locator('text=guardado, text=éxito, .toast-success')).toBeVisible({ timeout: 5000 });
}

/**
 * Publish a template
 */
export async function publishTemplate(page: Page, templateId: string) {
  await page.goto(`/admin/assessment-builder/${templateId}`);
  await page.waitForLoadState('networkidle');

  // Click publish button
  await page.click('button:has-text("Publicar")');

  // Confirm if there's a confirmation dialog
  const confirmBtn = page.locator('button:has-text("Confirmar"), button:has-text("Sí")');
  if (await confirmBtn.isVisible({ timeout: 2000 })) {
    await confirmBtn.click();
  }

  // Wait for success and status change
  await expect(page.locator('text=publicado, text=Published, .badge-published')).toBeVisible({ timeout: 10000 });
}

// ============================================================
// DIRECTIVO HELPERS
// ============================================================

/**
 * Navigate to transversal context page
 */
export async function navigateToTransversalContext(page: Page) {
  await page.goto('/school/transversal-context');
  await page.waitForLoadState('networkidle');
}

/**
 * Complete the transversal questionnaire (P1-P5, P11)
 */
export async function completeTransversalQuestionnaire(page: Page) {
  await page.goto('/school/transversal-context/edit');
  await page.waitForLoadState('networkidle');

  // P1: Total students
  const p1Input = page.locator('input[name="total_students"], input[data-question="P1"]');
  if (await p1Input.isVisible()) {
    await p1Input.fill('500');
  }

  // P2: Grade levels - select a few levels
  const gradeLevelCheckboxes = page.locator('input[type="checkbox"][name*="grade"], [data-question="P2"] input');
  const count = await gradeLevelCheckboxes.count();
  for (let i = 0; i < Math.min(count, 3); i++) {
    await gradeLevelCheckboxes.nth(i).check();
  }

  // P3: Courses per level - auto-filled based on P2, just verify it's there
  await expect(page.locator('[data-question="P3"], text=cursos')).toBeVisible({ timeout: 3000 }).catch(() => {});

  // P5: Implementation year
  const yearSelect = page.locator('select[name="implementation_year"], [data-question="P5"] select');
  if (await yearSelect.isVisible()) {
    await yearSelect.selectOption('3'); // Year 3
  }

  // P11: Period system
  const periodSelect = page.locator('select[name="period_system"], [data-question="P11"] select');
  if (await periodSelect.isVisible()) {
    await periodSelect.selectOption('semestral');
  }

  // Save
  await page.click('button:has-text("Guardar"), button[type="submit"]');

  // Wait for success
  await expect(page.locator('text=guardado, text=éxito, .toast-success')).toBeVisible({ timeout: 5000 });
}

/**
 * Assign a docente to a course
 */
export async function assignDocenteToCourse(page: Page) {
  await page.goto('/school/transversal-context');
  await page.waitForLoadState('networkidle');

  // Find a course without assignment and click assign button
  const assignBtn = page.locator('button:has-text("Asignar")').first();
  await assignBtn.click();

  // Wait for modal with docente dropdown
  await page.waitForSelector('select, [data-testid="docente-select"]', { timeout: 5000 });

  // Select a docente from dropdown
  const docenteSelect = page.locator('select:has-text("Seleccionar"), [data-testid="docente-select"]');
  const options = await docenteSelect.locator('option').all();
  if (options.length > 1) {
    await docenteSelect.selectOption({ index: 1 }); // Select first available docente
  }

  // Confirm assignment
  await page.click('button:has-text("Asignar"), button:has-text("Confirmar")');

  // Wait for success
  await expect(page.locator('text=asignado, text=éxito')).toBeVisible({ timeout: 5000 });
}

// ============================================================
// DOCENTE HELPERS
// ============================================================

/**
 * Navigate to docente assessments list
 */
export async function navigateToDocenteAssessments(page: Page) {
  await page.goto('/docente/assessments');
  await page.waitForLoadState('networkidle');
}

/**
 * Open the first pending assessment
 */
export async function openFirstAssessment(page: Page): Promise<string | null> {
  await navigateToDocenteAssessments(page);

  // Click on first pending assessment
  const assessmentCard = page.locator('[data-status="pending"], .assessment-card').first();

  if (await assessmentCard.isVisible()) {
    await assessmentCard.click();
    await page.waitForURL(/\/docente\/assessments\/[a-f0-9-]+/);

    const url = page.url();
    const instanceId = url.match(/\/docente\/assessments\/([a-f0-9-]+)/)?.[1];
    return instanceId || null;
  }

  return null;
}

/**
 * Respond to an indicator based on its category
 */
export async function respondToIndicator(
  page: Page,
  category: 'cobertura' | 'frecuencia' | 'profundidad',
  value: boolean | number
) {
  const indicatorContainer = page.locator(`[data-category="${category}"]`).first();

  switch (category) {
    case 'cobertura':
      // Toggle yes/no
      const btn = value ? 'Sí' : 'No';
      await indicatorContainer.locator(`button:has-text("${btn}")`).click();
      break;

    case 'frecuencia':
      // Enter numeric value
      await indicatorContainer.locator('input[type="number"]').fill(String(value));
      break;

    case 'profundidad':
      // Select level (0-4)
      const levelBtn = indicatorContainer.locator(`button[data-level="${value}"], [data-value="${value}"]`);
      if (await levelBtn.isVisible()) {
        await levelBtn.click();
      } else {
        // Try radio buttons or select
        const select = indicatorContainer.locator('select');
        if (await select.isVisible()) {
          await select.selectOption(String(value));
        }
      }
      break;
  }
}

/**
 * Complete all indicators in the assessment form
 */
export async function completeAllIndicators(page: Page) {
  // Expand all modules
  const moduleHeaders = page.locator('[data-testid="module-header"], .module-header');
  const headerCount = await moduleHeaders.count();

  for (let i = 0; i < headerCount; i++) {
    await moduleHeaders.nth(i).click();
  }

  // Find and respond to each indicator type
  // Cobertura indicators
  const coberturaToggles = page.locator('[data-category="cobertura"] button:has-text("Sí")');
  const cobCount = await coberturaToggles.count();
  for (let i = 0; i < cobCount; i++) {
    await coberturaToggles.nth(i).click();
  }

  // Frecuencia indicators
  const frecuenciaInputs = page.locator('[data-category="frecuencia"] input[type="number"]');
  const frecCount = await frecuenciaInputs.count();
  for (let i = 0; i < frecCount; i++) {
    await frecuenciaInputs.nth(i).fill('5');
  }

  // Profundidad indicators
  const profundidadSelects = page.locator('[data-category="profundidad"] select, [data-category="profundidad"] button[data-level="3"]');
  const profCount = await profundidadSelects.count();
  for (let i = 0; i < profCount; i++) {
    const elem = profundidadSelects.nth(i);
    const tagName = await elem.evaluate(el => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await elem.selectOption('3');
    } else {
      await elem.click();
    }
  }
}

/**
 * Submit the assessment
 */
export async function submitAssessment(page: Page) {
  // Click submit button
  const submitBtn = page.locator('button:has-text("Enviar"), button:has-text("Submit"), button[data-action="submit"]');
  await expect(submitBtn).toBeEnabled({ timeout: 10000 });
  await submitBtn.click();

  // Confirm if there's a dialog
  const confirmBtn = page.locator('button:has-text("Confirmar"), button:has-text("Sí")');
  if (await confirmBtn.isVisible({ timeout: 2000 })) {
    await confirmBtn.click();
  }

  // Wait for redirect to results or success message
  await Promise.race([
    page.waitForURL(/\/results/),
    expect(page.locator('text=enviado, text=completado')).toBeVisible({ timeout: 10000 }),
  ]);
}

/**
 * Verify results page displays correctly
 */
export async function verifyResultsPage(page: Page, instanceId: string) {
  await page.goto(`/docente/assessments/${instanceId}/results`);
  await page.waitForLoadState('networkidle');

  // Verify key elements are present
  await expect(page.locator('text=Resultados, text=Results')).toBeVisible({ timeout: 10000 });

  // Verify score is displayed
  await expect(page.locator('[data-testid="total-score"], .total-score, text=Puntuación')).toBeVisible();

  // Verify gap analysis section if expectations were set
  const gapSection = page.locator('[data-testid="gap-analysis"], text=Brechas, text=Gap');
  // Don't fail if not present, just log
  const hasGapAnalysis = await gapSection.isVisible().catch(() => false);
  console.log(`Gap analysis section visible: ${hasGapAnalysis}`);

  return hasGapAnalysis;
}

// ============================================================
// VERIFICATION HELPERS
// ============================================================

/**
 * Verify template exists in list
 */
export async function verifyTemplateInList(page: Page, templateName: string) {
  await navigateToAssessmentBuilder(page);
  await expect(page.locator(`text=${templateName}`)).toBeVisible({ timeout: 10000 });
}

/**
 * Verify assessment instance was created (for directivo after docente assignment)
 */
export async function verifyAutoAssignment(page: Page) {
  // Check for success toast or message indicating instances were created
  const successIndicator = page.locator('text=evaluación, text=asignada, text=creada');
  return await successIndicator.isVisible({ timeout: 5000 }).catch(() => false);
}

/**
 * Verify school results dashboard
 */
export async function verifySchoolResults(page: Page) {
  await page.goto('/directivo/assessments/dashboard');
  await page.waitForLoadState('networkidle');

  // Verify dashboard elements
  await expect(page.locator('text=Resultados, text=Dashboard, text=Escuela')).toBeVisible({ timeout: 10000 });

  // Check for charts or summary
  const hasCharts = await page.locator('svg, canvas, [data-testid="chart"]').isVisible().catch(() => false);
  console.log(`Dashboard has charts: ${hasCharts}`);

  return hasCharts;
}
