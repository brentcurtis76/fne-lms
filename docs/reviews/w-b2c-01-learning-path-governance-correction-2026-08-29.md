# W-B2c-01 — Learning-path governance correction: global templates, literal-admin-only management — 2026-08-29

**Authority:** product-owner decisions by Brent, dated 2026-08-29 (§1) · **Governing records advanced by this correction:** release protocol revision 9, normalization report §14, W-PC-06 evidence record §8, `santa-marta-work-items.csv` rows `W-PC-06` / `W-B2d-01` / `W-B2c-01`, `PROJECT_STATE.md` · **Validator:** `scripts/check-ledger.mjs` (revised check **[21 clasificación]**, new check **[22 semántica global]**).

This is a **documentation-only** governance correction. It performs and authorizes **no** implementation, no migration, no RLS change, no API change, no test-suite change, no Supabase call, no database query or mutation, and no production access of any kind. The frozen claim snapshot (`santa-marta-claims.csv`, SHA-256 `d598f29b39d8d5ac9c1289a7c030221c93a3c8897c91f19e395f99486c68cce7`) and the archived legacy ledger (SHA-256 `009f14abccec97d7ada4b559c9aaeb24ac5b7aab54563a5c1151e511dc2c7fe9`) are preserved byte for byte.

---

## 1. Authoritative owner decisions (Brent, 2026-08-29)

1. `learning_paths` rows are **global FNE templates**.
2. **No school owns a learning path.**
3. **Learning paths are not generation-specific.**
4. `school_id` and `generation_id` being NULL on existing `learning_paths` rows is **intentional global scope**, not missing or corrupt ownership data.
5. A path may be assigned through the assignment matrix to users or groups **in any school**.
6. Assignment affects **availability and use**; it does **not** make the path school-owned or generation-owned.
7. **Only the literal RBAC role `admin`** may create, edit, delete, assign, or unassign learning paths.
8. **No other role** may perform those management actions. This expressly includes `equipo_directivo`, `consultor`, and every other non-admin role.
9. A non-admin who receives a path through a valid user or group assignment may **consume** that assigned path and update **only their own permitted progress**.
10. These decisions do **not** authorize implementation or production access.

## 2. What is preserved, and what is superseded

**Preserved, unchanged:** the W-PC-06 historical record (`docs/reviews/w-pc-06-learning-path-data-classification-2026-08-28.md` §§1–7) — the five-production-query chronology, the separate read-only Management API metadata call, the raw aggregate and schema results, and the fact that the queries themselves were correctly executed and correctly reported. Classification **B — DATA TRANSFORMATION REQUIRED** was genuinely reached on 2026-08-28 and stays in the record as the correct account of the inference made on its date. Nothing here pretends classification B was never reached.

**Superseded — the interpretation, not the data:** classification B rested on one premise: that a learning path must have a derivable owning school (a tenant to isolate by), so that 100 % NULL `school_id`/`generation_id`, non-authoritative creator roles, and multi-school assignment dispersion together proved the rows were *broken* and needed a class-3 repair before a school-isolation boundary could be activated. The owner decisions of 2026-08-29 reject that premise: the NULL scope columns are the **intended representation of global scope**. Under the correct semantics the very same aggregates describe **healthy data** — 7 global templates, 22 course links inheriting global scope, and 883 direct-user assignments that are *supposed* to span schools, because assignment governs availability, not ownership.

**Effective conclusion: classification A — no existing learning-path ownership data transformation is required.** The evidence record carries this as a dated superseding section (§8), never as a rewrite of §6.

## 3. W-B2d-01 — retired truthfully

