# Lider de Generacion Role QA Scenarios

> **Audited Feb 8, 2026** — 62 vetted scenarios. All scenarios cross-referenced against actual codebase (Sidebar.tsx, API routes, types/roles.ts, RLS policies).

Generated: 2026-02-08
**Role:** lider_generacion
**Scoping Boundary:** generation (not school, not community)

## Source Files Analyzed
- types/roles.ts (role permissions, hierarchy, organizational scope) — lines 192-206, 324-328
- components/layout/Sidebar.tsx (navigation visibility) — lines 666-761
- lib/assessment-permissions.ts (read/write permission guards) — lines 8-34
- pages/api/reports/detailed.ts (generation-scoped reporting) — lines 68, 650-670
- pages/api/reports/overview.ts (generation-scoped reporting) — lines 45, 301-315
- pages/api/reports/filter-options.ts (generation scoping) — lines 36, 107-131
- pages/api/quiz-reviews/pending.ts (quiz review access) — line 56
- pages/assignments.tsx (teacher role check) — line 35
- pages/quiz-reviews.tsx (permission check) — line 28
- pages/detailed-reports.tsx (reporting access) — line 209
- utils/roleUtils.ts (role hierarchy) — line 214

---

## Permission Boundaries (Should DENY) — 16 scenarios

| # | Scenario | Route / Action | Expected Result |
|---|----------|---------------|----------------|
| PB-1 | Lider de Generacion tries to create a new course | POST /api/admin/courses or navigate to /admin/create-course | Access denied / 403. Sidebar should not show 'Cursos' menu item (adminOnly). |
| PB-2 | Lider de Generacion tries to create a user | Navigate to /admin/user-management or POST /api/admin/create-user | Access denied / 403. 'Usuarios' menu not visible in sidebar (adminOnly). |
| PB-3 | Lider de Generacion tries to edit another user's profile | PUT /api/admin/update-user | Access denied / 403. |
| PB-4 | Lider de Generacion tries to assign roles to users | POST /api/admin/assign-role | Access denied / 403. |
| PB-5 | Lider de Generacion tries to manage schools | Navigate to /admin/schools | Access denied. 'Escuelas' menu not visible (adminOnly). |
| PB-6 | Lider de Generacion tries to manage network of schools | Navigate to /admin/network-management | Access denied. 'Redes de Colegios' not visible (adminOnly). |
| PB-7 | Lider de Generacion tries to create an assessment template | POST /api/admin/assessment-builder/templates | Access denied / 403 (hasAssessmentWritePermission returns false for lider_generacion). |
| PB-8 | Lider de Generacion tries to VIEW assessment templates | GET /api/admin/assessment-builder/templates | Access denied / 403 (hasAssessmentReadPermission allows only admin+consultor, excludes lider_generacion). |
| PB-9 | Lider de Generacion tries to access quiz reviews | Navigate to /quiz-reviews or GET /api/quiz-reviews/pending | Access denied. allowedRoles = ['admin', 'consultor', 'equipo_directivo'] at API line 56, excludes lider_generacion. |
| PB-10 | Lider de Generacion tries to create/edit news items | Navigate to /admin/news or POST /api/admin/news | Access denied. 'Noticias' not visible in sidebar (admin/community_manager only). |
| PB-11 | Lider de Generacion tries to create/edit events | Navigate to /admin/events | Access denied. 'Eventos' not visible in sidebar (admin/community_manager only). |
| PB-12 | Lider de Generacion tries to manage contracts | Navigate to /contracts | Access denied. 'Gestión' not visible in sidebar (admin/community_manager only). |
| PB-13 | Lider de Generacion tries to access system configuration | Navigate to /admin/configuration | Access denied. 'Configuración' not visible (requires manage_system_settings permission). |
| PB-14 | Lider de Generacion tries to assign consultants | Navigate to /admin/consultant-assignments | Access denied. Menu item is adminOnly. |
| PB-15 | Lider de Generacion tries to access QA testing pages | Navigate to /admin/qa-scenarios | Access denied. 'QA Testing' not visible (adminOnly). |
| PB-16 | Lider de Generacion tries to batch-assign courses | POST /api/courses/batch-assign | Access denied. hasAssignPermission checks admin+consultor only (lines 7-18). |

---

## Correct Access (Should ALLOW) — 11 scenarios

