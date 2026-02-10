# Admin Role QA Scenarios

> **Created:** 2026-02-08 — 129 scenarios. Admin role (Administrador Global) has unrestricted access to ALL platform features. This audit verifies that recent security fixes for other roles have NOT accidentally blocked admin access, and that admin retains global scope for all reporting, feedback, and CRUD operations.

Generated: 2026-02-08
**Auditor:** Developer Agent (Claude Opus 4.6)

## Source Files Analyzed
- types/roles.ts (ROLE_HIERARCHY — all permissions true, global scope)
- components/layout/Sidebar.tsx (navigation filtering logic, admin bypasses)
- lib/assessment-permissions.ts (hasAssessmentWritePermission — admin only)
- pages/api/reports/detailed.ts (allowedRoles includes admin)
- pages/api/reports/overview.ts (allowedRoles includes admin)
- pages/api/reports/filter-options.ts (admin global scope)
- pages/api/reports/user-details.ts (admin bypass at line 137)
- pages/api/dashboard/unified.ts (allowedRoles includes admin)
- supabase/migrations/20260208160000_add_supervisor_network_support.sql (admin RLS bypass verified)
- All 58 admin page routes under /pages/admin/**/*.tsx
- All 65 admin API routes under /pages/api/admin/**/*.ts

---

## Correct Access — Should ALLOW (40 scenarios)

Admin must access ALL authenticated pages and ALL API endpoints.