- The proposed school-ownership backfill was **never designed, never authorized, never executed, and is not represented as completed**. Its `authorization_status` remains `UNAUTHORIZED`.
- It is **removed as a prerequisite of W-B2c-01**.
- Its state is **`SUPERSEDED`** — superseded/not required because its underlying ownership premise was rejected by the product owner — not `DONE` (no backfill ran; `DONE` would be a lie) and no longer `BLOCKED` (nothing is waiting to unblock; the work will never be needed under the adopted semantics).
- **Status-vocabulary judgment:** the governed status enum (`SCHEDULED`/`ACTIVE`/`BACKLOG`/`BLOCKED`/`DONE`) could not truthfully represent a retired-without-execution item. The narrowest coherent extension is one additive terminal value, **`SUPERSEDED`** — "retired unexecuted because its premise was rejected by the owner" — added to the validator enum and to the protocol's status accounting (`BLOCKED` 18 → 17, `SUPERSEDED` 0 → 1; every other count recomputed from the files). No existing status value was renamed or re-meant.
- The row keeps its historical shape (lote `B2d`, rama `data/lp-scope`, `MERGE`, clase 3, mapped only to `SWEEP-MI-APRENDIZAJE-09`) as the audit record of what was proposed; its gate is marked as a historical, must-not-run record. **No runnable or apparently authorized class-3 backfill remains anywhere**: no algorithm, no SQL, no school selection, and no authorization ever existed for it, and the validator now fails any attempt to move `W-B2d-01` to an executed or authorized state.

## 4. W-B2c-01 — corrected definition

- **Reclassified: class 2** (permissions/RLS correction — GRANT/REVOKE/policies/RLS plus the function-boundary and API-boundary corrections that enforce them). It stops being `clase_migracion = BLOCKED`: the classification question W-PC-06 existed to answer is now answered (effective classification A ⇒ no class-3 predecessor; the boundary work itself is class 2).
- **Status: `BLOCKED` — unauthorized for implementation.** Its remaining prerequisites, in order, are exactly:
  1. **this governance correction is independently approved and merged**;
  2. **Privacy approves the actor-by-operation access matrix** (the matrix in §5, per actor class × operation — replacing the obsolete "role × tenant" matrix, which presumed school tenancy);
  3. **Brent separately and explicitly authorizes implementation.**
- It **does not depend on W-B2d** in any way.
- It must **not** describe learning paths as school-owned or generation-owned; its title, gate, and notes now speak of **global FNE templates** (es-CL in the ledger: *plantillas globales*), literal-admin-only management, and assignment-based consumption. The former "aislamiento por colegio y tenant" objective is retired with the premise.
- Its scope is frozen only now, after the §6 inventory: **four tables and eight SECURITY DEFINER functions** at the database layer, plus the API/service surfaces listed in §6 (enforced at both boundaries per §7).

## 5. Intended access model (authoritative)

| Actor | Learning-path access |
|---|---|
| **anonymous** (`anon`, and any unauthenticated caller) | **None.** No template, course-link, assignment, or progress access — no reads, no writes, no RPC effects. |
| **literal `admin`** | Global template CRUD (create/edit/delete `learning_paths` + `learning_path_courses` composition) and global assign/unassign authority over users and groups in any school. |
| **assigned authenticated user, or valid member of an assigned group** | Read the assigned template/course content (the path, its course links, and the linked course content needed to consume it) and update **only their own** permitted progress (their own assignment progress fields and their own `learning_path_progress_sessions` rows). |
| **unassigned authenticated user** | **No access to that path** (not its template row, course links, assignments, or progress). |
| **every non-admin role — expressly including `equipo_directivo` and `consultor`** | **No** create, edit, delete, assign, or unassign authority — at the UI, the API, and the database. If assigned, they consume only under the assigned-user rules above. |
| **`service_role`** | Only the bounded backend access actually required, each use justified: (a) `lib/api-auth.ts` Bearer-token validation (`auth.getUser`) — no learning-path data access; (b) the two maintenance jobs (`update-learning-path-summaries`, `cleanup-learning-path-sessions`) *if retained*, which aggregate progress and close stale sessions and therefore need cross-user read plus bounded progress-metadata writes — both must first gain the mandatory secret-based authentication they currently lack (§6.4); (c) `group-assignments.ts`'s current RLS bypass for matrix reads, which the implementation must re-justify or replace with policy-compatible reads; (d) `pages/api/admin/users.ts`'s service-role reads of direct and group `learning_path_assignments` joined to `learning_paths` for the `admin`/`equipo_directivo` user-management listing (§6.4) — same obligation: re-justify or replace, with its non-admin reporting exposure gated on the Privacy matrix. Blanket `GRANT ALL` to `service_role` beyond what these uses need is not "required access" and must be reviewed rather than assumed. |

Consumption via assignment also reaches **courses**: the existing `courses` SELECT policy `courses_learning_path_member_view` (via `auth_is_learning_path_member`, which correctly derives the actor from `auth.uid()`) is part of this access model and must keep granting assigned users course visibility while never widening it.

