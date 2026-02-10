# Equipo Directivo Role QA Scenarios

Generated: 2026-02-08

## Source Files Analyzed
- types/roles.ts (role permissions, hierarchy, organizational scope)
- components/layout/Sidebar.tsx (navigation visibility)
- lib/assessment-permissions.ts (read/write permission guards)
- utils/workspaceUtils.ts (workspace access logic)
- pages/quiz-reviews.tsx (quiz review access — line 28)
- pages/api/quiz-reviews/submit-review.ts (quiz review submission — line 45)
- pages/api/quiz-reviews/pending.ts (pending quiz reviews — line 56)
- pages/api/quiz-reviews/[id].ts (quiz review detail — line 62)
- pages/api/reports/detailed.ts (detailed reports — lines 68, 628)
- pages/api/reports/filter-options.ts (report filters — lines 36, 81)
- pages/api/reports/school.ts (school reports — line 53)
- pages/api/reports/overview.ts (report overview — line 45)
- pages/api/reports/community.ts (community reports — line 53)
- pages/api/reports/course-analytics.ts (course analytics — line 53)
- pages/api/school/transversal-context/index.ts (transversal context API — lines 6-62)
- pages/school/transversal-context/index.tsx (transversal context page — lines 88-98)
- pages/school/migration-plan/index.tsx (migration plan page — lines 91-98)
- pages/directivo/assessments/dashboard.tsx (directivo results dashboard — line 152)
- pages/api/directivo/assessments/school-results.ts (school results API — lines 56-59)
- pages/api/directivo/assessments/course-results.ts (course results API — lines 48-51)
- pages/detailed-reports.tsx (detailed reports page — line 209)
- pages/reports.tsx (reports page — lines 163-172)
- pages/admin/new-reporting.tsx (new reporting — line 30)
- pages/api/admin/assignment-matrix/audit-log.ts (audit log — line 58)
- lib/services/learningPathsService.ts (learning paths — line 341)
- pages/api/admin/courses/index.ts (course creation — admin only)
- pages/api/admin/create-user.ts (user creation — admin only)
- pages/api/admin/news.ts (news API — admin/community_manager only)
- pages/api/admin/consultant-assignments.ts (consultant assignments — admin only)
- pages/api/courses/batch-assign.ts (course assignment — admin/consultor only)

---

## Role Definition Summary

**From types/roles.ts (lines 177-191):**

| Permission | Value |
|-----------|-------|
| can_create_courses | **false** |
| can_edit_all_courses | **false** |
| can_delete_courses | **false** |
| can_assign_courses | **false** |
| can_create_users | **false** |
| can_edit_users | **false** |
| can_delete_users | **false** |
| can_assign_roles | **false** |
| can_manage_schools | **false** |
| can_manage_generations | **false** |
| can_manage_communities | **false** |
| reporting_scope | **school** |
| feedback_scope | **school** |

**Organizational Requirements (lines 318-323):**
- requiresSchool: **true** (must be assigned to a school)
- requiresGeneration: false
- requiresCommunity: false

**Key Differences from Consultor:**
- **No** assessment read/write access (hasAssessmentReadPermission excludes equipo_directivo)
- **No** course assignment capability (can_assign_courses: false)
- **No** consultant-specific sidebar items (consultantOnly items filtered out)
- **Has** direct access to school results dashboard (/directivo/assessments/dashboard)
- **Has** quiz review access (admin, consultor, equipo_directivo only)
- **Has** reporting access (school-scoped)
- **Has** transversal context and migration plan access (for own school)
- Sidebar: does NOT see Feedback (restrictedRoles: ['docente', 'admin', 'consultor'] — equipo_directivo not listed)

---

## Permission Boundaries (Should DENY) — 14 scenarios

