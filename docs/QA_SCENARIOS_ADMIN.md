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
| CA-1 | Admin views dashboard | Navigate to /dashboard | Dashboard loads with global data (all schools, all users). |
| CA-2 | Admin views their profile | Navigate to /profile | Profile page loads correctly. |
| CA-3 | Admin views Mi Aprendizaje | Navigate to /mi-aprendizaje | Learning page loads with all courses. |
| CA-4 | Admin creates a new course | Navigate to /admin/create-course | Course creation page loads. POST /api/admin/courses succeeds (201). |
| CA-5 | Admin edits existing course | Navigate to /admin/course-builder/[courseId]/edit | Course edit page loads. Can modify and save. |
| CA-6 | Admin deletes a course | DELETE /api/admin/courses/[id] | API returns 200. RLS allows DELETE on courses table. |
| CA-7 | Admin creates a user | Navigate to /admin/user-management, POST /api/admin/create-user | User creation succeeds with 201. |
| CA-8 | Admin edits any user's profile | PUT /api/admin/update-user | API returns 200. RLS allows UPDATE on profiles table. |
| CA-9 | Admin deletes a user | DELETE /api/admin/delete-user | API returns 200. |
| CA-10 | Admin assigns roles to users | POST /api/admin/roles/permissions | Role assignment succeeds (201). RLS allows INSERT on user_roles. |
| CA-11 | Admin creates a school | Navigate to /admin/schools, POST /api/admin/schools | School creation succeeds. RLS allows INSERT on schools. |
| CA-12 | Admin edits a school | PUT /api/admin/schools/[id] | School update succeeds. |
| CA-13 | Admin deletes a school | DELETE /api/admin/schools/[id] | School delete succeeds (if no dependencies). |
| CA-14 | Admin creates a network | Navigate to /admin/network-management, POST /api/admin/networks | Network creation succeeds. RLS allows INSERT on redes_de_colegios. |
| CA-15 | Admin assigns schools to network | POST /api/admin/networks/schools | Assignment succeeds. RLS allows INSERT on red_escuelas. |
| CA-16 | Admin views assessment templates | Navigate to /admin/assessment-builder, GET /api/admin/assessment-builder/templates | Template list loads. Admin sees all templates. |
| CA-17 | Admin creates assessment template | POST /api/admin/assessment-builder/templates | Template creation succeeds (201). hasAssessmentWritePermission returns true. |
| CA-18 | Admin edits assessment template | PUT /api/admin/assessment-builder/templates/[id] | Template edit succeeds. |
| CA-19 | Admin deletes assessment template | DELETE /api/admin/assessment-builder/templates/[id] | Template delete succeeds. |
| CA-20 | Admin accesses quiz review page | Navigate to /quiz-reviews | Page loads. Admin can grade all schools' pending reviews. |
| CA-21 | Admin grades an open-ended quiz | Submit quiz grade on /quiz-reviews | Grade saved successfully (allowedRoles includes admin). |
| CA-22 | Admin views detailed reports | Navigate to /detailed-reports, POST /api/reports/detailed | Reports load with GLOBAL scope (all schools, no filters). |
| CA-23 | Admin views report filter options | GET /api/reports/filter-options | Returns ALL schools, ALL generations, ALL communities (unfiltered). |
| CA-24 | Admin views user details in reports | GET /api/reports/user-details?userId=X | Returns details for ANY user (admin bypass at line 137). |
| CA-25 | Admin views Contexto Transversal | Navigate to /school/transversal-context?school_id=X | Loads for ANY school. Admin bypasses school assignment check. |
| CA-26 | Admin edits Contexto Transversal | POST /api/school/transversal-context with school_id | Update succeeds for ANY school. |
| CA-27 | Admin views Plan de Migración | Navigate to /school/migration-plan?school_id=X | Loads for ANY school. |
| CA-28 | Admin edits Plan de Migración | POST /api/school/migration-plan | Update succeeds for ANY school. |
| CA-29 | Admin views assignment overview | Navigate to /admin/assignment-overview | Group assignment monitoring page loads. |
| CA-30 | Admin creates news article | Navigate to /admin/news, POST /api/admin/news | News creation succeeds. RLS allows INSERT (admin + community_manager). |
| CA-31 | Admin edits news article | PUT /api/admin/news/[id] | News edit succeeds. |
| CA-32 | Admin creates event | Navigate to /admin/events, POST /api/admin/events | Event creation succeeds. RLS allows INSERT (admin + community_manager). |
| CA-33 | Admin creates learning path | Navigate to /admin/learning-paths/new, POST /api/admin/learning-paths | Learning path creation succeeds. |
| CA-34 | Admin assigns learning path | Navigate to /admin/learning-paths/[id]/assign | Assignment page loads and succeeds. |
| CA-35 | Admin creates contract | Navigate to /contracts, POST /api/admin/contracts | Contract creation succeeds. RLS allows INSERT (admin only). |
| CA-36 | Admin assigns consultant | Navigate to /admin/consultant-assignments, POST /api/admin/consultant-assignments | Consultant assignment succeeds. |
| CA-37 | Admin accesses system configuration | Navigate to /admin/configuration | Configuration page loads (manage_system_settings permission). |
| CA-38 | Admin manages notification types | POST /api/admin/notification-types | Notification type management succeeds. |
| CA-39 | Admin accesses Espacio Colaborativo | Navigate to /community/workspace | Workspace loads. Admin bypasses community requirement (line 561-563 Sidebar.tsx). |
| CA-40 | Admin accesses transformation assessments | Navigate to /admin/transformation/assessments | Transformation assessment page loads. |

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
| GS-1 | Admin views reports — sees ALL schools globally | POST /api/reports/detailed returns data from ALL schools, no school_id filter applied. |
| GS-2 | Admin views filter options — ALL schools/generations/communities | GET /api/reports/filter-options returns unfiltered lists (lines 57-159 in filter-options.ts). |
| GS-3 | Admin views dashboard — ALL data globally | GET /api/dashboard/unified returns global metrics (admin at line 48, global scope at line 159). |
| GS-4 | Admin accesses user details for ANY user | GET /api/reports/user-details?userId=X with ANY userId returns details (admin bypass line 137). |
| GS-5 | Admin views assessment templates — ALL templates globally | GET /api/admin/assessment-builder/templates returns all templates (no school filter). |
| GS-6 | Admin views quiz reviews — ALL schools' pending reviews | /quiz-reviews shows pending reviews from ALL schools (allowedRoles includes admin). |
| GS-7 | Admin views transformation assessments — ALL schools | /admin/transformation/assessments shows assessments for ALL schools. |
| GS-8 | Admin views assignment matrix — ALL users and assignments | /admin/assignment-matrix shows global assignment data. |