| # | Scenario | Route / Action | Expected Result |
|---|----------|---------------|----------------|
| CA-1 | Admin views dashboard | Navegar al Panel Principal | El panel carga con datos globales (todos los colegios, todos los usuarios). |
| CA-2 | Admin views their profile | Navegar a la página de Perfil | La página de perfil carga correctamente. |
| CA-3 | Admin views Mi Aprendizaje | Navegar a la página de Mi Aprendizaje | La página carga con todos los cursos. |
| CA-4 | Admin creates a new course | Navegar a la página de Creación de Curso | La página de creación de curso carga. La creación se completa correctamente. |
| CA-5 | Admin edits existing course | Navegar a la página de edición de curso | La página de edición de curso carga. Puede modificar y guardar. |
| CA-6 | Admin deletes a course | Hacer clic en Eliminar curso y confirmar | La operación se completa correctamente. RLS permite DELETE en la tabla courses. |
| CA-7 | Admin creates a user | Navegar a la página de Gestión de Usuarios y crear usuario | La creación del usuario se completa correctamente. |
| CA-8 | Admin edits any user's profile | Editar perfil de cualquier usuario | La operación se completa correctamente. RLS permite UPDATE en la tabla profiles. |
| CA-9 | Admin deletes a user | Hacer clic en Eliminar usuario y confirmar | La operación se completa correctamente. |
| CA-10 | Admin assigns roles to users | Asignar roles a usuarios | La asignación de rol se completa correctamente. RLS permite INSERT en user_roles. |
| CA-11 | Admin creates a school | Navegar a la página de Escuelas y crear colegio | La creación del colegio se completa correctamente. RLS permite INSERT en schools. |
| CA-12 | Admin edits a school | Editar colegio y hacer clic en Guardar cambios | La actualización del colegio se completa correctamente. |
| CA-13 | Admin deletes a school | Hacer clic en Eliminar colegio y confirmar | La eliminación del colegio se completa correctamente (si no hay dependencias). |
| CA-14 | Admin creates a network | Navegar a la página de Gestión de Redes y crear red | La creación de la red se completa correctamente. RLS permite INSERT en redes_de_colegios. |
| CA-15 | Admin assigns schools to network | Asignar colegios a la red | La asignación se completa correctamente. RLS permite INSERT en red_escuelas. |
| CA-16 | Admin views assessment templates | Navegar a la página del Constructor de Evaluaciones | La lista de plantillas carga. Admin ve todas las plantillas. |
| CA-17 | Admin creates assessment template | Crear plantilla de evaluación | La creación de plantilla se completa correctamente. hasAssessmentWritePermission retorna true. |
| CA-18 | Admin edits assessment template | Editar plantilla de evaluación | La edición de plantilla se completa correctamente. |
| CA-19 | Admin deletes assessment template | Hacer clic en Eliminar plantilla y confirmar | La eliminación de plantilla se completa correctamente. |
| CA-20 | Admin accesses quiz review page | Navegar a la página de Revisión de Quizzes | La página carga. Admin puede calificar las revisiones pendientes de todos los colegios. |
| CA-21 | Admin grades an open-ended quiz | Enviar calificación de quiz en la página de revisión | La calificación se guarda correctamente (allowedRoles incluye admin). |
| CA-22 | Admin views detailed reports | Navegar a la página de Reportes Detallados | Los reportes cargan con alcance GLOBAL (todos los colegios, sin filtros). |
| CA-23 | Admin views report filter options | Abrir opciones de filtro en reportes | Se muestran TODOS los colegios, TODAS las generaciones, TODAS las comunidades (sin filtrar). |
| CA-24 | Admin views user details in reports | Ver detalles de usuario en reportes | Se muestran los detalles de CUALQUIER usuario (admin bypass en línea 137). |
| CA-25 | Admin views Contexto Transversal | Navegar a la página de Contexto Transversal con school_id | Carga para CUALQUIER colegio. Admin pasa por alto la verificación de asignación de colegio. |
| CA-26 | Admin edits Contexto Transversal | Editar Contexto Transversal con school_id | La actualización se completa correctamente para CUALQUIER colegio. |
| CA-27 | Admin views Plan de Migración | Navegar a la página de Plan de Migración con school_id | Carga para CUALQUIER colegio. |
| CA-28 | Admin edits Plan de Migración | Editar Plan de Migración | La actualización se completa correctamente para CUALQUIER colegio. |
| CA-29 | Admin views assignment overview | Navegar a la página de Vista de Tareas | La página de monitoreo de tareas grupales carga. |
| CA-30 | Admin creates news article | Navegar a la página de Noticias y crear artículo | La creación de noticia se completa correctamente. RLS permite INSERT (admin + community_manager). |
| CA-31 | Admin edits news article | Editar artículo de noticia | La edición de noticia se completa correctamente. |
| CA-32 | Admin creates event | Navegar a la página de Eventos y crear evento | La creación del evento se completa correctamente. RLS permite INSERT (admin + community_manager). |
| CA-33 | Admin creates learning path | Navegar a la página de Rutas de Aprendizaje y crear ruta | La creación de ruta de aprendizaje se completa correctamente. |
| CA-34 | Admin assigns learning path | Navegar a la página de asignación de ruta de aprendizaje | La página de asignación carga y se completa correctamente. |
| CA-35 | Admin creates contract | Navegar a la página de Contratos y crear contrato | La creación del contrato se completa correctamente. RLS permite INSERT (solo admin). |
| CA-36 | Admin assigns consultant | Navegar a la página de Asignación de Consultores y asignar | La asignación de consultor se completa correctamente. |
| CA-37 | Admin accesses system configuration | Navegar a la página de Configuración | La página de configuración carga (permisos manage_system_settings). |
| CA-38 | Admin manages notification types | Gestionar tipos de notificación | La gestión de tipos de notificación se completa correctamente. |
| CA-39 | Admin accesses Espacio Colaborativo | Navegar a la página de Espacio Colaborativo | El espacio de trabajo carga. Admin pasa por alto el requisito de comunidad (línea 561-563 Sidebar.tsx). |
| CA-40 | Admin accesses transformation assessments | Navegar a la página de Evaluaciones de Transformación | La página de evaluaciones de transformación carga. |

---

## Sidebar Visibility — Should be VISIBLE (47 scenarios)

Admin should see ALL navigation items except superadminOnly items (unless also in superadmins table).

