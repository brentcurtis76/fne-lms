# LIDER DE GENERACION QA SCENARIO AUDIT

**Audit Date:** 2026-02-08
**Auditor:** Developer Agent (Pipeline)
**Source:** `/docs/QA_SCENARIOS_LIDER_GENERACION.md` (62 scenarios)
**Method:** Cross-referenced every scenario against actual codebase (Sidebar.tsx, routes in /pages/, API endpoints, types/roles.ts, DB schema, RLS policies)

---

## EXECUTIVE SUMMARY

| Category | Final Count | Notes |
|----------|-------------|-------|
| Permission Boundaries | 16 | All verified against API routes and role permissions |
| Correct Access | 11 | All verified against API allowedRoles and page access |
| Generation Assignment Scoping | 5 | All verified, data source inconsistencies documented |
| Sidebar Visibility | 23 | All verified against Sidebar.tsx filtering logic |
| Edge Cases | 7 | All verified, includes requiresGeneration gap |
| **TOTAL** | **62** | Zero speculative scenarios |

**Design Gaps Documented:** 3 (Reportes sidebar, requiresGeneration, Feedback page)
**Security Gaps Documented:** 4 (per DB report — RLS missing on key tables)
**Zero missing routes** — all referenced files exist and were analyzed

---

## DETAILED AUDIT: PERMISSION BOUNDARIES (16 scenarios)

| # | Scenario | Route in Doc | Actual Route | Code Evidence | Verdict |
|---|----------|-------------|--------------|---------------|---------|
| PB-1 | Create a new course | POST /api/admin/courses | Exists | types/roles.ts line 193: can_create_courses = false | **VALID** ✓ |
| PB-2 | Create a user | POST /api/admin/create-user | Exists | types/roles.ts line 197: can_create_users = false | **VALID** ✓ |
| PB-3 | Edit user profile | PUT /api/admin/update-user | Exists | types/roles.ts line 198: can_edit_users = false | **VALID** ✓ |
| PB-4 | Assign roles | POST /api/admin/assign-role | Exists | types/roles.ts line 200: can_assign_roles = false | **VALID** ✓ |
| PB-5 | Manage schools | /admin/schools | Exists | types/roles.ts line 201: can_manage_schools = false | **VALID** ✓ |
| PB-6 | Manage networks | /admin/network-management | Exists | types/roles.ts line 201: can_manage_schools = false | **VALID** ✓ |
| PB-7 | Create assessment template | POST /api/admin/assessment-builder/templates | Exists | lib/assessment-permissions.ts line 33: admin-only | **VALID** ✓ |
| PB-8 | VIEW assessment templates | GET /api/admin/assessment-builder/templates | Exists | lib/assessment-permissions.ts line 19: admin+consultor only, excludes lider_generacion | **VALID** ✓ |
| PB-9 | Access quiz reviews | /quiz-reviews, GET /api/quiz-reviews/pending | Exists | pages/api/quiz-reviews/pending.ts line 56: allowedRoles = ['admin', 'consultor', 'equipo_directivo'] | **VALID** ✓ |
| PB-10 | Create/edit news | /admin/news, POST /api/admin/news | Exists | Sidebar.tsx restrictedRoles: ['admin', 'community_manager'] | **VALID** ✓ |
| PB-11 | Create/edit events | /admin/events | Exists | Sidebar.tsx restrictedRoles: ['admin', 'community_manager'] | **VALID** ✓ |
| PB-12 | Manage contracts | /contracts | Exists | Sidebar.tsx restrictedRoles: ['admin', 'community_manager'] | **VALID** ✓ |
| PB-13 | System configuration | /admin/configuration | Exists | Sidebar.tsx permission: 'manage_system_settings' | **VALID** ✓ |
| PB-14 | Assign consultants | /admin/consultant-assignments | Exists | Sidebar.tsx adminOnly: true | **VALID** ✓ |
| PB-15 | QA testing pages | /admin/qa-scenarios | Exists | Sidebar.tsx adminOnly: true | **VALID** ✓ |
| PB-16 | Batch-assign courses | POST /api/courses/batch-assign | Exists | pages/api/courses/batch-assign.ts lines 7-18: admin+consultor only | **VALID** ✓ |

**Permission verification (from types/roles.ts lines 192-206):**
- can_create_courses: false ✓
- can_edit_all_courses: false ✓
- can_delete_courses: false ✓
- can_assign_courses: false ✓
- can_create_users: false ✓
- can_edit_users: false ✓
- can_delete_users: false ✓
- can_assign_roles: false ✓
- can_manage_schools: false ✓
- can_manage_generations: false ✓
- can_manage_communities: false ✓
- reporting_scope: 'generation' ✓
- feedback_scope: 'generation' ✓