| # | Scenario | Route / Action | Expected Result |
|---|----------|---------------|----------------|
| PB-1 | Equipo Directivo tries to create a new course | Navegar a la página de Creación de Curso | Se muestra un mensaje de acceso denegado. El menú lateral no muestra 'Cursos' (adminOnly: true). |
| PB-2 | Equipo Directivo tries to create a user | Navegar a la página de Gestión de Usuarios | Se muestra un mensaje de acceso denegado. 'Usuarios' no visible en el menú lateral (adminOnly: true). |
| PB-3 | Equipo Directivo tries to edit another user's profile | Intentar actualizar perfil de otro usuario | Se muestra un mensaje de acceso denegado (hasAdminPrivileges check). |
| PB-4 | Equipo Directivo tries to assign roles to users | Intentar asignar roles a usuarios | Se muestra un mensaje de acceso denegado (role_type === 'admin' check). |
| PB-5 | Equipo Directivo tries to manage schools | Navegar a la página de Escuelas | Se muestra un mensaje de acceso denegado. 'Escuelas' no visible (adminOnly: true). |
| PB-6 | Equipo Directivo tries to manage network of schools | Navegar a la página de Gestión de Redes | Se muestra un mensaje de acceso denegado. 'Redes de Colegios' no visible (adminOnly: true). |
| PB-7 | Equipo Directivo tries to create an assessment template | Intentar crear plantilla de evaluación | Se muestra un mensaje de acceso denegado. hasAssessmentWritePermission retorna false (admin-only). hasAssessmentReadPermission también retorna false (admin+consultor only). |
| PB-8 | Equipo Directivo tries to view assessment builder page | Navegar a la página del Constructor de Evaluaciones | Se muestra un mensaje de acceso denegado. 'Procesos de Cambio' no visible (consultantOnly: true). La página verifica admin/consultor. |
| PB-9 | Equipo Directivo tries to create/edit news items | Navegar a la página de Noticias | Se muestra un mensaje de acceso denegado. 'Noticias' no visible (restrictedRoles: ['admin', 'community_manager']). El sistema bloquea (admin/community_manager only). |
| PB-10 | Equipo Directivo tries to create/edit events | Navegar a la página de Eventos | Se muestra un mensaje de acceso denegado. 'Eventos' no visible (restrictedRoles: ['admin', 'community_manager']). |
| PB-11 | Equipo Directivo tries to manage contracts | Navegar a la página de Contratos | Se muestra un mensaje de acceso denegado. 'Gestión' no visible (restrictedRoles: ['admin', 'community_manager']). La página tiene verificación de admin en el cliente. |
| PB-12 | Equipo Directivo tries to access system configuration | Navegar a la página de Configuración | Se muestra un mensaje de acceso denegado. 'Configuración' no visible (requiere permisos manage_system_settings). |
| PB-13 | Equipo Directivo tries to assign consultants | Navegar a la página de Asignación de Consultores | Se muestra un mensaje de acceso denegado. 'Consultorías' no visible (consultantOnly: true). El sistema bloquea con checkIsAdmin(). |
| PB-14 | Equipo Directivo tries to assign courses to students | Intentar asignar cursos a estudiantes | Se muestra un mensaje de acceso denegado. hasAssignPermission verifica solo admin o consultor (can_assign_courses: false). |

---

## Correct Access (Should ALLOW) — 14 scenarios