| # | Item | ID | Filtering Property | Expected Result |
|---|------|----|--------------------|----------------|
| SV-1 | Mi Panel | dashboard | None | Visible. No restrictions. |
| SV-2 | Mi Perfil | profile | None | Visible. No restrictions. |
| SV-3 | Mi Aprendizaje (parent) | mi-aprendizaje | None | Visible. No restrictions. |
| SV-4 | Mi Aprendizaje > Mis Cursos | my-courses | None | Visible. No restrictions. |
| SV-5 | Mi Aprendizaje > Mis Tareas | my-assignments | None | Visible. No restrictions. |
| SV-6 | Feedback | docente-assessments | restrictedRoles: ['docente', 'admin', 'consultor'] | Visible. Admin is in restrictedRoles (line 720 Sidebar.tsx). |
| SV-7 | Revisión de Quizzes | quiz-reviews | consultantOnly: true | Visible. Admin bypasses consultantOnly (line 691). |
| SV-8 | Cursos (parent) | courses | adminOnly: true | Visible. isAdmin=true (line 686). |
| SV-9 | Cursos > Constructor de Cursos | course-builder | None (child) | Visible. Parent passes, child has no restrictions. |
| SV-10 | Cursos > Próximos Cursos | upcoming-courses | adminOnly: true (child) | Visible. isAdmin=true (line 797). |
| SV-11 | Procesos de Cambio (parent) | assessment-builder | consultantOnly: true | Visible. Admin bypasses consultantOnly. |
| SV-12 | Procesos de Cambio > Constructor | assessment-builder-main | None (child) | Visible. Parent passes, child has no restrictions. |
| SV-13 | Procesos de Cambio > Contexto Transversal | transversal-context-admin | None (child) | Visible. Parent passes, child has no restrictions. |
| SV-14 | Procesos de Cambio > Plan de Migración | migration-plan | None (child) | Visible. Parent passes, child has no restrictions. |
| SV-15 | Noticias | news | restrictedRoles: ['admin', 'community_manager'] | Visible. Admin is in restrictedRoles. |
| SV-16 | Eventos | events | restrictedRoles: ['admin', 'community_manager'] | Visible. Admin is in restrictedRoles. |
| SV-17 | Rutas de Aprendizaje | learning-paths | adminOnly: true | Visible. isAdmin=true. |
| SV-18 | Matriz de Asignaciones | assignment-matrix | adminOnly: true | Visible. isAdmin=true. |
| SV-19 | Usuarios | users | adminOnly: true | Visible. isAdmin=true. |
| SV-20 | Escuelas | schools | adminOnly: true | Visible. isAdmin=true. |
| SV-21 | Redes de Colegios | networks | adminOnly: true | Visible. isAdmin=true. |
| SV-22 | Consultorías (parent) | consultants | consultantOnly: true | Visible. Admin bypasses consultantOnly. |
| SV-23 | Consultorías > Asignación de Consultores | consultant-assignments | adminOnly: true (child) | Visible. isAdmin=true. |
| SV-24 | Consultorías > Vista de Tareas | assignment-overview | None (child) | Visible. Parent passes, child has no restrictions. |
| SV-25 | Gestión (parent) | gestion | restrictedRoles: ['admin', 'community_manager'] | Visible. Admin is in restrictedRoles. |
| SV-26 | Gestión > Clientes | clients | None (child with permission) | Visible. Admin bypasses permission check (line 733). |
| SV-27 | Gestión > Contratos | contracts | None (child with permission) | Visible. Admin bypasses permission check. |
| SV-28 | Gestión > Propuestas Pasantías | quotes | None (child with permission) | Visible. Admin bypasses permission check. |

---

## Sidebar Visibility — Should be VISIBLE (continued, 10 more)

| # | Item | ID | Filtering Property | Expected Result |
|---|------|----|--------------------|----------------|
| SV-29 | Gestión > Rendición de Gastos | expense-reports | None (child with permission) | Visible. Admin bypasses permission check. |
| SV-30 | Gestión > Soporte Técnico | feedback | None (child with permission) | Visible. Admin bypasses permission check. |
| SV-31 | Reportes | reports | consultantOnly: true + permission | Visible. Admin bypasses consultantOnly and permission check. |
| SV-32 | QA Testing (parent) | qa-testing | adminOnly: true | Visible. isAdmin=true. |
| SV-33 | QA Testing > Ejecutar Pruebas | qa-run-tests | None (child) | Visible. Parent passes, child has no restrictions. |
| SV-34 | QA Testing > Panel de QA | qa-admin | adminOnly: true (child) | Visible. isAdmin=true. |
| SV-35 | QA Testing > Escenarios | qa-scenarios | adminOnly: true (child) | Visible. isAdmin=true. |
| SV-36 | QA Testing > Importar | qa-import | adminOnly: true (child) | Visible. isAdmin=true. |
| SV-37 | QA Testing > Registro de Horas | qa-time-tracking | adminOnly: true (child) | Visible. isAdmin=true. |
| SV-38 | QA Testing > Generador | qa-generator | adminOnly: true (child) | Visible. isAdmin=true. |