---

## DETAILED AUDIT: CORRECT ACCESS (11 scenarios)

| # | Scenario | Route in Doc | Actual Route | Code Evidence | Verdict |
|---|----------|-------------|--------------|---------------|---------|
| CA-1 | View dashboard | /dashboard | /dashboard | No role restriction | **VALID** ✓ |
| CA-2 | View profile | /profile | /profile | No role restriction | **VALID** ✓ |
| CA-3 | View Mi Aprendizaje | /mi-aprendizaje | /mi-aprendizaje | No role restriction | **VALID** ✓ |
| CA-4 | View detailed reports | /detailed-reports | /detailed-reports | pages/api/reports/detailed.ts line 68: allowedRoles includes lider_generacion; lines 650-670: generation_id scoping via user_roles | **VALID** ✓ |
| CA-5 | View report overview | GET /api/reports/overview | Exists | pages/api/reports/overview.ts line 45: allowedRoles includes lider_generacion; lines 301-315: generation_id scoping via profiles | **VALID** ✓ |
| CA-6 | View filter options | GET /api/reports/filter-options | Exists | pages/api/reports/filter-options.ts line 36: allowedRoles includes lider_generacion; lines 107-131: requires both school_id AND generation_id | **VALID** ✓ |
| CA-7 | Unified dashboard | GET /api/dashboard/unified | Exists | pages/api/dashboard/unified.ts line 48: allowedRoles includes lider_generacion; NO lider_generacion case in switch, defaults to [userId] | **VALID** ✓ |
| CA-8 | Assignments page as teacher | /assignments | /assignments | pages/assignments.tsx line 35: isTeacher includes lider_generacion | **VALID** ✓ |
| CA-9 | Assignment submissions | /assignments/[id]/submissions | Exists | Dynamic route exists | **VALID** ✓ |
| CA-10 | Feedback page | /docente/assessments | /docente/assessments | No role restriction, queries by user_id | **VALID** ✓ |
| CA-11 | User details for generation | GET /api/reports/user-details | Exists | pages/api/reports/user-details.ts lines 134-138: checks generation_id match via user_roles | **VALID** ✓ |

---

## DETAILED AUDIT: GENERATION ASSIGNMENT SCOPING (5 scenarios)

| # | Scenario | Code Evidence | Verdict |
|---|----------|---------------|---------|
| GS-1 | Reports only show generation data | pages/api/reports/detailed.ts lines 650-670: filters by user_roles.generation_id | **VALID** ✓ |
| GS-2 | URL manipulation denied | Server-side generation_id scoping enforced in all report APIs | **VALID** ✓ |
| GS-3 | Data source inconsistency | detailed.ts uses user_roles.generation_id, overview.ts uses profiles.generation_id (lines 301-315) | **VALID** ✓ (inconsistency confirmed) |
| GS-4 | filter-options requires both school AND generation | pages/api/reports/filter-options.ts lines 107-131: `if (highestRole === 'lider_generacion' && userProfile.school_id && userProfile.generation_id)` | **VALID** ✓ |
| GS-5 | Unified dashboard not generation-scoped | pages/api/dashboard/unified.ts: NO `case 'lider_generacion'`, falls through to `default: return [userId]` | **VALID** ✓ (missing implementation) |

---

## DETAILED AUDIT: SIDEBAR VISIBILITY (23 scenarios)

### Current scenarios — all verified against Sidebar.tsx lines 666-761:

**VISIBLE (4 items):**

| # | Item | Expected | Code Confirms | Sidebar Line | Verdict |
|---|------|----------|---------------|--------------|---------|
| SV-1 | Mi Panel visible | ✓ | No restrictions, falls through to `return true` | Line 760 | **VALID** ✓ |
| SV-2 | Mi Perfil visible | ✓ | No restrictions | Line 760 | **VALID** ✓ |
| SV-3 | Mi Aprendizaje visible | ✓ | No restrictions | Line 760 | **VALID** ✓ |
| SV-4 | Espacio Colaborativo (conditional) | ✓ IF community_id | requiresCommunity: true (line 696), lider_generacion NOT exempted (line 702: `userRole !== 'consultor'` = true for lider_generacion) | Lines 696-705 | **VALID** ✓ |

**NOT VISIBLE (18 items):**