| # | Scenario | Route / Action | Expected Result |
|---|----------|---------------|----------------|
| CA-1 | Equipo Directivo views their dashboard | Navegar al Panel Principal | El panel carga. Sin restricción de rol (requiere solo session?.user). |
| CA-2 | Equipo Directivo views their profile | Navegar a la página de Perfil | La página de perfil carga correctamente. Sin restricción de rol. |
| CA-3 | Equipo Directivo views 'Mi Aprendizaje' | Navegar a la página de Mi Aprendizaje | La página carga con cursos inscritos. Sin restricción de rol. |
| CA-4 | Equipo Directivo accesses quiz review page | Navegar a la página de Revisión de Quizzes | La página carga. Verificación de permisos: `hasRole('admin') || hasRole('consultor') || hasRole('equipo_directivo')` (línea 28). |
| CA-5 | Equipo Directivo grades an open-ended quiz question | Enviar calificación de quiz en la página de revisión | La calificación se guarda. allowedRoles: ['admin', 'consultor', 'equipo_directivo'] (submit-review.ts línea 45). |
| CA-6 | Equipo Directivo views pending quiz reviews | Ver revisiones de quiz pendientes | Se muestran las revisiones pendientes. allowedRoles incluye equipo_directivo (pending.ts línea 56). |
| CA-7 | Equipo Directivo views detailed reports | Navegar a la página de Reportes Detallados | La página de reportes carga. hasReportingAccess incluye equipo_directivo (línea 209). |
| CA-8 | Equipo Directivo views report overview | Ver resumen de reportes | Se muestran los datos de resumen. allowedRoles incluye equipo_directivo (línea 45). |
| CA-9 | Equipo Directivo views Contexto Transversal | Navegar a la página de Contexto Transversal | La página carga para el colegio asignado. Verifica permisos de rol equipo_directivo (línea 89). Usa school_id de user_roles. |
| CA-10 | Equipo Directivo views Plan de Migración | Navegar a la página de Plan de Migración | La página carga para el colegio asignado. Verifica permisos de rol equipo_directivo (línea 92). |
| CA-11 | Equipo Directivo views school results dashboard | Navegar a la página del Panel de Resultados | El panel carga. Permisos: roleTypes.includes('equipo_directivo') (línea 152). |
| CA-12 | Equipo Directivo views school assessment results API | Ver resultados de evaluaciones del colegio | Se muestran los resultados del colegio. isDirectivo = roleTypes.includes('equipo_directivo') (línea 56). Filtrado por user_roles.school_id. |
| CA-13 | Equipo Directivo views course assessment results API | Ver resultados de evaluaciones del curso | Se muestran los resultados del curso. Misma verificación de permisos que CA-12 (línea 48). |
| CA-14 | Equipo Directivo views assignment audit log | Ver registro de auditoría de asignaciones | Se muestran los datos de auditoría. allowedRoles: ['admin', 'consultor', 'equipo_directivo'] (línea 58). |

---

## School Assignment Scoping — 6 scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| SS-1 | Equipo Directivo views reports — only sees data from assigned school | Reports API returns data filtered by school_id from user_roles. getReportableUsers() at line 628 queries user's school_id and returns only users in that school. |
| SS-2 | Equipo Directivo tries to view reports for a different school (URL manipulation) | API scopes by querying user_roles.school_id first. Cannot expand beyond own school's users. Server-side enforced. |
| SS-3 | Equipo Directivo views Contexto Transversal for another school (URL param manipulation) | Se muestra un mensaje de acceso denegado. hasDirectivoPermission() en líneas 52-58 verifica si school_id solicitado coincide con directivoRole.school_id. Mismatch retorna hasPermission: false. |
| SS-4 | Equipo Directivo views filter options — only sees own school | filter-options.ts lines 81-105: equipo_directivo sees only their school and its related generations/communities. Explicitly coded at `highestRole === 'equipo_directivo' && userProfile.school_id`. |
| SS-5 | Equipo Directivo views school results for another school (query param manipulation) | API at school-results.ts lines 73-76: directivo's school_id comes from user_roles, NOT from query params. Cannot override. |
| SS-6 | Equipo Directivo views quiz reviews — sees reviews scoped to their context | pending.ts line 151 comment: "For equipo_directivo or other roles, return all for now". Note: this may need verification — scoping may be incomplete. |

---

## Sidebar Visibility — 26 scenarios

### Should be VISIBLE (5 items)