| # | Scenario | Route / Action | Expected Result |
|---|----------|---------------|----------------|
| CA-1 | Lider de Generacion views their dashboard | Navigate to /dashboard | Dashboard loads with generation-scoped data. |
| CA-2 | Lider de Generacion views their profile | Navigate to /profile | Profile page loads correctly. |
| CA-3 | Lider de Generacion views 'Mi Aprendizaje' | Navigate to /mi-aprendizaje | Learning page loads with enrolled courses. |
| CA-4 | Lider de Generacion views detailed reports | Navigate to /detailed-reports | Reports page loads with generation-level data only (API line 68 allows lider_generacion, lines 650-670 scope by user_roles.generation_id). |
| CA-5 | Lider de Generacion views report overview | GET /api/reports/overview | Overview loads with generation-scoped data (API line 45 allows lider_generacion, lines 301-315 scope by profiles.generation_id). |
| CA-6 | Lider de Generacion views report filter options | GET /api/reports/filter-options | Filter options load (API line 36 allows lider_generacion, lines 107-131 require both school_id AND generation_id). |
| CA-7 | Lider de Generacion views unified dashboard stats | GET /api/dashboard/unified | Dashboard stats load (API line 48 allows lider_generacion, but falls to default case returning only [userId]). |
| CA-8 | Lider de Generacion accesses assignments page as teacher | Navigate to /assignments | Page loads with teacher view and stats (isTeacher check at line 35 includes lider_generacion). |
| CA-9 | Lider de Generacion views assignment submissions | Navigate to /assignments/[id]/submissions | Submissions page loads for generation students. |
| CA-10 | Lider de Generacion accesses Feedback page | Navigate to /docente/assessments | Page loads (no role restriction, queries assessment_instance_assignees by user_id). |
| CA-11 | Lider de Generacion views user details for generation member | GET /api/reports/user-details | User details load for same-generation users (lines 134-138 check generation_id match via user_roles). |

---

## Generation Assignment Scoping — 5 scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| GS-1 | Lider de Generacion views reports — only sees generation data | Reports API returns data filtered by generation_id. No data from other generations visible. |
| GS-2 | Lider de Generacion tries to view reports for different generation (URL manipulation) | API returns 403 or empty data. Generation filter enforced server-side. |
| GS-3 | Lider de Generacion detailed report vs overview report consistency | Both detailed.ts and overview.ts should scope to same generation, but detailed uses user_roles.generation_id while overview uses profiles.generation_id (INCONSISTENCY per Architect review). |
| GS-4 | Lider de Generacion filter-options requires both school AND generation | Filter-options API requires BOTH school_id AND generation_id from profiles (lines 107-131). If either missing, returns empty. |
| GS-5 | Lider de Generacion unified dashboard data scope | Unified dashboard API has NO lider_generacion case in switch, defaults to [userId] only (not generation-scoped). |

---

## Sidebar Visibility — 23 scenarios

### Should be VISIBLE (4 items)

| # | Scenario | Expected Result |
|---|----------|-----------------|
| SV-1 | Lider de Generacion sees 'Mi Panel' in sidebar | Visible (no restrictions). |
| SV-2 | Lider de Generacion sees 'Mi Perfil' in sidebar | Visible (no restrictions). |
| SV-3 | Lider de Generacion sees 'Mi Aprendizaje' in sidebar | Visible (no restrictions). |
| SV-4 | Lider de Generacion sees 'Espacio Colaborativo' in sidebar | Visible ONLY if user has community_id (requiresCommunity: true, line 696-705). Sidebar logic: consultors exempted but lider_generacion NOT exempted (line 702: `userRole !== 'consultor'`). |

### Should NOT be visible (18 items)