## 6. Corrected repository surface inventory (read-only, repository-only; verified 2026-08-29 at base `72f7beed`)

The prior inventory — "two tables and six functions" — is **incomplete** and is not the frozen scope. Everything below was independently inspected in the committed repository. File:line anchors refer to `supabase/migrations/00000000000000_baseline.sql` unless another path is given.

### 6.1 Tables (four, not two)

| Table | RLS | Policies | Direct grants |
|---|---|---|---|
| `learning_paths` (:8858) | **disabled** | none | `GRANT ALL` to `anon`, `authenticated`, `service_role` (:25355-25357) |
| `learning_path_courses` (:8823) | **disabled** | none | `GRANT ALL` to `anon`, `authenticated`, `service_role` (:25343-25345) |
| `learning_path_assignments` (:8801) | enabled (:20642) | **four permissive `USING (true)` policies for SELECT/INSERT/UPDATE/DELETE with no `TO` clause — they apply to every role, `anon` included** (:20645-20657), plus an own-row UPDATE policy for `authenticated` (:20661) | `GRANT ALL` to `anon`, `authenticated`, `service_role` (:25337-25339) |
| `learning_path_progress_sessions` (:8837) | enabled (:20665) | admin-full (:18015), service-role-full (:18468), own-INSERT (:18792), own-UPDATE while open (:18945), own-or-admin SELECT (:19156) — the only table of the four whose policy shape already approximates the §5 model | `GRANT ALL` to `anon`, `authenticated`, `service_role` (:25349-25351) — `anon` has no policy, so RLS denies it despite the grant |
| (verification) | `supabase/tests/001-rls-enabled.sql:67` allowlists `learning_paths` and `learning_path_courses` among the 8 governed no-RLS exceptions | | |

Net effect today: `anon` and `authenticated` hold **unrestricted read/write on templates, course links, and assignments** (no RLS on the first two; `true` policies on the third). `learning_paths.school_id`, `generation_id`, and `created_by` are all nullable — consistent with the global-template semantics.

### 6.2 SECURITY DEFINER functions (eight, not six) — all with EXECUTE granted to `anon`, `authenticated`, `service_role` (and `PUBLIC`, per the W-PC-06 production catalog query)

| Function | Actor handling today |
|---|---|
| `create_full_learning_path(p_name, p_description, p_course_ids, p_created_by)` (:2060) | permission check runs against **caller-supplied** `p_created_by` (role in `admin`/`equipo_directivo`/`consultor`); no school/generation parameter exists |
| `update_full_learning_path(p_path_id, …, p_updated_by)` (:5218) | **caller-supplied** `p_updated_by` (same three roles, OR `created_by` owner) |
| `batch_assign_learning_path(p_path_id, p_user_ids, p_group_ids, p_assigned_by)` (:990) | **caller-supplied** `p_assigned_by` (same three roles); **side effect:** auto-INSERTs `course_enrollments` rows (`enrollment_type='assigned'`, `enrolled_by = p_assigned_by`) for every course of the path per assigned user |
| `start_learning_path_session(p_user_id, p_path_id, p_course_id, p_activity_type)` (:4681) | **caller-supplied `p_user_id`, no permission check** — inserts progress sessions and touches assignment progress for any user id passed |
| `end_learning_path_session(p_session_id)` (:2377) | session id only; no actor verification |
| `auth_is_learning_path_member(p_course_id)` (:709) | **correctly derives the actor from `auth.uid()`** (direct assignment OR active `user_roles.community_id` membership of an assigned group); consumed by the `courses` policy below |
| `increment_path_assignment_time(p_user_id, p_path_id, p_minutes)` (:4076) | **caller-supplied `p_user_id`, no permission check**; mutates assignment progress metadata; EXECUTE granted to `anon` (:24000) |
| `update_session_heartbeat(p_session_id)` (grants :24428-24430) | session id only; no actor verification |

The last two were **absent from the old six-function inventory** although they mutate the same progress surface and carry the same broad grants. Per the W-PC-06 production catalog result, `create_full_learning_path` and `update_full_learning_path` additionally have **no configured `search_path`**.

### 6.3 Alternate database access paths and side effects

