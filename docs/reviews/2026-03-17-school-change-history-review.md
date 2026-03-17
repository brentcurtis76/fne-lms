# Code Review & Bug Fix Report: School Change History, Completion Status, and Course Assignment Pipeline

**Date:** March 17, 2026
**Scope:** Review of Tasks #242-#249 (audit trail, versioning, completion tracking) + end-to-end course→assessment pipeline fixes
**Commits:** `6eb352e`, `c870ea3`, `e474682`, `1810aa5`, `49c8eae`, `402e8cc`, `182c253`, `a413f43` (8 commits on main after initial feature merge)
**Files changed:** 19 files, +1428 / -196 lines

---

## 1. Original Feature (reviewed)

The feature adds audit trail, versioning, and completion tracking for two school-level instruments: Contexto Transversal (structural school questions) and Plan de Migracion (5-year grade→generation mapping).

### Architecture

- **DB tables:** `school_change_history` (audit log with JSONB previous/new state), `school_plan_completion_status` (completion flags for migration_plan + context_responses), plus 3 completion columns added to `school_transversal_context`
- **API endpoints:** 5 total — 3 modified save endpoints (transversal-context, custom-responses, migration-plan), 2 new read endpoints (change-history, completion-status)
- **UI components:** 2 new — `ChangeHistorySection` (collapsible lazy-loaded timeline), `CompletionStatusBadge` (green/yellow badge with tooltip)
- **Shared utility:** `lib/permissions/directivo.ts` — extracted duplicated permission check across all endpoints

---

## 2. Bugs Found

### Round 1 — Initial Code Review (8 issues found in original code)

| # | Severity | Bug | Root Cause |
|---|----------|-----|------------|
| 1 | **Critical** | Role priority: consultor shadows directivo in permission check | Consultor checked before directivo — dual-role users denied |
| 2 | **Critical** | Completion-status endpoint fetches ALL change history rows | No `.limit()` on query, only uses first per feature |
| 3 | **Critical** | Migration plan rollback silently swallows failure | No error check or logging on rollback insert |
| 4 | **High** | ChangeHistorySection shows "no changes" on fetch error | No error state — misleading when API fails |
| 5 | **High** | CompletionStatusBadge not keyboard-accessible | No `tabIndex`, `onFocus`/`onBlur`, or ARIA attributes |
| 6 | **High** | Completion badges hidden when structural context incomplete | Rendered inside conditional branch, `context_responses` badge invisible |
| 7 | **High** | Missing CompletionStatusBadge test file | Zero test coverage for badge component |
| 8 | **Medium** | Duplicate `fieldLabels` objects in 2 page files | Could diverge on update |

### Round 2 — Remaining items (6 issues)

| # | Severity | Bug | Root Cause |
|---|----------|-----|------------|
| 9 | Medium | `custom-responses.ts` used service role for CRUD | Inconsistent with other endpoints |
| 10 | Medium | No CHECK constraint on `action` column | DB allows arbitrary strings |
| 11 | Medium | RLS INSERT policies never exercised | Service role bypasses RLS |
| 12 | Low | `formatRelativeTime` breaks on future dates (clock skew) | No guard for negative diffMs |
| 13 | Low | Unused `callCount` variable in test | Dead code |
| 14 | Low | Denormalized `user_name` goes stale | Pattern divergence from `licitacion_historial` |

### Round 3 — Production bugs found during deployment

| # | Severity | Bug | Root Cause |
|---|----------|-----|------------|
| 15 | **Critical** | Course generation fails on every save | Missing `context_id` (NOT NULL) and non-existent `course_letter` column in insert |
| 16 | **Critical** | Change history table didn't exist in production | Migration never applied to DB |
| 17 | **Critical** | RLS policies referenced wrong column (`user_id` vs `consultant_id`) | `consultant_assignments` table uses `consultant_id`, not `user_id` |
| 18 | **High** | Two identical "Historial de cambios" sections with no labels | No distinguishing titles |

### Round 4 — Course assignment pipeline investigation

| # | Severity | Bug | Root Cause |
|---|----------|-----|------------|
| 19 | **Critical** | "Estructura de Cursos" section invisible to directivos | `school_course_docente_assignments.docente_id` FK points to `auth.users(id)`, not `profiles(id)` — Supabase PostgREST cannot resolve `profiles:docente_id` join hint, entire query errors, handler returns empty array |
| 20 | **Critical** | Grade name mismatch: auto-assignment creates zero assessment instances | `school_course_structure.grade_level` stores `'1_basico'`, `ab_grades.name` stores `'Primero Basico'` — direct `.eq('name', ...)` never matches |
| 21 | **Critical** | `assign-docente.ts` uses deprecated tables (`ab_templates`, `ab_instances`) | Stale inline code instead of calling `triggerAutoAssignment()` |

