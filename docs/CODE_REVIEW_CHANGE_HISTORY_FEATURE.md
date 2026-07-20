# Code Review: School Change History & Completion Status Feature

**Date:** March 16, 2026
**Feature:** Audit trail, versioning, and completion tracking for Contexto Transversal and Plan de Migración
**Scope:** 7 bridge tasks (#242–#249), across DB migration, 5 API endpoints, 2 UI components, 3 page integrations, and 4 test files

---

## 1. Problem Statement

The Genera LMS allows members of a school's **Equipo Directivo** (school-level administrators) to fill out two school-level instruments:

- **Preguntas de Contexto Transversal** — structural questions about the school (total students, grade levels, courses per level, implementation year, period system, Programa Inicia status) plus generic/custom questions defined by admins.
- **Plan de Migración** — a 5-year × 17-grade grid mapping each grade to a generation type (GT or GI) per year.

### What was missing

1. **No audit trail.** Neither feature recorded who changed what, when, or what the previous values were. The migration plan used a destructive delete-all-then-insert pattern on every save.
2. **No versioning.** Changes overwrote previous state entirely. No way to see what the plan or context answers looked like previously.
3. **No completion indicator.** No explicit "completed/incomplete" flag visible to all directivos showing whether the questionnaire and plan had been filled out.
4. **No traceability.** Chilean education law (Law 21.719) requires accountability for school-level decisions. There was no mechanism to trace who made changes to institutional data.

### What should happen (requirements)

- Both instruments available to Equipo Directivo members for **only their school** (already working).
- **Versioned and editable** — context and plans can change as schools begin implementation.
- **Shared completion** — once any directivo answers, it shows as complete for all team members (already school-level, not per-user).
- **Change tracking** — a display of what changed, when, and by whom, visible to all directivos.

---

## 2. Solution Architecture

### Design decisions

- **Followed existing audit pattern** (`licitacion_historial` table from the licitaciones module) — action name, previous/new state as JSONB, user_id, timestamp.
- **Inline UI** — collapsible "Historial de cambios" section at the bottom of each edit/view page, not a separate page.
- **View-only history** — no rollback capability (simpler, less risky).
- **Non-blocking audit logging** — all history writes wrapped in try/catch so audit failures never break save operations.
- **Shared permission utility** — extracted the duplicated `hasDirectivoPermission` function into `lib/permissions/directivo.ts`, imported by all 5 endpoints.

### Data model

```
school_change_history
├── id (UUID PK)
├── school_id (INT FK → schools)
├── feature ('transversal_context' | 'migration_plan' | 'context_responses')
├── action ('initial_save' | 'update')
├── previous_state (JSONB — snapshot before change)
├── new_state (JSONB — snapshot after change)
├── changed_fields (TEXT[] — field names that actually changed)
├── user_id (UUID FK → profiles)
├── user_name (TEXT — denormalized for display)
└── created_at (TIMESTAMPTZ)

school_plan_completion_status
├── id (UUID PK)
├── school_id (INT FK → schools)
├── feature ('migration_plan' | 'context_responses')
├── is_completed (BOOLEAN)
├── completed_at (TIMESTAMPTZ)
├── completed_by (UUID FK → profiles)
└── updated_at (TIMESTAMPTZ)
    UNIQUE(school_id, feature)

school_transversal_context (altered)
├── + is_completed (BOOLEAN DEFAULT FALSE)
├── + completed_at (TIMESTAMPTZ)
└── + completed_by (UUID FK → profiles)
```

### RLS policies

- `school_change_history`: Admin=ALL, Consultor=SELECT (via `consultant_assignments`), Directivo=SELECT+INSERT (own school).
- `school_plan_completion_status`: Admin=ALL, Consultor=SELECT, Directivo=SELECT+INSERT+UPDATE (own school).

---

## 3. Files Changed or Added

### New files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260316000000_add_school_change_history.sql` | DB migration: 2 new tables, ALTER on existing table, RLS policies, indexes |
| `lib/permissions/directivo.ts` | Shared permission check for directivo-level endpoints (admin, consultor, directivo) |
| `pages/api/school/change-history/index.ts` | GET endpoint: paginated change history filtered by school and feature |
| `pages/api/school/completion-status/index.ts` | GET endpoint: completion status for all 3 features per school |
| `components/school/ChangeHistorySection.tsx` | Reusable collapsible timeline component showing change history |
| `components/school/CompletionStatusBadge.tsx` | Badge component showing Completado/Pendiente with hover tooltip |
| `__tests__/api/school/change-history.test.ts` | API tests for change-history endpoint (Task B) |
| `__tests__/api/school/completion-status.test.ts` | API tests for completion-status endpoint (Task B) |
| `__tests__/api/school/audit-logging.test.ts` | Tests for audit logging in save endpoints (Task B) |
| `__tests__/components/school/ChangeHistorySection.test.tsx` | Component tests (Task B) |

### Modified files

| File | Changes |
|------|---------|
| `pages/api/school/transversal-context/index.ts` | Added audit logging to handlePost, imported shared permission util, added `createServiceRoleClient` import, passes `user.id` to handler, filters noise fields from diff, properly handles completion re-tracking |
| `pages/api/school/transversal-context/custom-responses.ts` | Added audit logging to handlePost, checks all required generic questions before marking complete, uses shared permission util |
| `pages/api/school/migration-plan/index.ts` | Added audit logging to handlePut with rollback safety (re-inserts on failed insert), uses shared permission util, validates minimum viable plan (all 5 years) before marking complete |
| `pages/school/transversal-context/index.tsx` | Added CompletionStatusBadge (with labels distinguishing structural vs responses), ChangeHistorySection (2 instances), fetches completion status on load |
| `pages/school/transversal-context/edit.tsx` | Added ChangeHistorySection (2 instances) below the form |
| `pages/school/migration-plan/index.tsx` | Added CompletionStatusBadge, ChangeHistorySection with grade-level field labels |

---

## 4. Detailed change walkthrough

### 4.1 Migration (`20260316000000_add_school_change_history.sql`)

Creates `school_change_history` with 3 indexes (school_id, school_id+feature, created_at DESC). Creates `school_plan_completion_status` with UNIQUE(school_id, feature) for safe upserts. ALTERs `school_transversal_context` to add completion columns. Enables RLS on both new tables with policies for all 3 roles.

### 4.2 Shared permission utility (`lib/permissions/directivo.ts`)

Extracted from duplicated code across 3 files. Checks in order: admin (any school), consultor (assigned schools via `consultant_assignments`), equipo_directivo (own school). Returns `{ hasPermission, schoolId, isAdmin }`.

### 4.3 Audit logging on save (3 modified API files)

Each save endpoint now:
1. Snapshots the current state before making changes
2. Performs the save operation
3. Computes a diff (which fields actually changed)
4. Inserts a `school_change_history` record with previous/new state, changed field names, user info
5. Updates completion status based on content validation

Key details per endpoint:

- **transversal-context/index.ts**: Filters `school_id`, `updated_at`, `created_at`, `id`, `is_completed`, `completed_at`, `completed_by` from diff to avoid noise. Completion requires `total_students + grade_levels + implementation_year + period_system`. Clears `completed_at`/`completed_by` to `null` when uncompleted.

- **custom-responses.ts**: Diffs by comparing question_id→response maps. Completion checks that ALL required generic questions have been answered (both in current batch and previously saved responses).

- **migration-plan/index.ts**: Uses `year-grade` composite keys for diff (e.g., `"3-7"` = Year 3, Grade ID 7). Added rollback: if insert fails after delete, re-inserts previous entries. Completion requires entries in all 5 years.

### 4.4 Read APIs (2 new endpoint files)

- **change-history**: Paginated GET with `limit`/`offset`, filterable by `feature`. Returns history array + total count. Uses service role client.
- **completion-status**: Returns status for all 3 features in a single response. Resolves `completed_by` UUIDs to names via batch profiles query. Gets `last_updated` info from most recent change history entry per feature.

### 4.5 UI components (2 new component files)

- **ChangeHistorySection**: Collapsible, lazy-loaded (only fetches on first expand). Timeline with dots, user name, relative time in Spanish, action label, changed fields with before→after values. "Ver más" pagination.
- **CompletionStatusBadge**: Green "Completado" or yellow "Pendiente" badge. Hover tooltip shows who completed it, when, and who last modified it.

### 4.6 Page integrations (3 modified page files)

- **transversal-context/index.tsx**: Two labeled badges ("Contexto Estructural" + "Preguntas de Contexto") in the status banner. Two ChangeHistorySection instances at the bottom (one per feature). Fetches completion status via `/api/school/completion-status`.
- **transversal-context/edit.tsx**: Two ChangeHistorySection instances below the form (structural context + custom responses).
- **migration-plan/index.tsx**: One badge + one ChangeHistorySection with grade-level field labels generated from the grades data.

---

## 5. Bugs found and fixed during review

### Round 1 (Task #247)

| # | Bug | Impact | Fix |
|---|-----|--------|-----|
| 1 | `ChangeHistorySection` read `previous_values`/`new_values` but API returns `previous_state`/`new_state` | Before→after values never displayed | Renamed interface fields and references |
| 2 | `actionLabel` mapped `'create'` but API writes `'initial_save'` | Raw string "initial_save" shown in UI | Updated mapping to `'initial_save'` → "Registro inicial" |
| 3 | `context_responses` always marked completed on any save | False positive completion for partially answered questionnaires | Added check for all required generic questions |
| 4 | Two CompletionStatusBadges without labels on index page | Users couldn't distinguish which badge was for which feature | Added labeled rows |

### Round 2 (Task #248)

| # | Bug | Impact | Fix |
|---|-----|--------|-----|
| 5 | Migration plan delete-then-insert not atomic | Data loss if insert fails after delete | Added rollback: re-insert previous entries on insert failure |
| 6 | Transversal context diff included noise fields (`school_id`, `updated_at`, etc.) | Audit trail showed spurious "changes" every save | Added `DIFF_IGNORE_FIELDS` filter |
| 7 | `completed_at`/`completed_by` only set on first completion, never updated | Stale completion info after uncomplete→re-complete cycle; `undefined` doesn't clear DB fields | Always update on completion, set to `null` on un-completion |
| 8 | Migration plan always marked "completed" on any save | Empty plans showed as Completado | Requires entries in all 5 years |

---

## 6. Security considerations

- All endpoints validate auth via `getApiUser()` + `hasDirectivoPermission()`.
- School-scoping enforced: directivos can only access their own school's data. Consultors validated against `consultant_assignments`.
- RLS policies provide defense-in-depth at the database level.
- Service role client used for cross-table writes (history logging, completion status updates).
- History logging wrapped in try/catch — audit failures are silent, never leak to users.
- `user_name` is denormalized (can go stale if profile name changes; accepted tradeoff matching existing `licitacion_historial` pattern).

---

## 7. Known limitations / future considerations

1. **No rollback capability** — history is view-only by design. Users can see what changed but cannot restore previous versions.
2. **Denormalized `user_name`** — stale if profile name changes. Could be resolved by always joining with profiles at read time, but current pattern matches the existing audit table.
3. **Migration plan still uses delete+insert** — now with rollback safety, but not a true database transaction. A Supabase RPC-based transaction would be more robust.
4. **No unique constraint on `ab_migration_plan(school_id, year_number, grade_id)`** — prevents using upsert pattern. Adding this constraint is recommended for long-term safety.
5. **CompletionStatusBadge tooltip overflow** — tooltip uses absolute positioning that may clip on small screens. Acceptable for now given school hardware constraints.

---

## 8. Test coverage (Task B — in progress)

4 test files being created:
- `__tests__/api/school/change-history.test.ts` — 9 test cases (auth, permissions, pagination, filtering)
- `__tests__/api/school/completion-status.test.ts` — 6 test cases (auth, status resolution, empty state)
- `__tests__/api/school/audit-logging.test.ts` — 7 test cases (diff computation, noise filtering, try/catch safety)
- `__tests__/components/school/ChangeHistorySection.test.tsx` — 10 test cases (render states, lazy-load, formatting)

---

## 9. Task execution summary

| Task ID | Title | Status | Duration |
|---------|-------|--------|----------|
| #242 | DB migration | Done | ~3 min |
| #243 | API audit logging on save | Done | ~4 min |
| #244 | Read APIs (history + completion) | Done | ~3 min |
| #245 | UI components + page integrations | Done | ~6 min |
| #247 | Bug fixes round 1 (4 bugs) | Done | ~5 min |
| #248 | Critical data integrity fixes (5 issues) | Done | ~4 min |
| #249 | Test coverage + polish | In progress | — |