---

## Sidebar Visibility — Should be VISIBLE (final 5 + 2 NOT visible)

| # | Item | ID | Filtering Property | Expected Result |
|---|------|----|--------------------|----------------|
| SV-39 | Vías de Transformación (parent) | vias-transformacion | adminOnly: true | Visible. isAdmin=true. |
| SV-40 | Vías > Mis Evaluaciones | vias-mis-evaluaciones | None (child) | Visible. Parent passes, child has no restrictions. |
| SV-41 | Vías > Contexto Transversal | vias-contexto-transversal | None (child) | Visible. Parent passes, child has no restrictions. |
| SV-42 | Vías > Panel de Resultados | vias-resultados-escuela | None (child) | Visible. Parent passes, child has no restrictions. |
| SV-43 | Vías > Todas las Evaluaciones | vias-admin-todas | adminOnly: true (child) | Visible. isAdmin=true. |
| SV-44 | Espacio Colaborativo (parent) | workspace | requiresCommunity: true | Visible. Admin bypasses community check (Sidebar.tsx line 561-563, hasCommunity=true). |
| SV-45 | Espacio > Vista General | workspace-overview | None (child) | Visible. Parent passes, child has no restrictions. |
| SV-46 | Espacio > Gestión Comunidades | workspace-communities | None (child with permission) | Visible. Admin bypasses permission check. |
| SV-47 | Configuración | admin | permission: 'manage_system_settings' | Visible. Admin bypasses permission check (line 733). |

---

## Sidebar Visibility — Should NOT be visible (2 scenarios)

| # | Scenario | ID | Filtering Property | Expected Result |
|---|----------|----|--------------------|----------------|
| SV-48 | Roles y Permisos (if NOT superadmin) | rbac | superadminOnly: true | NOT visible unless admin is ALSO in superadmins table (line 680). Feature flag FEATURE_SUPERADMIN_RBAC must be enabled. |
| SV-49 | No duplicate sidebar items | N/A | N/A | Verify each menu item appears exactly once. |

---

## CRUD Operations Verification (15 scenarios)

Full create/read/update/delete on major entities.

| # | Scenario | Entity | Operations | Expected Result |
|---|----------|--------|-----------|----------------|
| CRUD-1 | Admin CRUD on courses | courses table | CREATE, READ, UPDATE, DELETE | All operations succeed. RLS allows all CRUD for admin role. |
| CRUD-2 | Admin CRUD on users | profiles table | CREATE, READ, UPDATE, DELETE | All operations succeed via API routes. |
| CRUD-3 | Admin CRUD on user_roles | user_roles table | CREATE, READ, UPDATE, DELETE | All operations succeed. RLS allows INSERT/UPDATE/DELETE for admin. |
| CRUD-4 | Admin CRUD on schools | schools table | CREATE, READ, UPDATE, DELETE | All operations succeed. RLS allows all CRUD for admin. |
| CRUD-5 | Admin CRUD on networks | redes_de_colegios table | CREATE, READ, UPDATE, DELETE | All operations succeed. Migration 20260208160000 includes admin bypass (line 72-78). |
| CRUD-6 | Admin CRUD on network assignments | red_escuelas table | CREATE, READ, UPDATE, DELETE | All operations succeed. Migration 20260208160000 includes admin bypass (line 49-55). |
| CRUD-7 | Admin CRUD on assessment templates | assessment_templates table | CREATE, READ, UPDATE, DELETE | All operations succeed. hasAssessmentWritePermission returns true for admin (lib/assessment-permissions.ts line 33). |
| CRUD-8 | Admin CRUD on news articles | news_articles table | CREATE, READ, UPDATE, DELETE | All operations succeed. RLS allows FOR ALL to admin + community_manager. |
| CRUD-9 | Admin CRUD on events | events table | CREATE, READ, UPDATE, DELETE | All operations succeed. RLS allows FOR ALL to admin + community_manager. |
| CRUD-10 | Admin CRUD on contracts | contratos table | CREATE, READ, UPDATE, DELETE | All operations succeed. RLS allows admin-only INSERT/UPDATE/DELETE. |
| CRUD-11 | Admin CRUD on learning paths | learning_paths table | CREATE, READ, UPDATE, DELETE | All operations succeed. adminOnly routes verified. |
| CRUD-12 | Admin CRUD on consultant assignments | consultant_assignments table | CREATE, READ, UPDATE, DELETE | All operations succeed. API route checks admin only. |
| CRUD-13 | Admin CRUD on generations | generations table | CREATE, READ, UPDATE, DELETE | All operations succeed via schools management. |
| CRUD-14 | Admin CRUD on communities | growth_communities table | CREATE, READ, UPDATE, DELETE | All operations succeed via community workspace. |
| CRUD-15 | Admin CRUD on notification types | notification_types table | CREATE, READ, UPDATE, DELETE | All operations succeed via /api/admin/notification-types. |