---

## Regression Tests — Other Role Fixes (10 scenarios)

Verify admin access not blocked by recent RLS policies and API changes for other roles.

| # | Scenario | Route / Action | Expected Result |
|---|----------|---------------|----------------|
| RG-1 | Supervisor migration — admin RLS bypass on red_escuelas | SELECT from red_escuelas as admin | RLS policy includes admin bypass (migration line 49-55). Admin sees all red_escuelas records. |
| RG-2 | Supervisor migration — admin RLS bypass on redes_de_colegios | SELECT from redes_de_colegios as admin | RLS policy includes admin bypass (migration line 72-78). Admin sees all networks. |
| RG-3 | Consultor RLS fix — admin INSERT on assessment_templates | POST /rest/v1/assessment_templates as admin | RLS allows INSERT for admin (consultor fix migration). |
| RG-4 | Consultor RLS fix — admin INSERT on news_articles | POST /rest/v1/news_articles as admin | RLS allows INSERT for admin + community_manager. |
| RG-5 | Consultor RLS fix — admin INSERT on contratos | POST /rest/v1/contratos as admin | RLS allows INSERT for admin only. |
| RG-6 | API reports/detailed.ts modified for supervisor — admin still in allowedRoles | POST /api/reports/detailed as admin | API returns 200. Admin in allowedRoles array (line 68). |
| RG-7 | API reports/overview.ts modified for supervisor — admin still in allowedRoles | POST /api/reports/overview as admin | API returns 200. Admin in allowedRoles array (line 45). |
| RG-8 | API reports/filter-options.ts modified for supervisor — admin gets global scope | GET /api/reports/filter-options as admin | API returns ALL schools/generations/communities (line 57). |
| RG-9 | API reports/user-details.ts modified for supervisor — admin bypass exists | GET /api/reports/user-details?userId=X as admin | API returns user details. Admin bypass at line 137. |
| RG-10 | API dashboard/unified.ts modified for supervisor — admin in allowedRoles and gets global scope | GET /api/dashboard/unified as admin | API returns 200. Admin in allowedRoles (line 48), gets global scope (line 159). |

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
