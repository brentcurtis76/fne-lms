# Course-enrolment provenance and entitlement — design and reconciliation (closure C2, decision D1, 2026-09-07)

> Governs migration `20260907120500_c2_course_entitlement.sql`, `pages/api/learning-paths/unassign.ts`, `pages/api/my-courses.ts`, `pages/api/admin/course-assignments.ts` and the seed scripts. Decision D1 (Brent, 2026-09-07): when the last valid learning-path entitlement disappears, course access granted solely through that path ends; independently granted access, other active entitlement sources and learning history/progress are preserved; historical enrolment origins are never guessed or bulk-deleted.

## 1. Model

`course_enrollments.access_origin ∈ { independent | learning_path | unknown }` (+ informational `source_path_id`, `access_origin_set_at`).

| Origin | Set by | Grants access |
|---|---|---|
| `learning_path` | `batch_assign_learning_path` (direct and group), a membership becoming active in an assigned community (`user_roles_enroll_group_paths`), a course added to an assigned path (`learning_path_courses_enroll_assignees`) — all through `lp_ensure_path_enrollments` | **while** an explicit non-cancelled `course_assignments` row exists **or** `lp_user_entitled_to_course(user, course)` is TRUE: a direct assignment or an active membership of an assigned group for **some** path that contains the course, evaluated live |
| `independent` | admin course assignment (`course-assignments.ts` → `admin_grant_course_access`, atomic; C-R1-03), the course-assignment matrix (`batch_assign_courses`, admin or consultor — new enrollment rows; existing rows gain an independent source without relabeling provenance), QA seed scripts, any future explicit grant; a literal admin promotes a row only through `admin_grant_course_access`; the backend (service role) may set it directly | always |
| `unknown` | every row that existed before the migration; any writer not yet declaring an origin (column default) | always — **explicitly unresolved**, preserved until reconciled (§3) |

**Access is live, never a stored revocation.** `auth_is_course_student(course)` (the predicate behind the module / lesson / block / assignment student policies) and the `courses` policy `enrolled_or_owner_can_read_courses` now require `course_enrollment_grants_access(auth.uid(), course)`. `auth_accessible_course_ids()` gives `my-courses` the same answer. So:

| Transition | Effect on access | Effect on the enrolment row |
|---|---|---|
| direct unassignment (`unassign.ts` → delete the direct row only) | path-only access ends immediately; access through another path or the group survives | untouched (progress, completion, certificate kept) |
| group unassignment (delete the group row only — members' direct rows are **never** deleted) | same, for members | untouched |
| membership deactivated / user leaves the community | path-only access ends | untouched |
| membership (re)activated / user joins | access (re)appears; missing rows are created with origin `learning_path` | created if missing, never duplicated |
| course added to a path | current assignees and members get a row and access | created if missing |
| course removed from a path | access ends unless another path or an independent row covers it | untouched |
| path deleted | `source_path_id` → NULL; access ends unless another source covers it | untouched |
| reassignment | access restored; no duplicate row | untouched |
| a learner tries to promote their own row, re-associate it to another course or user, or forge who / how granted it (C-R1-01) | refused (`42501`: identity and provenance columns are outside the `authenticated` UPDATE grant; `course_enrollments_origin_guard` refuses the grant columns and every definer-path attempt) — own progress / completion / status writes still work | untouched |

Progress records (`learning_path_user_progress`, `course_enrollments.progress_percentage`, `lesson_progress`) grant nothing. Tests: `supabase/tests/078-c2-course-entitlement.sql` (163 assertions after C-R1), `__tests__/api/learning-paths/unassign-sources.test.ts`, `__tests__/api/admin/course-assignments.test.ts`, E2E `learning-path-governance.spec.ts` C2, C-R1-01, C-R1-03.

**Independent grant surfaces (C-R2-01, 2026-09-08).** A non-cancelled `course_assignments(course_id, teacher_id)` row is an explicit independent source, regardless of enrollment origin. Path writers never create this row; ordinary learners cannot INSERT/UPDATE/DELETE it through RLS, and the batch definer writer verifies an active admin/consultor role and the forced-password gate. `course_enrollment_grants_access` recognizes that source; `auth_accessible_course_ids` uses the same helper. An enrollment is still required, and progress alone never grants access. Historical origins are not inferred, rewritten or deleted. Existing explicit assignments are honored immediately at migration #6, including the older application's writes.

`batch_assign_courses` always establishes the enrollment, even for an existing assignment. New enrollments declare `independent`; existing enrollment identity, origin, source, enrollment time, progress, completion and certificate history remain unchanged. Existing rows may be reactivated and their lesson count refreshed, preserving the authorized batch contract. An explicit retry reactivates a cancelled assignment. Recipients are deduplicated and sorted; unique-key conflict handling and ordered assignment/enrollment row locks serialize concurrent grants. An invalid recipient or enrollment failure aborts the entire batch. `admin_grant_course_access` retains its separate literal-admin/backend authority and origin promotion; it now locks explicit sources in the same recipient order before classifying results.

The batch result retains `success`, `assignments_created`, `assignments_skipped`, `enrollments_created`, `assignment_ids` and `message`. `assignments_skipped` counts distinct existing assignment rows (insertion skipped, entitlement establishment still performed). `enrollments_created` now counts actual INSERTs. Added `enrollments_promoted` counts existing path-origin enrollments newly backed by a created/reactivated independent source, **not an origin rewrite**; `enrollments_unchanged` counts existing enrollments whose independent-effective access is already preserved (including unknown origins). These three enrollment outcomes partition distinct recipients. The admin RPC's promotion counter continues to describe its actual origin rewrites. The application exposes the added counts and limits notifications/audit creation to returned newly created assignment IDs; legacy applications can consume the original result keys unchanged.

Deleting or cancelling the explicit source leaves the other sources to determine access: an independent/unknown enrollment still grants access, whereas a path-origin enrollment needs a remaining source. This follows live source semantics; neither path removal nor membership loss modifies the explicit course assignment. Tests: pgTAP `080-c-r2-independent-course-grant.sql`, `scripts/ci/course-grant-proof.mjs`, batch-route Vitest and E2E `C-R2-01`. Local evidence and independent-review status are recorded in the current review request.

## 2. What the unassign route does now

Removes exactly the selected sources (`userIds` → direct rows with `group_id IS NULL`; `groupIds` → group rows with `user_id IS NULL`), reports the rows the database actually deleted (`unassigned_count`, `removed.directUserIds`, `removed.groupIds`, `removed.notFound`), is idempotent (a retry reports 0), audits only removed sources, and never touches `course_enrollments`. The previous member-expansion delete (the audit's P2 finding) is gone.

## 3. Historical `unknown` rows — aggregate-only reconciliation (operator-pending, separately authorized)

Nothing in this candidate reclassifies or deletes a historical row. The provenance of a row created before 2026-09-07 cannot be proved from the data (`enrollment_type = 'assigned'` was written by every writer; membership and timestamps are circumstantial). The safe state is what ships: `unknown` behaves like `independent` (existing access preserved) until Brent decides.

**Aggregate-only report** (admin or backend; counts only, no identifiers): `SELECT public.lp_enrollment_origin_report();` returns

- `total_enrollments`, `by_origin`
- `unknown_total`, `unknown_with_current_path_entitlement`, `unknown_without_current_path_entitlement`
- `unknown_assigned_type_near_a_path_assignment` — heuristic CANDIDATES: `assigned`-type unknown rows whose `enrolled_at` is within 60 s of a direct assignment of a path containing the course, for the same user (a plausible batch_assign side effect; not proof)
- `learning_path_origin_lapsed` — path-origin rows without current path entitlement (history kept; C-R2-01: an explicit independent assignment may still grant access, so this is not a count of inaccessible courses)
- `unknown_created_after_provenance_started` — must stay 0; a nonzero value identifies a writer that does not declare an origin

**Bounded proposal (not executed, not authorized here):**

1. Run the report in Production after the release (postflight Q9) and record the counts.
2. Decision for Brent, per bucket: (a) `unknown` rows **with** a current path entitlement — leaving them `unknown` changes nothing today; relabelling them `learning_path` would end their access if the path later disappears (D1 semantics going forward); (b) `unknown` rows **without** any entitlement — these are either independent grants or leftovers of past unassignments; no data can tell which, so the options are "keep as independent" (status quo) or an explicit, per-course/per-cohort operator decision; (c) the heuristic candidates are a starting point for (b), never an automatic action.
3. Any relabelling would be a separately authorized, additive data migration (`UPDATE … SET access_origin` under the origin guard as backend), preceded by an aggregate dry run and an explicit list of affected counts per course — never a bulk delete, never per-row guessing in code.

## 4. Limits stated plainly

- Historical origins are **not** reconciled by this candidate; the report and the proposal above are the deliverable.
- Enrolment rows are never deleted by entitlement changes; reports that count enrolments (`community_progress_report`, `school_progress_report`, the course half of `overview.ts`) still count a lapsed path-only enrolment as history.
- The `courses` policy still admits `created_by = auth.uid()` and `is_admin_or_consultor`; those audiences are unchanged.