| # | Scenario | Expected Result |
|---|----------|-----------------|
| SV-1 | Equipo Directivo sees 'Mi Panel' in sidebar | Visible. No restrictions. |
| SV-2 | Equipo Directivo sees 'Mi Perfil' in sidebar | Visible. No restrictions. |
| SV-3 | Equipo Directivo sees 'Mi Aprendizaje' in sidebar | Visible. No restrictions. |
| SV-4 | Equipo Directivo sees 'Espacio Colaborativo' in sidebar (if community member) | Visible ONLY if user has community_id in user_roles. requiresCommunity: true — equipo_directivo is NOT exempted (only consultor is exempted at line 702). |
| SV-5 | Equipo Directivo does NOT see 'Espacio Colaborativo' if no community membership | Not visible. requiresCommunity: true and hasCommunity is false. No exemption for equipo_directivo. |

### Should NOT be visible (19 items)

| # | Scenario | Expected Result |
|---|----------|-----------------|
| SV-6 | Equipo Directivo does NOT see 'Feedback' in sidebar | Not visible. restrictedRoles: ['docente', 'admin', 'consultor'] — equipo_directivo NOT in list (line 130). Filtered out at line 724. |
| SV-7 | Equipo Directivo does NOT see 'Revisión de Quizzes' in sidebar | Not visible. consultantOnly: true — equipo_directivo is NOT admin/consultor (line 691). Note: page allows access (line 28) but sidebar hides it. |
| SV-8 | Equipo Directivo does NOT see 'Cursos' in sidebar | Not visible. adminOnly: true (line 145). |
| SV-9 | Equipo Directivo does NOT see 'Procesos de Cambio' in sidebar | Not visible. consultantOnly: true (line 169). |
| SV-10 | Equipo Directivo does NOT see 'Noticias' in sidebar | Not visible. restrictedRoles: ['admin', 'community_manager'] (line 200). |
| SV-11 | Equipo Directivo does NOT see 'Eventos' in sidebar | Not visible. restrictedRoles: ['admin', 'community_manager'] (line 209). |
| SV-12 | Equipo Directivo does NOT see 'Rutas de Aprendizaje' in sidebar | Not visible. adminOnly: true (line 218). |
| SV-13 | Equipo Directivo does NOT see 'Matriz de Asignaciones' in sidebar | Not visible. adminOnly: true (line 227). |
| SV-14 | Equipo Directivo does NOT see 'Usuarios' in sidebar | Not visible. adminOnly: true (line 235). |
| SV-15 | Equipo Directivo does NOT see 'Escuelas' in sidebar | Not visible. adminOnly: true (line 244). |
| SV-16 | Equipo Directivo does NOT see 'Redes de Colegios' in sidebar | Not visible. adminOnly: true (line 253). |
| SV-17 | Equipo Directivo does NOT see 'Consultorías' in sidebar | Not visible. consultantOnly: true (line 261). |
| SV-18 | Equipo Directivo does NOT see 'Gestión' in sidebar | Not visible. restrictedRoles: ['admin', 'community_manager'] (line 285). |
| SV-19 | Equipo Directivo does NOT see 'Reportes' in sidebar | Not visible. consultantOnly: true (line 354). Note: report PAGES allow access, but sidebar hides the menu item. |
| SV-20 | Equipo Directivo does NOT see 'QA Testing' in sidebar | Not visible. adminOnly: true (line 362). |
| SV-21 | Equipo Directivo does NOT see 'Vías de Transformación' in sidebar | Not visible. adminOnly: true (line 414). Note: underlying pages (/school/transversal-context, /school/migration-plan, /directivo/assessments/dashboard) DO allow equipo_directivo access via direct URL. |
| SV-22 | Equipo Directivo does NOT see 'Configuración' in sidebar | Not visible. permission: 'manage_system_settings' (line 474). |
| SV-23 | Equipo Directivo does NOT see 'Roles y Permisos' in sidebar | Not visible. superadminOnly: true (line 482). |
| SV-24 | Equipo Directivo does NOT see 'Asignación de Consultores' in sidebar | Not visible. consultantOnly: true on parent 'Consultorías' blocks visibility. |

