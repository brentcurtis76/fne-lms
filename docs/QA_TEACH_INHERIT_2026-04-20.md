# QA Manual Test — Docente Role Inheritance

**Date:** 2026-04-20
**Feature branch:** `feat/teach-inherit` (14 commits)
**Merge commit:** (fill in after merge)
**Risk level:** Low (no production users currently active)
**Rollback:** `git revert <merge-commit-sha>` + push

## What this feature does

Non-docente leadership roles (`admin`, `consultor`, `equipo_directivo`, `lider_generacion`, `lider_comunidad`) now **inherit docente privileges** across the platform. Before this change, a `lider_comunidad` who needed to teach (e.g. be assigned as profesor jefe of a course) had to also be given a second `docente` role. Now the leadership role alone is enough.

**Explicitly excluded from inheritance:** `supervisor_de_red`, `community_manager`, `encargado_licitacion`.

## Test users (production)

All live at production school `id=257` "QA Test School" (except global admin).

| Role                | Email                         | User ID                              |
| ------------------- | ----------------------------- | ------------------------------------ |
| admin (global)      | admin.qa@fne.cl               | 7650804a-fe7d-476a-b988-25ce6201aeda |
| consultor           | consultor.qa@fne.cl           | 16943651-af94-41d7-8da3-2b9e3f7d3f69 |
| equipo_directivo    | directivo.qa@fne.cl           | a3e29412-0903-49dc-b5f4-530eab2ffb7f |
| docente             | docente.qa@fne.cl             | 14ee694e-b615-40d1-b7db-f219aa88b4b3 |
| lider_comunidad     | lider.qa@fne.cl               | 71ae0033-8d35-40bd-a141-e6da44b664fa |
| supervisor_de_red   | supervisor.qa@fne.cl          | 873ef5ad-b4b6-441f-8e14-fa7752d18af3 |
| encargado_licitacion| encargado.licitacion.qa@fne.cl| 770400d5-05cb-43f8-a9ba-5d6220ec69a0 |

## Seed data

**None required.** QA Test School already has many unassigned transversal-context courses (e.g. `1 BASICO B`, `1 BASICO C`, `1 MEDIO A`, `2 BASICO A`, etc.). Use any course without an assigned docente as the target for the assignment tests.

---

## Test scenarios

Run these in order. Each should take 1–2 minutes. Stop and flag if any expected outcome fails.

### 1. Core: Lider Comunidad can be assigned as profesor jefe

**The headline test for this feature.**

- [ ] Log in as **directivo.qa@fne.cl**
- [ ] Go to `/school/transversal-context`
- [ ] Pick an unassigned course (e.g. "1 BASICO B")
- [ ] Open the assignment modal
- [ ] **Expected:** "Líder Comunidad QA" appears in the docente dropdown, suffixed with `— Líder comunidad`
- [ ] Select them and confirm the assignment
- [ ] Refresh the page
- [ ] **Expected:** Assignment persists. Course now shows Líder Comunidad QA as profesor jefe.

### 2. Regression: Actual docente still assignable

- [ ] Still logged in as directivo.qa
- [ ] Pick a different unassigned course
- [ ] **Expected:** "Docente QA" appears in the dropdown with `— Docente` suffix
- [ ] Assign them; confirm persistence

### 3. Dropdown shows role badges correctly

- [ ] Open the assignment modal on any course
- [ ] **Expected:** Each person in the dropdown is shown as `Name — Role1[, Role2, …]`
  - Docente QA → "— Docente"
  - Líder Comunidad QA → "— Líder comunidad"
- [ ] Close without assigning

### 4. Excluded roles do NOT appear

- [ ] Open the assignment modal
- [ ] **Expected:** these roles must NOT appear:
  - supervisor.qa@fne.cl (supervisor_de_red)
  - encargado.licitacion.qa@fne.cl (encargado_licitacion)
- [ ] community_manager shares admin account, skip

### 5. Global admin does NOT leak across schools

This is the security guarantee from slice 1: admins/consultors without a school-scoped role row shouldn't leak into a school's dropdown.