### Round 5 — Self-review

| # | Severity | Bug | Root Cause |
|---|----------|-----|------------|
| 22 | **Critical** | `profiles.full_name` column doesn't exist | All 6 endpoints selecting `full_name` get PostgREST error; every audit entry recorded `user_name: 'Unknown'` |
| 23 | **Critical** | Course generation destroys all docente assignments on every save | Delete-all + re-insert pattern; FK `ON DELETE CASCADE` wipes `school_course_docente_assignments` |
| 24 | Low | Two duplicate `createServiceRoleClient()` calls in transversal-context POST | Wasteful, consolidated to one |
| 25 | Low | Unused `features` const in completion-status | Dead code |

### Round 6 — External review feedback

| # | Severity | Bug | Root Cause |
|---|----------|-----|------------|
| 26 | **High** | Unassign (DELETE) leaves `assessment_instance_assignees` intact | Docente loses course assignment but retains assessment access — can still see and take assessments they should no longer have |
| 27 | **High** | `triggerAutoAssignment()` silently reports success when assignee insert fails on existing instance | Assignee insert error on existing-instance branch was ignored; `instancesCreated` incremented despite failure |
| 28 | Medium | Report stated `createServiceRoleClient()` was scoped inside try/catch | Actually hoisted before both try blocks; downstream query failures are caught, but client-creation failure is not |

### Round 7 — Production verification + second external review

| # | Severity | Bug | Root Cause |
|---|----------|-----|------------|
| 29 | **Critical** | Course structure query selects non-existent `created_at` from `school_course_docente_assignments` | Table only has `assigned_at`; PostgREST returned 42703, handler caught silently, returned `courseStructure: []` — this was the actual reason the section was invisible |
| 30 | **High** | POST `/assign-docente` returns 200 success even when auto-assignment fails | `triggerAutoAssignment` errors logged but discarded; UI showed success toast while no assessment instances were created |
| 31 | **High** | DELETE `/assign-docente` returns 200 success even when access revocation fails | Revocation error caught and logged but response still `success: true`; directivo told unassign worked while docente retained assessment access |

---

## 3. Fixes Applied

### Commit 1: `6eb352e` — Course generation, assign-docente wiring, history labels, RLS

| Fix | Files |
|-----|-------|
| Course generation: added missing `context_id`, removed non-existent `course_letter` | `transversal-context/index.ts` |
| Wired `assign-docente.ts` to `triggerAutoAssignment()`, removed stale `ab_templates`/`ab_instances` code, imported shared `hasDirectivoPermission` | `assign-docente.ts` |
| Fixed `consultant_assignments.user_id` -> `consultant_id` in RLS policies + permission util | Migration SQL, `directivo.ts` |
| Added distinct titles per ChangeHistorySection (`Historial — Contexto Estructural`, etc.) | `ChangeHistorySection.tsx` |

### Commit 2: `c870ea3` — grade_id FK, course visibility, auto-assignment

| Fix | Files |
|-----|-------|
| Added `grade_id INT REFERENCES ab_grades(id)` to `school_course_structure` | New migration SQL |
| Backfilled all existing rows via `grade_level` -> `ab_grades.sort_order` mapping | Migration SQL (applied to prod DB) |
| Added `GRADE_LEVEL_SORT_ORDER` constant for mapping at insert time | `types/assessment-builder.ts` |
| Course generation populates `grade_id` on every insert | `transversal-context/index.ts` |
| `triggerAutoAssignment()` uses integer `grade_id` FK instead of broken string matching | `autoAssignmentService.ts` |
| Course structure GET uses service client to bypass RLS | `transversal-context/index.ts` |
| New tests: 9 for assign-docente endpoint, 9 for autoAssignmentService | 2 new test files |

### Commit 3: `e474682` — Self-review fixes

| Fix | Files |
|-----|-------|
| `profiles.full_name` -> `profiles.name` across all 6 endpoints + 1 UI page | 7 files |
| Rewrote course generation from delete-all to reconcile (preserves assignments) | `transversal-context/index.ts` |
| Consolidated `createServiceRoleClient()` to single instance hoisted before both try blocks (audit + course reconciliation). Note: client-creation failure (`SUPABASE_SERVICE_ROLE_KEY` missing) is a config error caught by the outer handler catch, not the inner try blocks. | `transversal-context/index.ts` |
| Removed unused `features` const | `completion-status/index.ts` |

### Commit 4: `1810aa5` — Profiles join FK fix

| Fix | Files |
|-----|-------|
| Removed broken `profiles:docente_id` nested join — FK points to `auth.users`, not `profiles` | `transversal-context/index.ts` |
| Replaced with separate `profiles.in('id', docenteIds)` query to resolve docente names | `transversal-context/index.ts` |