### Integrity check (1 item)

| # | Scenario | Expected Result |
|---|----------|-----------------|
| SV-25 | No duplicate sidebar items for Equipo Directivo | Verify each menu item appears exactly once. |

### Potential Design Issue (1 item)

| # | Scenario | Expected Result |
|---|----------|-----------------|
| SV-26 | Equipo Directivo can access report pages by direct URL despite no sidebar link | /detailed-reports, /reports, /admin/new-reporting all allow equipo_directivo access. /quiz-reviews also allows access. /school/transversal-context, /school/migration-plan, /directivo/assessments/dashboard all allow access. But NONE of these have sidebar links for equipo_directivo. **Verify this is intentional or a navigation gap.** |

---

## Edge Cases — 8 scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| EC-1 | Equipo Directivo with no school assignment tries to access reports | Should show empty state or appropriate error. getReportableUsers() at line 628 queries user_roles.school_id — if null, returns empty array. |
| EC-2 | Equipo Directivo with no school assignment tries to access transversal context | API returns 400: "No se encontró escuela asociada al usuario" (line 93-96). |
| EC-3 | Equipo Directivo has multiple role records (e.g., equipo_directivo + docente) | Both roles should function. Permission checks use roles.some(). getUserPrimaryRole returns equipo_directivo (priority #3 in hierarchy after admin, consultor). |
| EC-4 | Equipo Directivo accesses API endpoints directly via URL (bypass sidebar) | Server-side permission checks enforce access control. Reports API, quiz review API, transversal context API all have independent auth. |
| EC-5 | Equipo Directivo tries to access /admin/qa pages | Access denied. QA page checks roles?.some(r => r.role_type === 'admin') at lines 146-153. Renders "Acceso Denegado". |
| EC-6 | Equipo Directivo session expires while on reports page | Redirect to login. SessionContextProvider uses autoRefreshToken. useAuth clears state on SIGNED_OUT. |
| EC-7 | Equipo Directivo with community_id accesses Espacio Colaborativo | Workspace loads. getUserWorkspaceAccess gives 'community_member' accessType (workspaceUtils.ts lines 141-153). |
| EC-8 | Equipo Directivo without community_id tries to access /community/workspace | Should be denied or show error. requiresCommunity filter hides sidebar, and workspace access check returns no access without community_id. |

---

## Scenario Summary

| Category | Count |
|----------|-------|
| Permission Boundaries (Should DENY) | 14 |
| Correct Access (Should ALLOW) | 14 |
| School Assignment Scoping | 6 |
| Sidebar Visibility | 26 |
| Edge Cases | 8 |
| **TOTAL** | **68** |

---

## Playwright Test Stubs

```typescript
import { test, expect } from '@playwright/test';

const DIRECTIVO_EMAIL = process.env.QA_DIRECTIVO_EMAIL || 'directivo.qa@fne.cl';
const DIRECTIVO_PASSWORD = process.env.QA_DIRECTIVO_PASSWORD || 'TestQA2026!';

async function loginAsDirectivo(page) {
  await page.goto('/login');
  await page.fill('[name=email]', DIRECTIVO_EMAIL);
  await page.fill('[name=password]', DIRECTIVO_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('/dashboard');
}

test.describe('Equipo Directivo - Permission Boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDirectivo(page);
  });

  test('should NOT see admin-only sidebar items', async ({ page }) => {
    await expect(page.locator('text=Cursos')).not.toBeVisible();
    await expect(page.locator('text=Usuarios')).not.toBeVisible();
    await expect(page.locator('text=Escuelas')).not.toBeVisible();
    await expect(page.locator('text=Redes de Colegios')).not.toBeVisible();
    await expect(page.locator('text=Configuración')).not.toBeVisible();
    await expect(page.locator('text=Rutas de Aprendizaje')).not.toBeVisible();
    await expect(page.locator('text=Matriz de Asignaciones')).not.toBeVisible();
    await expect(page.locator('text=QA Testing')).not.toBeVisible();
    await expect(page.locator('text=Vías de Transformación')).not.toBeVisible();
  });

  test('should NOT see consultant-only sidebar items', async ({ page }) => {
    await expect(page.locator('text=Revisión de Quizzes')).not.toBeVisible();
    await expect(page.locator('text=Procesos de Cambio')).not.toBeVisible();
    await expect(page.locator('text=Reportes')).not.toBeVisible();
    await expect(page.locator('text=Consultorías')).not.toBeVisible();
  });

  test('should NOT see community_manager sidebar items', async ({ page }) => {
    await expect(page.locator('text=Noticias')).not.toBeVisible();
    await expect(page.locator('text=Eventos')).not.toBeVisible();
    await expect(page.locator('text=Gestión')).not.toBeVisible();
  });

  test('should NOT see Feedback in sidebar', async ({ page }) => {
    // restrictedRoles: ['docente', 'admin', 'consultor'] — equipo_directivo NOT included
    await expect(page.locator('text=Feedback')).not.toBeVisible();
  });

  test('should deny assessment template creation via API', async ({ request }) => {
    const response = await request.post('/api/admin/assessment-builder/templates', {
      data: { name: 'Test Template', description: 'Should fail' }
    });
    expect(response.status()).toBe(403);
  });

  test('should deny course assignment via API', async ({ request }) => {
    const response = await request.post('/api/courses/batch-assign', {
      data: { courseId: 'test', userIds: ['test'] }
    });
    expect(response.status()).toBe(403);
  });

  test('should deny direct navigation to admin course creation', async ({ page }) => {
    await page.goto('/admin/create-course');
    await expect(page).not.toHaveURL('/admin/create-course');
  });

  test('should deny direct navigation to user management', async ({ page }) => {
    await page.goto('/admin/user-management');
    await expect(page).not.toHaveURL('/admin/user-management');
  });
});

test.describe('Equipo Directivo - Correct Access', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDirectivo(page);
  });

  test('should load Mi Aprendizaje page', async ({ page }) => {
    await page.goto('/mi-aprendizaje');
    await expect(page).toHaveURL(/mi-aprendizaje/);
  });

  test('should access quiz reviews via direct URL', async ({ page }) => {
    await page.goto('/quiz-reviews');
    await expect(page).toHaveURL(/quiz-reviews/);
    // Page allows equipo_directivo but sidebar doesn't show it
  });

  test('should load detailed reports via direct URL', async ({ page }) => {
    await page.goto('/detailed-reports');
    await expect(page).toHaveURL(/detailed-reports/);
  });

  test('should load transversal context for assigned school', async ({ page }) => {
    await page.goto('/school/transversal-context');
    await expect(page).toHaveURL(/school\/transversal-context/);
  });

  test('should load migration plan for assigned school', async ({ page }) => {
    await page.goto('/school/migration-plan');
    await expect(page).toHaveURL(/school\/migration-plan/);
  });

  test('should load directivo assessment dashboard', async ({ page }) => {
    await page.goto('/directivo/assessments/dashboard');
    await expect(page).toHaveURL(/directivo\/assessments\/dashboard/);
  });
});

test.describe('Equipo Directivo - School Scoping', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDirectivo(page);
  });

  test('reports should only show assigned school data', async ({ page }) => {
    await page.goto('/detailed-reports');
    // Verify school filter is pre-set to assigned school
    // Verify no data from other schools is visible
  });

  test('transversal context should only show assigned school', async ({ page }) => {
    await page.goto('/school/transversal-context');
    // Should only show data for the assigned school
    // URL manipulation with different school_id should be denied
  });
});
```