| # | Item | Expected | Code Confirms | Filter Type | Line | Verdict |
|---|------|----------|---------------|-------------|------|---------|
| SV-5 | Cursos NOT visible | ✓ | adminOnly: true | adminOnly check | 686 | **VALID** ✓ |
| SV-6 | Usuarios NOT visible | ✓ | adminOnly: true | adminOnly check | 686 | **VALID** ✓ |
| SV-7 | Escuelas NOT visible | ✓ | adminOnly: true | adminOnly check | 686 | **VALID** ✓ |
| SV-8 | Redes NOT visible | ✓ | adminOnly: true | adminOnly check | 686 | **VALID** ✓ |
| SV-9 | Quiz Reviews NOT visible | ✓ | consultantOnly: true, lider_generacion not in ['admin', 'consultor'] | consultantOnly check | 691 | **VALID** ✓ |
| SV-10 | Procesos de Cambio NOT visible | ✓ | consultantOnly: true | consultantOnly check | 691 | **VALID** ✓ |
| SV-11 | Reportes NOT visible | ✓ | consultantOnly: true (Design Gap #1) | consultantOnly check | 691 | **VALID** ✓ |
| SV-12 | Consultorías NOT visible | ✓ | consultantOnly: true | consultantOnly check | 691 | **VALID** ✓ |
| SV-13 | Feedback NOT visible | ✓ | restrictedRoles: ['docente', 'admin', 'consultor'] (Design Gap #3) | restrictedRoles check | 708-727 | **VALID** ✓ |
| SV-14 | Noticias NOT visible | ✓ | restrictedRoles: ['admin', 'community_manager'] | restrictedRoles check | 708 | **VALID** ✓ |
| SV-15 | Eventos NOT visible | ✓ | restrictedRoles: ['admin', 'community_manager'] | restrictedRoles check | 708 | **VALID** ✓ |
| SV-16 | Gestión NOT visible | ✓ | restrictedRoles: ['admin', 'community_manager'] | restrictedRoles check | 708 | **VALID** ✓ |
| SV-17 | Configuración NOT visible | ✓ | permission: 'manage_system_settings' | permission check | 729-758 | **VALID** ✓ |
| SV-18 | Rutas NOT visible | ✓ | adminOnly: true | adminOnly check | 686 | **VALID** ✓ |
| SV-19 | Matriz NOT visible | ✓ | adminOnly: true | adminOnly check | 686 | **VALID** ✓ |
| SV-20 | QA Testing NOT visible | ✓ | adminOnly: true | adminOnly check | 686 | **VALID** ✓ |
| SV-21 | Vías NOT visible | ✓ | adminOnly: true | adminOnly check | 686 | **VALID** ✓ |
| SV-22 | RBAC NOT visible | ✓ | superadminOnly: true | superadminOnly check | 670-683 | **VALID** ✓ |

**INTEGRITY CHECK:**

| # | Scenario | Verdict | Notes |
|---|----------|---------|-------|
| SV-23 | No duplicate sidebar items | **VALID** ✓ | All sidebar items have unique IDs |

---

## DETAILED AUDIT: EDGE CASES (7 scenarios)

| # | Scenario | Code Evidence | Verdict |
|---|----------|---------------|---------|
| EC-1 | No generation_id → dashboard | Dashboard has no generation_id check, loads normally; reports return empty | **VALID** ✓ |
| EC-2 | generation_id in user_roles but NOT profiles | filter-options.ts line 107 requires profiles.generation_id; overview.ts uses profiles; detailed.ts uses user_roles; inconsistency confirmed | **VALID** ✓ |
| EC-3 | Multiple roles | Permission checks use roles.some() and OR logic | **VALID** ✓ |
| EC-4 | Direct API access | Server-side permission checks on all routes; Reportes accessible via URL despite sidebar hiding | **VALID** ✓ |
| EC-5 | QA pages access | adminOnly check on QA pages | **VALID** ✓ |
| EC-6 | Session expiry | Standard session handling with redirect | **VALID** ✓ |
| EC-7 | requiresGeneration gap | types/roles.ts line 326: requiresGeneration = false; line 328 description says generation required | **VALID** ✓ (Design Gap #2) |

---

## DESIGN GAPS CONFIRMED (Document Only — NOT TO FIX)

### Gap 1: Reportes sidebar vs. direct URL access
- **Sidebar**: `reports` item has `consultantOnly: true` (Sidebar.tsx line 691). lider_generacion CANNOT see it.
- **API/Page**: All report APIs include lider_generacion in `allowedRoles`:
  - pages/api/reports/detailed.ts line 68
  - pages/api/reports/overview.ts line 45
  - pages/api/reports/filter-options.ts line 36
  - pages/detailed-reports.tsx line 209: hasReportingAccess includes lider_generacion
- **Impact**: User can access /detailed-reports directly but cannot discover it via sidebar navigation.

### Gap 2: requiresGeneration inconsistency
- **Code**: `ROLE_ORGANIZATIONAL_REQUIREMENTS.lider_generacion.requiresGeneration = false` (types/roles.ts line 326)
- **Description**: "Must be assigned to a specific school and generation" (line 328)
- **Impact**: validateRoleAssignment() will NOT reject a lider_generacion assignment without a generation_id, breaking all generation-scoped reporting.

### Gap 3: Feedback page access without sidebar visibility
- **Sidebar**: `docente-assessments` has `restrictedRoles: ['docente', 'admin', 'consultor']` (Sidebar.tsx line 708-727). lider_generacion NOT in list.
- **API**: No role check in pages/api/docente/assessments/index.ts — queries by user_id only.
- **Page**: No role guard in pages/docente/assessments/index.tsx.
- **Impact**: If a lider_generacion has assessment instances assigned, they can access /docente/assessments but cannot discover via sidebar.

---

## SECURITY GAPS CONFIRMED (per DB Report — Document Only)

### RLS Gaps (from db-report.md)
1. **No generation-scoped RLS policies** on:
   - courses
   - quiz_submissions
   - quiz_responses
   - course_assignments
   - submissions
2. **No RLS on user_roles table** — information disclosure risk
3. **No RLS on profiles table** — student PII (Law 21.719 risk if application layer fails)
4. **pending_quiz_reviews accessibility unknown** — needs direct verification

### Data Source Inconsistency
- **profiles.generation_id vs. user_roles.generation_id**
  - No database-level sync enforced
  - overview.ts uses profiles.generation_id (lines 301-315)
  - detailed.ts uses user_roles.generation_id (lines 650-670)
  - filter-options.ts uses profiles.generation_id (lines 107-131)
- **Impact**: If test account has generation_id in user_roles but NOT in profiles:
  - detailed.ts works
  - overview.ts and filter-options.ts return empty

---

## FILE MAP VERIFICATION

All files referenced in scenarios exist and were analyzed:

**Core role files:**
- ✓ types/roles.ts
- ✓ utils/roleUtils.ts
- ✓ components/layout/Sidebar.tsx
- ✓ lib/assessment-permissions.ts

**API routes:**
- ✓ pages/api/reports/detailed.ts
- ✓ pages/api/reports/overview.ts
- ✓ pages/api/reports/filter-options.ts
- ✓ pages/api/reports/user-details.ts
- ✓ pages/api/dashboard/unified.ts
- ✓ pages/api/quiz-reviews/pending.ts
- ✓ pages/api/admin/courses/index.ts
- ✓ pages/api/admin/create-user.ts
- ✓ pages/api/admin/assessment-builder/templates/index.ts
- ✓ pages/api/courses/batch-assign.ts

**Pages:**
- ✓ pages/assignments.tsx
- ✓ pages/assignments/[id]/submissions.tsx
- ✓ pages/quiz-reviews.tsx
- ✓ pages/detailed-reports.tsx
- ✓ pages/docente/assessments/index.tsx
- ✓ pages/admin/configuration.tsx
- ✓ pages/admin/events.tsx
- ✓ pages/contracts.tsx

**Zero missing routes.**

---

## FINAL SCENARIO COUNT

| Category | Count | Notes |
|----------|-------|-------|
| Permission Boundaries | 16 | All permissions verified against role definition |
| Correct Access | 11 | All API routes verified |
| Generation Assignment Scoping | 5 | Data source inconsistencies documented |
| Sidebar Visibility | 23 | All items verified against filtering logic |
| Edge Cases | 7 | Includes requiresGeneration gap |
| **TOTAL** | **62** | Zero speculative scenarios |

---

## RISK ASSESSMENT

### Risk 1: Data Source Split (profiles vs. user_roles)
If test account has generation_id in user_roles but NOT in profiles, some APIs will work and others will return empty. Developer must ensure generation_id is set in BOTH tables.

### Risk 2: Missing RLS Enforcement
Without RLS policies on generation-scoped tables, lider_generacion could theoretically access other generations' data via direct REST API or SQL injection. Application-layer scoping provides partial protection.

### Risk 3: requiresGeneration = false
A lider_generacion can be created without a generation_id. This would cause all generation-scoped reports to fail or return empty results. Current production data shows all 16 lider_generacion roles have valid generation_id, so this gap hasn't been exploited.

### Risk 4: Sidebar Discoverability
Users cannot discover Reportes or Feedback pages via sidebar despite having API access. This is a UX issue, not security.

---

## VERDICT: READY FOR TESTING

All 62 scenarios are validated against the codebase. No speculative scenarios. All route references correct. Design gaps and security gaps documented per task spec instructions.

**Next Steps:**
1. Create test account `lider-gen.qa@fne.cl`
2. Create generation for school 257
3. Set generation_id in BOTH user_roles AND profiles
4. Execute all 62 scenarios
5. Document results in QA_TEST_RESULTS_LIDER_GENERACION.md

---

**Audit Completed:** 2026-02-08
**Developer Agent**: Pipeline