---

## Global Scope Verification (8 scenarios)

Reports show ALL schools, Dashboard shows ALL data, no accidental scoping.

| # | Scenario | Expected Result |
|---|----------|-----------------|
| GS-1 | Admin views reports — sees ALL schools globally | Los reportes muestran datos de TODOS los colegios, sin filtro de school_id aplicado. |
| GS-2 | Admin views filter options — ALL schools/generations/communities | Las opciones de filtro muestran listas sin filtrar (líneas 57-159 en filter-options.ts). |
| GS-3 | Admin views dashboard — ALL data globally | El panel muestra métricas globales (admin en línea 48, alcance global en línea 159). |
| GS-4 | Admin accesses user details for ANY user | Los detalles de CUALQUIER usuario se muestran (admin bypass línea 137). |
| GS-5 | Admin views assessment templates — ALL templates globally | Se muestran todas las plantillas (sin filtro de colegio). |
| GS-6 | Admin views quiz reviews — ALL schools' pending reviews | La página de revisión de quizzes muestra revisiones pendientes de TODOS los colegios (allowedRoles incluye admin). |
| GS-7 | Admin views transformation assessments — ALL schools | La página de evaluaciones de transformación muestra evaluaciones para TODOS los colegios. |
| GS-8 | Admin views assignment matrix — ALL users and assignments | La página de matriz de asignaciones muestra datos de asignación globales. |

---

## Regression Tests — Other Role Fixes (10 scenarios)

Verify admin access not blocked by recent RLS policies and API changes for other roles.

| # | Scenario | Route / Action | Expected Result |
|---|----------|---------------|----------------|
| RG-1 | Supervisor migration — admin RLS bypass on red_escuelas | Consultar red_escuelas como admin | La política RLS incluye bypass de admin (migration línea 49-55). Admin ve todos los registros de red_escuelas. |
| RG-2 | Supervisor migration — admin RLS bypass on redes_de_colegios | Consultar redes_de_colegios como admin | La política RLS incluye bypass de admin (migration línea 72-78). Admin ve todas las redes. |
| RG-3 | Consultor RLS fix — admin INSERT on assessment_templates | Insertar en assessment_templates como admin | RLS permite INSERT para admin (consultor fix migration). |
| RG-4 | Consultor RLS fix — admin INSERT on news_articles | Insertar en news_articles como admin | RLS permite INSERT para admin + community_manager. |
| RG-5 | Consultor RLS fix — admin INSERT on contratos | Insertar en contratos como admin | RLS permite INSERT solo para admin. |
| RG-6 | API reports/detailed.ts modified for supervisor — admin still in allowedRoles | Acceder a reportes detallados como admin | La operación se completa correctamente. Admin en allowedRoles array (línea 68). |
| RG-7 | API reports/overview.ts modified for supervisor — admin still in allowedRoles | Acceder a resumen de reportes como admin | La operación se completa correctamente. Admin en allowedRoles array (línea 45). |
| RG-8 | API reports/filter-options.ts modified for supervisor — admin gets global scope | Acceder a opciones de filtro como admin | El sistema muestra TODOS los colegios/generaciones/comunidades (línea 57). |
| RG-9 | API reports/user-details.ts modified for supervisor — admin bypass exists | Ver detalles de usuario como admin | El sistema muestra los detalles del usuario. Admin bypass en línea 137. |
| RG-10 | API dashboard/unified.ts modified for supervisor — admin in allowedRoles and gets global scope | Acceder al panel unificado como admin | La operación se completa correctamente. Admin en allowedRoles (línea 48), obtiene alcance global (línea 159). |