- [ ] **Expected:** admin.qa@fne.cl (school_id = null) should NOT appear in QA Test School's dropdown.
- [ ] Consultor QA does have a school_id=257 role row, so they MAY appear — that's intentional.

### 6. Reports: leadership roles count as teachers

Slice 2 behavior.

- [ ] Log in as **admin.qa@fne.cl**
- [ ] Visit `/reportes` (detailed reports)
- [ ] Find a school-level report. Confirm it loads without errors.
- [ ] Log in as **directivo.qa@fne.cl**
- [ ] Visit the school report for QA Test School
- [ ] **Expected:** teacher counts include leadership-role users who teach; no 500 errors
- [ ] Eyeball the numbers — they should be plausible (not zero, not inflated by 10x)

### 7. Feedback permission: lider_comunidad can grade

Slice 3 behavior.

- [ ] Log in as **lider.qa@fne.cl**
- [ ] Navigate to an assignment at QA Test School that has a submission to grade (if one exists)
- [ ] Attempt to submit feedback
- [ ] **Expected:** accepted (200). Previously this would have returned 403 since lider_comunidad ≠ docente.
- [ ] If no assignment to grade exists, skip this step — it's not worth seeding one just for this.

### 8. Assignment group flow: school resolution prefers teaching role

Slice 3 behavior.

- [ ] Log in as **lider.qa@fne.cl**
- [ ] Go to `/tareas` (assignments)
- [ ] Open or create any group assignment
- [ ] **Expected:** the feature works without errors. The user's school should resolve to QA Test School (id=257), not fall through to a wrong school.

### 9. Community scoping regression guard

Slice 3 fix — the `getUnassignedStudents` flow should not leak across communities.

- [ ] Log in as **consultor.qa@fne.cl** (who has access to consultorías)
- [ ] Navigate to a group assignment flow that uses "unassigned students" (admin group assignment view)
- [ ] **Expected:** returned members all belong to the target community — no users from other communities appear

### 10. Docente-only users still work as before

No regression on pure docentes.

- [ ] Log in as **docente.qa@fne.cl**
- [ ] Visit `/dashboard`
- [ ] **Expected:** docente's dashboard loads, they see their expected data scope (students at their school)
- [ ] Try to visit `/reportes`
- [ ] **Expected:** redirected to `/dashboard` (pure docentes are restricted from detailed reports — unchanged behavior)

### 11. Leadership-role user's dashboard still works

Sanity check that we didn't break leadership dashboards.

- [ ] Log in as **lider.qa@fne.cl**
- [ ] Visit `/dashboard`
- [ ] **Expected:** lider_comunidad's own dashboard loads (community-scoped stats title "Estadísticas de tu Comunidad", community members visible)
- [ ] Log in as **directivo.qa@fne.cl**
- [ ] Visit `/dashboard`
- [ ] **Expected:** directivo dashboard loads (school-scoped)

---

## What to do if something breaks

1. **Capture the bug** — browser console errors, network tab response body, URL, user, timestamp
2. **Revert the merge** — fastest rollback is `git revert <merge-commit-sha>` and push. This creates an un-revert commit on main. Production redeploys automatically.
3. **File the bug** with the captured details. I can then fix and re-deploy.

Because no production users are currently on the platform, there is no urgency to fix in place — rolling back is safe.

## Summary of what shipped

- **utils/roleUtils.ts** — `TEACHING_ELIGIBLE_ROLES` + `canTeach()` helpers
- **pages/api/school/transversal-context/docentes.ts** — dropdown API now returns all teaching-eligible users at the school, with role badges
- **pages/school/transversal-context/index.tsx** — UI renders role labels next to each option
- **pages/api/reports/{school, overview, course-analytics}.ts** — teacher/student classification uses `user_roles` consistently and all teaching-eligible roles
- **pages/api/assignments/{eligible-classmates, create-group, add-classmates, feedback}.ts** — school resolution and feedback permission now honor inheritance
- **lib/services/groupAssignmentsCorrected.js** — community-member query widened, community scoping preserved

Groups audited and left unchanged (intentional — labels, per-role UX, or scoping): quiz reviews, dashboards, admin/user management, auth/sidebar, notification permissions, bulk user parser, scripts/seeds.