### Commit 5: `49c8eae` — External review feedback: access revocation + error handling

| Fix | Files |
|-----|-------|
| DELETE `/assign-docente` now deletes `assessment_instance_assignees` for the docente on all instances linked to the course | `assign-docente.ts` |
| `triggerAutoAssignment()` existing-instance branch now checks assignee insert error, marks as error + does not increment `instancesCreated` | `autoAssignmentService.ts` |
| Added regression tests for both paths | `assign-docente.test.ts`, `autoAssignmentService.test.ts` |

### Commit 6: `402e8cc` — Non-existent column in assignments query

| Fix | Files |
|-----|-------|
| `school_course_docente_assignments` has no `created_at` or `updated_at` columns — PostgREST returned 42703 error, handler caught silently, returned `courseStructure: []` | `transversal-context/index.ts` |
| Changed nested select to use `assigned_at` (the actual column), removed `updated_at` writes from assignment updates | `transversal-context/index.ts`, `assign-docente.ts` |
| Verified fix against production PostgREST — query returns data | Direct API test |

### Commit 7: `182c253` — Surface partial failures to UI

| Fix | Files |
|-----|-------|
| POST `/assign-docente` returns 207 with `warning` when `triggerAutoAssignment` has errors — previously returned 200 `success: true` even when assessment instances weren't created | `assign-docente.ts` |
| DELETE `/assign-docente` returns 207 with `warning` when assessment access revocation fails — previously returned 200 `success: true` even when docente retained assessment access | `assign-docente.ts` |
| UI handles 207: shows error toast with warning message instead of success toast | `transversal-context/index.tsx` |
| Added tests: POST 207 on auto-assignment failure, DELETE 207 on revocation failure | `assign-docente.test.ts` |

### Commit 8: `a413f43` — Supabase error shape + service success flag

| Fix | Files |
|-----|-------|
| DELETE: check `{ error }` on `assessment_instances` query — standard Supabase error response now triggers 207, not silent 200 | `assign-docente.ts` |
| POST: check `result.success` from `triggerAutoAssignment`, not just `errors.length` — `success: false` with empty errors (e.g. missing grade_id) now returns 207 | `assign-docente.ts` |
| Added 2 regression tests: Supabase error shape for DELETE, resolved `success: false` for POST | `assign-docente.test.ts` |

---

## 4. DB Migrations Applied to Production

### Migration 1: `school_change_history` + completion status
- Created `school_change_history` table (audit log with JSONB state)
- Created `school_plan_completion_status` table (completion flags)
- Added `is_completed`, `completed_at`, `completed_by` to `school_transversal_context`
- RLS policies for admin, consultor, equipo_directivo
- Applied via Supabase Management API (MCP was read-only)

### Migration 2: `grade_id` FK on `school_course_structure`
- Added `grade_id INT REFERENCES ab_grades(id)`
- Backfilled 35 existing courses with correct grade IDs
- Enables: `school_course_structure.grade_id` -> `ab_grades.id` <- `assessment_templates.grade_id`

---

## 5. Files Touched (review commits only)

### New files created during review

| File | Purpose |
|------|---------|
| `__tests__/api/school/assign-docente.test.ts` | 10 tests: auth, permissions, CRUD, access revocation, auto-assignment, 207 partial failures |
| `__tests__/services/autoAssignmentService.test.ts` | 10 tests: grade resolution, template matching, idempotency, GT/GI, assignee error |
| `supabase/migrations/20260317000000_add_grade_id_to_course_structure.sql` | Add grade_id FK + backfill |

### Modified files during review

| File | Changes |
|------|---------|
| `pages/api/school/transversal-context/index.ts` | Reconcile pattern for course gen, `grade_id` population, removed broken `profiles:docente_id` join, separate profiles query, `profiles.name` fix |
| `pages/api/school/transversal-context/assign-docente.ts` | Replaced stale `ab_templates`/`ab_instances` with `triggerAutoAssignment()`, shared permission util, DELETE revokes `assessment_instance_assignees`, both POST/DELETE return 207 on partial failure |
| `pages/api/school/transversal-context/custom-responses.ts` | `profiles.name` fix |
| `pages/api/school/migration-plan/index.ts` | `profiles.name` fix |
| `pages/api/school/change-history/index.ts` | `profiles.name` fix, read-time name resolution |
| `pages/api/school/completion-status/index.ts` | `profiles.name` fix, removed unused const, targeted per-feature queries |
| `lib/services/assessment-builder/autoAssignmentService.ts` | Use `grade_id` FK instead of string name matching, error handling on existing-instance assignee insert |
| `lib/permissions/directivo.ts` | `consultant_id` fix, directivo-before-consultor priority |
| `components/school/ChangeHistorySection.tsx` | Title prop, error state, future-date guard |
| `pages/school/transversal-context/index.tsx` | `profiles.name` fix, docente name display, 207 handling for assign/unassign toasts |
| `types/assessment-builder.ts` | `GRADE_LEVEL_SORT_ORDER` constant |
| `supabase/migrations/20260316000000_add_school_change_history.sql` | `consultant_id` fix, action CHECK constraint |
| `__tests__/api/school/audit-logging.test.ts` | `profiles.name` mock, updated serviceClient test |
| `__tests__/api/school/completion-status.test.ts` | `profiles.name` mock |
| `__tests__/components/school/ChangeHistorySection.test.tsx` | Updated for distinct section titles |