---

## Edge Cases (7 scenarios)

Admin with no school, inactive admin role, admin with multiple roles, etc.

| # | Scenario | Expected Result |
|---|----------|-----------------|
| EC-1 | Admin with no school_id in profile views dashboard | Dashboard loads successfully. Admin does not require school (requiresSchool: false in types/roles.ts). |
| EC-2 | Admin with no school_id views schools page | /admin/schools loads successfully. Can view and manage ALL schools globally. |
| EC-3 | Admin has multiple role records (admin + docente) | Both roles function correctly. getUserPrimaryRole returns 'admin' (highest priority). All admin permissions apply. |
| EC-4 | Admin session expires while on course builder | Redirect to /login. No stale data visible. Standard session handling applies. |
| EC-5 | Admin accesses API endpoints directly via URL (bypass sidebar) | Server-side permission checks enforce access. Admin bypasses all role checks and passes all API auth. |
| EC-6 | Admin with inactive admin role (is_active: false) | If admin role is inactive but another active role exists, admin privileges are lost. If no active roles, redirect to pending approval. |
| EC-7 | Admin tries to delete a school with dependencies | API returns error (foreign key constraints). School delete fails gracefully with error message. |

---

## Scenario Summary

| Category | Count |
|----------|-------|
| Correct Access (Should ALLOW) | 40 |
| Sidebar Visibility (Should be VISIBLE) | 47 |
| Sidebar Visibility (Should NOT be visible) | 2 |
| CRUD Operations Verification | 15 |
| Global Scope Verification | 8 |
| Regression Tests (Other Role Fixes) | 10 |
| Edge Cases | 7 |
| **TOTAL** | **129** |

---

## Playwright Test Stubs

```typescript
import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL || 'admin.qa@fne.cl';
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD || 'TestQA2026!';

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.fill('[name=email]', ADMIN_EMAIL);
  await page.fill('[name=password]', ADMIN_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('/dashboard');
}

test.describe('Admin - Correct Access', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should load dashboard with global data', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/);
    // Verify global scope indicators present
  });

  test('should create a new course', async ({ page }) => {
    await page.goto('/admin/create-course');
    await expect(page).toHaveURL(/admin\/create-course/);
  });

  test('should access user management', async ({ page }) => {
    await page.goto('/admin/user-management');
    await expect(page).toHaveURL(/admin\/user-management/);
  });

  test('should create assessment template via API', async ({ request }) => {
    const response = await request.post('/api/admin/assessment-builder/templates', {
      data: { name: 'Test Template', description: 'Admin test' }
    });
    expect(response.status()).toBe(201);
  });

  test('should access ALL sidebar items', async ({ page }) => {
    // Verify all admin-visible items present
    await expect(page.locator('text=Cursos')).toBeVisible();
    await expect(page.locator('text=Usuarios')).toBeVisible();
    await expect(page.locator('text=Escuelas')).toBeVisible();
    await expect(page.locator('text=Redes de Colegios')).toBeVisible();
    await expect(page.locator('text=QA Testing')).toBeVisible();
    await expect(page.locator('text=Configuración')).toBeVisible();
  });
});

test.describe('Admin - Global Scope', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('reports should show ALL schools', async ({ page }) => {
    await page.goto('/detailed-reports');
    // Verify no pre-set school filter
    // Verify ALL schools available in dropdown
  });

  test('dashboard should show global metrics', async ({ page }) => {
    await page.goto('/dashboard');
    // Verify global metrics displayed
  });
});

test.describe('Admin - Regression (Supervisor Migration)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should access network management', async ({ page }) => {
    await page.goto('/admin/network-management');
    await expect(page).toHaveURL(/network-management/);
    // Verify admin can see all networks
  });

  test('should access modified reporting endpoints', async ({ request }) => {
    const detailedResponse = await request.post('/api/reports/detailed', {
      data: { filters: {} }
    });
    expect(detailedResponse.status()).toBe(200);

    const overviewResponse = await request.post('/api/reports/overview', {
      data: {}
    });
    expect(overviewResponse.status()).toBe(200);
  });
});
```