| # | Scenario | Expected Result |
|---|----------|-----------------|
| SV-5 | Lider de Generacion does NOT see 'Cursos' in sidebar | Not visible (adminOnly: true, line 686). |
| SV-6 | Lider de Generacion does NOT see 'Usuarios' in sidebar | Not visible (adminOnly: true). |
| SV-7 | Lider de Generacion does NOT see 'Escuelas' in sidebar | Not visible (adminOnly: true). |
| SV-8 | Lider de Generacion does NOT see 'Redes de Colegios' in sidebar | Not visible (adminOnly: true). |
| SV-9 | Lider de Generacion does NOT see 'Revisión de Quizzes' in sidebar | Not visible (consultantOnly: true, line 691 — lider_generacion not in ['admin', 'consultor']). |
| SV-10 | Lider de Generacion does NOT see 'Procesos de Cambio' in sidebar | Not visible (consultantOnly: true, same logic as SV-9). |
| SV-11 | Lider de Generacion does NOT see 'Reportes' in sidebar | Not visible (consultantOnly: true) — Design Gap #1: API allows access but sidebar hides. |
| SV-12 | Lider de Generacion does NOT see 'Consultorías' in sidebar | Not visible (consultantOnly: true). |
| SV-13 | Lider de Generacion does NOT see 'Feedback' in sidebar | Not visible (restrictedRoles: ['docente', 'admin', 'consultor'], line 708-727 — lider_generacion not in list) — Design Gap #3: API has no role check but sidebar hides. |
| SV-14 | Lider de Generacion does NOT see 'Noticias' in sidebar | Not visible (restrictedRoles: ['admin', 'community_manager'], line 708). |
| SV-15 | Lider de Generacion does NOT see 'Eventos' in sidebar | Not visible (restrictedRoles: ['admin', 'community_manager']). |
| SV-16 | Lider de Generacion does NOT see 'Gestión' in sidebar | Not visible (restrictedRoles: ['admin', 'community_manager']). |
| SV-17 | Lider de Generacion does NOT see 'Configuración' in sidebar | Not visible (permission: manage_system_settings, line 729-758). |
| SV-18 | Lider de Generacion does NOT see 'Rutas de Aprendizaje' in sidebar | Not visible (adminOnly: true). |
| SV-19 | Lider de Generacion does NOT see 'Matriz de Asignaciones' in sidebar | Not visible (adminOnly: true). |
| SV-20 | Lider de Generacion does NOT see 'QA Testing' in sidebar | Not visible (adminOnly: true). |
| SV-21 | Lider de Generacion does NOT see 'Vías de Transformación' in sidebar | Not visible (adminOnly: true). |
| SV-22 | Lider de Generacion does NOT see 'Roles y Permisos' in sidebar | Not visible (superadminOnly: true, line 670-683). |

### Integrity check (1 item)

| # | Scenario | Expected Result |
|---|----------|-----------------|
| SV-23 | No duplicate sidebar items for Lider de Generacion | Verify each menu item appears exactly once. |

---

## Edge Cases — 7 scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| EC-1 | Lider de Generacion with no generation_id assignment tries to access dashboard | Dashboard loads (no generation check on page itself), but reports return empty due to missing generation_id. |
| EC-2 | Lider de Generacion with generation_id in user_roles but NOT in profiles | filter-options.ts returns empty (requires profiles.generation_id at lines 107-131). overview.ts works (uses profiles.generation_id). detailed.ts fails (uses user_roles.generation_id). Data source inconsistency confirmed. |
| EC-3 | Lider de Generacion with multiple roles (e.g., lider_generacion + docente) | Both roles should function correctly. Permission checks use roles.some() and OR logic. |
| EC-4 | Lider de Generacion accesses API endpoints directly via URL (bypass sidebar) | Server-side permission checks enforce access control regardless of UI navigation. Reportes accessible via direct URL despite sidebar hiding. |
| EC-5 | Lider de Generacion tries to access /admin/qa pages | Access denied (adminOnly). Page checks roles?.some((r) => r.role_type === 'admin'). |
| EC-6 | Lider de Generacion session expires while on reports page | Redirect to login. No stale data visible. |
| EC-7 | requiresGeneration validation gap | types/roles.ts line 326: requiresGeneration = false, but description says "Must be assigned to a specific school and generation" (line 328). validateRoleAssignment() will NOT reject lider_generacion without generation_id — Design Gap #2. |

---

## Scenario Summary

| Category | Count |
|----------|-------|
| Permission Boundaries (Should DENY) | 16 |
| Correct Access (Should ALLOW) | 11 |
| Generation Assignment Scoping | 5 |
| Sidebar Visibility | 23 |
| Edge Cases | 7 |
| **TOTAL** | **62** |

---

## Design Gaps Documented (NOT TO FIX per task spec)

### Gap 1: Reportes sidebar vs. direct URL access
- **Sidebar**: `reports` item has `consultantOnly: true` (Sidebar.tsx line 354). lider_generacion CANNOT see it.
- **API/Page**: All report APIs include lider_generacion in `allowedRoles`. Direct URL to `/detailed-reports` or `/reports` will work.
- **Impact**: Discoverability issue, not a security issue.
- **Evidence**: components/layout/Sidebar.tsx line 691, pages/api/reports/detailed.ts line 68, pages/api/reports/overview.ts line 45

### Gap 2: requiresGeneration inconsistency
- **Code**: `ROLE_ORGANIZATIONAL_REQUIREMENTS.lider_generacion.requiresGeneration = false` (types/roles.ts line 326)
- **Description**: "Must be assigned to a specific school and generation" (line 328)
- **Impact**: A lider_generacion can be assigned without a generation_id, which would break all generation-scoped reporting.
- **Evidence**: types/roles.ts lines 324-328