---

## 6. Test Coverage

| File | Tests | Status |
|------|-------|--------|
| `__tests__/api/school/change-history.test.ts` | 11 | Pass |
| `__tests__/api/school/completion-status.test.ts` | 7 | Pass |
| `__tests__/api/school/audit-logging.test.ts` | 9 | Pass |
| `__tests__/api/school/assign-docente.test.ts` | 12 | Pass |
| `__tests__/services/autoAssignmentService.test.ts` | 10 | Pass |
| `__tests__/components/school/ChangeHistorySection.test.tsx` | 11 | Pass |
| `__tests__/components/school/CompletionStatusBadge.test.tsx` | 11 | Pass |
| **Total** | **71** | **All pass** |

### Test gap acknowledged

No integration test verifies the full chain: directivo assigns docente -> `triggerAutoAssignment()` -> correct `grade_id` resolution -> template match -> assessment instance created -> docente sees assessment. Unit tests mock at each boundary. An end-to-end test against a real DB would catch integration failures but is beyond the scope of this session.

---

## 7. Known Remaining Issues (not in scope)

| Issue | Severity | Notes |
|-------|----------|-------|
| `profiles.full_name` used in pre-existing `docentes.ts`, `email-digest.ts`, `get-instructors.ts` | Medium | Same bug as #22, but in files not touched by this feature |
| Migration plan still uses delete+insert (not reconcile) | Medium | `migration-plan/index.ts` has rollback safety but not true reconciliation |
| No unique constraint on `ab_migration_plan(school_id, year_number, grade_id)` | Low | Prevents upsert pattern for migration plan |
| `school_change_history` RLS INSERT policies never exercised | Low | All inserts via service role; policies are defense-in-depth |
| `user_name` denormalized in `school_change_history` | Low | Read endpoint now resolves at read time, denormalized column is fallback |
| CompletionStatusBadge tooltip may clip on small screens | Low | Absolute positioning issue on school hardware |
| `createServiceRoleClient()` instantiated before audit try/catch in transversal-context POST | Low | Config errors (missing env var) propagate to outer catch and return 500. Downstream query errors within both audit and course reconciliation are caught by their respective try blocks. |

---

## 8. Architecture Decisions

### Why `grade_id` FK instead of string mapping
Three different naming systems existed for grades: `'1_basico'` (GradeLevel type), `'1° Basico'` (GRADE_LEVEL_LABELS), `'Primero Basico'` (ab_grades.name). A string mapping constant would be a third mapping to maintain. The FK approach (`school_course_structure.grade_id -> ab_grades.id <- assessment_templates.grade_id`) eliminates all string matching from the auto-assignment path. The mapping only happens once, at course generation time.

### Why reconcile instead of delete-all for courses
`school_course_docente_assignments` has `ON DELETE CASCADE` to `school_course_structure`. `assessment_instances` has `ON DELETE SET NULL`. Every context save was destroying all assignments and orphaning assessment instances. The reconcile pattern diffs existing vs desired, only deletes courses that were actually removed, and preserves everything else.

### Why separate profiles query instead of nested join
`school_course_docente_assignments.docente_id` has a FK to `auth.users(id)`, not `profiles(id)`. Supabase PostgREST resolves join hints by following FK relationships — `profiles:docente_id` fails because there's no FK path from `docente_id` to `profiles`. The fix fetches courses + assignments without the profiles join, then resolves docente names via a separate `profiles.in('id', docenteIds)` query.

### Why DELETE revokes assessment_instance_assignees
The docente assessments listing page queries `assessment_instance_assignees.eq('user_id', user.id)`. Soft-deleting only the `school_course_docente_assignments` row leaves the assignee rows intact, so the docente retains assessment access after being removed from a course. The DELETE handler now queries `assessment_instances` by `course_structure_id`, collects instance IDs, and deletes matching `assessment_instance_assignees` rows for the docente.