- **`courses` policy `courses_learning_path_member_view`** (:20281): learning-path assignment grants course SELECT via `auth_is_learning_path_member` — the assigned-user consumption path that must be preserved.
- **`course_enrollments` side effect:** assignment auto-enrolls (§6.2); `pages/api/learning-paths/unassign.ts` deletes assignments (user, group, and the group's individual member rows) but **never removes the `course_enrollments` rows** — an assign/unassign asymmetry the implementation must decide on deliberately.
- **Summary relations `user_learning_path_summary`, `learning_path_performance_summary`, `learning_path_daily_summary`: absent from every migration** — they exist only in the unversioned seeder tree (governed separately as `W-B6d-01`). Code that references them runs against objects production may not have.
- **Dead RPC references** (called by committed code, defined in no migration): `increment_path_time`, `update_learning_path_performance_summary`, `update_learning_path_daily_summary`, `update_user_learning_path_summary` (both cron routes) and `get_user_learning_paths` (`pages/api/learning-paths/user/[userId].ts:47`). These calls fail at runtime today; the implementation must resolve them rather than grant around them.

### 6.4 API routes (`pages/api/`)

**Learning-path routes (exactly 15 files under `pages/api/learning-paths/`, verified with `git ls-tree -r --name-only HEAD pages/api/learning-paths`; an earlier draft of this record said 16 — corrected in review round 1, 2026-08-30, with the route list itself unchanged and already complete)** — all authenticate via `lib/api-auth.ts` (`getApiUser`: Bearer token validated through a service client, falling back to cookie auth — both paths must stay consistent):

- Management (today gated by `LearningPathsService.hasManagePermission` = **`admin` OR `equipo_directivo` OR `consultor`** — the overbroad set the owner decisions reject): `index.ts` (list/create), `[id].ts` (read/update/delete; `canManagePath` adds `created_by`-owner update/delete), `assign.ts`, `batch-assign.ts`, `unassign.ts`, `assignments/[id].ts`, `search-assignees.ts`.
- Reporting/analytics with the same overbroad role set: `analytics.ts`, `user/[userId].ts` (self OR the three roles), `[id]/enhanced-progress.ts` (the three roles bypass assignment via a mock-assignment object).
- Consumption (own data): `my-paths.ts`; sessions `session/start.ts` (the three roles bypass the assignment check; passes the authenticated `userId` into the caller-supplied-actor RPC), `session/end.ts` (+ `increment_path_assignment_time`), `session/activity.ts`, `session/heartbeat.ts`.

**Maintenance/cron routes:** `pages/api/cron/update-learning-path-summaries.ts` — **uses the service-role client with NO authentication guard of any kind**; `pages/api/cron/cleanup-learning-path-sessions.ts` — service-role client with a `CRON_SECRET` check that is **fail-open when the env var is unset**. Neither is scheduled in `vercel.json` (its four crons are zoom-ticker, zoom-reconcile, recovery-outbox, auth-retention), but both are invocable over HTTP.

**Assignment-matrix admin routes (4 files under `pages/api/admin/assignment-matrix/`):** `audit-log.ts` (admin|consultor|equipo_directivo), `content-stats.ts` (admin|consultor), `group-assignments.ts` (admin|consultor, and it constructs a **service-role client to bypass RLS** for matrix reads), `user-assignments.ts` (admin|consultor).

**Adjacent admin/reporting route outside those directories (added in review round 1, 2026-08-30 — the initial inventory omitted it):** `pages/api/admin/users.ts` — the GET-only user-management listing is also a **learning-path read surface**: it authorizes **`admin` and `equipo_directivo`** via `checkIsAdminOrEquipoDirectivo` (line 65), constructs a **service-role client** (`createServiceRoleClient()`, line 88) whose reads **bypass RLS entirely**, reads **direct** `learning_path_assignments` (`.in('user_id', …)`, ~line 604) and **group** assignments (`.in('group_id', …)`, ~line 621) **joined to `learning_paths(id, name, description)`**, and returns per-user assignment lists (line 724). Recording this route does **not** authorize `equipo_directivo` reporting access to learning-path data — it is squarely inside the unresolved non-admin reporting-reads question that the **Privacy-approved actor-by-operation access matrix must decide** (review request §6, question 1), and the future W-B2c implementation must **test or otherwise resolve this service-role access path** (§7, criterion 12). This paragraph is the durable governance record of that path: it must not disappear from this document while the path exists in the repository (enforced by validator check 22).

### 6.5 Services, helpers, and browser-side database clients

- `lib/services/learningPathsService.ts` — `hasManagePermission` (:341) grants management to **`admin`, `equipo_directivo`, `consultor`** (the starting-point warning, verified); `canManagePath` adds `created_by` ownership; also carries a stray browser-client import (line 3) alongside its passed-in server clients.
- `lib/services/learningPathSessionTracker.ts` — browser-side tracker that calls the session API routes via `fetch`.
- `lib/services/groupAssignmentsV2.js:124` — **browser client reads `learning_path_courses` directly**.
- `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:391` — **browser client reads `learning_paths` directly**.
- `pages/admin/learning-paths/[id]/assign.tsx:201` — **browser client reads `learning_path_assignments` directly**.
- `lib/auditLog.ts` (learning-path assignment audit entries), `lib/notificationEvents.ts` (`learning_path_assigned`, :263) — assignment side channels.
- These browser-side reads work **only because of** the missing RLS / `true` policies; the implementation must preserve the legitimate ones through policy or move them server-side, not by keeping the open grants.

### 6.6 UI reach vs. API reach

`middleware.ts` (:127-140) gates `/admin/*` pages to `admin` (with narrow exceptions that do not cover learning paths), so `equipo_directivo`/`consultor` cannot *see* the management UI — but the management **APIs and RPCs accept them today** (§6.2, §6.4), and the tables accept **anyone** (§6.1). The enforcement gap is at the API and database boundaries, exactly where §7 requires enforcement.

### 6.7 Test surface today

pgTAP: only the `001-rls-enabled.sql` allowlist acknowledges the two no-RLS tables; **no role × table × operation matrix exists for any of the four tables or eight functions**. No service/API integration tests pin the management boundary.

## 7. Acceptance criteria for the future W-B2c implementation (recorded now, implemented later)

The later, separately authorized W-B2c implementation must:

1. enforce **literal-admin-only management at both the API boundary and the database boundary** (RLS/policies/grants and function-internal checks — not one or the other);
2. **prevent callers from gaining authority by supplying actor IDs** (`p_created_by`, `p_updated_by`, `p_assigned_by`, `p_user_id` must stop being trusted authorization inputs);
3. **derive and verify the actor from the authenticated session / `auth.uid()`** where applicable;
4. protect **direct table access as well as RPC access** (locking the functions while leaving `GRANT ALL` + `USING (true)` on the tables would protect nothing);
5. **preserve assigned-user consumption and own-progress behavior** (§5), including the `courses_learning_path_member_view` path;
6. handle **cookie and Bearer-token authentication paths consistently** (`lib/api-auth.ts`);
7. use **forward-only, non-destructive migrations**;
8. **never disable RLS and never use `DROP`/`TRUNCATE`/destructive `ALTER`** (repository hard rules; the class-2 compensating artifact is written with additive migrations, `ALTER POLICY`, RESTRICTIVE policies, or grant restoration);
9. include **pgTAP role × table × operation tests** across the four tables and eight functions;
10. include **service/API integration tests and proportionate synthetic E2E coverage**;
11. test **`admin`, each currently overprivileged non-admin role (`equipo_directivo`, `consultor`), assigned users, unassigned users, anonymous access, and `service_role` boundaries**;
12. prove that **assignment creation/removal and progress effects cannot escape the authorized actor and target scope** (including the `course_enrollments` side effect and the unassign asymmetry, the two maintenance routes' authentication, the dead-RPC resolutions of §6.3, and the `pages/api/admin/users.ts` service-role assignment-read path of §6.4 — which must be explicitly tested, or re-justified/replaced, under the Privacy-approved matrix).

## 8. What this correction does not do

It does not implement anything in §7; does not touch any table, policy, grant, function, migration, or test; does not run any query anywhere; does not authorize W-B2c implementation (three prerequisites stand, §4); does not reopen `W-PC-06`, `W-B2a-01`, or `W-B2b-01`; does not alter `W-PC-01`…`W-PC-05` (still `BLOCKED`/`UNAUTHORIZED`), `W-B10a-01`, or the D-RLS deferred units; and does not modify the frozen claim snapshot or the archived legacy ledger.

— Recorded 2026-08-29. Owner decisions: Brent. Drafted as part of the documentation-only branch `docs/lp-global`; independent review request: `docs/planning/reviews/fase-lp-global-review-request.md`.