### Gap 3: Feedback page access without sidebar visibility
- **Sidebar**: `docente-assessments` has `restrictedRoles: ['docente', 'admin', 'consultor']` (Sidebar.tsx line 708-727). lider_generacion is NOT in this list.
- **API**: `/api/docente/assessments/index.ts` has NO role check — it returns assessments assigned to the authenticated user regardless of role.
- **Page**: `/pages/docente/assessments/index.tsx` has NO role guard — any authenticated user can visit the page.
- **Impact**: If a lider_generacion has been assigned assessment instances, they can access them via `/docente/assessments` but cannot discover this through the sidebar.
- **Evidence**: components/layout/Sidebar.tsx line 724, pages/api/docente/assessments/index.ts

---

## Security Gaps Documented (per DB report — NOT TO FIX per task spec)

### RLS Security Gaps
1. **No generation-scoped RLS policies** on courses, quiz_submissions, quiz_responses, course_assignments, submissions
2. **No RLS on user_roles table** — any authenticated user could query role assignments
3. **No RLS on profiles table** — student PII (names, emails) could be accessible across generation boundaries (Law 21.719 risk)
4. **pending_quiz_reviews accessibility unknown** — needs direct verification

### Data Source Inconsistency
- `profiles.generation_id` vs. `user_roles.generation_id` — some APIs use one, some use the other
- No database-level sync enforced between the two columns
- Architect identified: overview.ts uses profiles, detailed.ts uses user_roles, filter-options.ts uses profiles

---

## Test Account (to be created by Developer)

- **Email**: `lider-gen.qa@fne.cl`
- **Password**: `TestQA2026!`
- **Required setup**:
  - Create generation for school 257 (currently has `has_generations=false`)
  - Set `generation_id` in BOTH `user_roles` AND `profiles` tables to avoid data source inconsistency
  - Assign `school_id = 257` (QA Test School)

---

## Playwright Test Stubs

```typescript
import { test, expect } from '@playwright/test';

const LIDER_GEN_EMAIL = process.env.QA_LIDER_GEN_EMAIL || 'lider-gen.qa@fne.cl';
const LIDER_GEN_PASSWORD = process.env.QA_LIDER_GEN_PASSWORD || 'TestQA2026!';

async function loginAsLiderGeneracion(page) {
  await page.goto('/login');
  await page.fill('[name=email]', LIDER_GEN_EMAIL);
  await page.fill('[name=password]', LIDER_GEN_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('/dashboard');
}

test.describe('Lider Generacion - Permission Boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsLiderGeneracion(page);
  });

  test('should NOT see admin-only sidebar items', async ({ page }) => {
    await expect(page.locator('text=Cursos')).not.toBeVisible();
    await expect(page.locator('text=Usuarios')).not.toBeVisible();
    await expect(page.locator('text=Escuelas')).not.toBeVisible();
    await expect(page.locator('text=Redes de Colegios')).not.toBeVisible();
    await expect(page.locator('text=Configuración')).not.toBeVisible();
  });

  test('should NOT see consultant-only sidebar items', async ({ page }) => {
    await expect(page.locator('text=Revisión de Quizzes')).not.toBeVisible();
    await expect(page.locator('text=Procesos de Cambio')).not.toBeVisible();
    await expect(page.locator('text=Reportes')).not.toBeVisible(); // Hidden but accessible via URL
    await expect(page.locator('text=Consultorías')).not.toBeVisible();
  });

  test('should deny assessment template viewing via API', async ({ request }) => {
    const response = await request.get('/api/admin/assessment-builder/templates');
    expect(response.status()).toBe(403);
  });

  test('should deny quiz review access via API', async ({ request }) => {
    const response = await request.get('/api/quiz-reviews/pending');
    expect(response.status()).toBe(403);
  });
});

test.describe('Lider Generacion - Correct Access', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsLiderGeneracion(page);
  });

  test('should load Mi Aprendizaje page', async ({ page }) => {
    await page.goto('/mi-aprendizaje');
    await expect(page).toHaveURL(/mi-aprendizaje/);
  });

  test('should load detailed reports via direct URL', async ({ page }) => {
    await page.goto('/detailed-reports');
    await expect(page).toHaveURL(/detailed-reports/);
    // Verify generation-scoped data
  });

  test('should load assignments page as teacher', async ({ page }) => {
    await page.goto('/assignments');
    await expect(page).toHaveURL(/assignments/);
  });
});

test.describe('Lider Generacion - Generation Scoping', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsLiderGeneracion(page);
  });

  test('reports should only show assigned generation data', async ({ page }) => {
    await page.goto('/detailed-reports');
    // Verify generation filter is pre-set
    // Verify no data from other generations is visible
  });

  test('URL manipulation with different generation_id should fail', async ({ request }) => {
    const response = await request.post('/api/reports/detailed', {
      data: { filters: { generation_id: 'DIFFERENT_GEN_ID' } }
    });
    // Should return empty or 403
  });
});
```
