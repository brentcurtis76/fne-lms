# Operation A — one-active-docente cleanup and unique index: handoff for authorization

**Status: NOT AUTHORIZED · NOT EXECUTED · NO PRODUCTION ACCESS.** This document is the exact read-only discovery, the cleanup procedure and the index statement Brent must authorize separately, in that order. Nothing here was run against any remote database; the only database that has executed any of it is the local loopback stack, through the synthetic proof `scripts/ci/operation-a-proof.mjs` (`npm run test:operation-a`), which extracts the SQL blocks below verbatim from this file.

**Revision history.** Rewritten for Codex review round 1 (finding 5): one locking procedure per course, fixed lock order, every status and every response re-checked in the transaction. Rewritten again for Codex review round 2 (findings B, C, D): Step 2 now (B) receives the exact active-assignment id set from Step 1 and refuses on any difference; (C) revokes access only for the docentes whose assignment rows it deactivates, never for unrelated co-assignees; and (D) opens with a table-level writer-exclusion boundary that drains in-flight writers and blocks late ones until it commits, which the earlier text wrongly claimed the row locks alone provided. Step 3 re-runs the discovery under the same kind of lock in the transaction that creates the index, so no duplicate can slip in between cleanup and index. Rewritten a third time for Codex review round 3 (findings 1, 3, 5): the round-2 text claimed that *every* delayed writer fails row-level security after cleanup; that was true only for user-scoped writers. The automatic assignment writes with the **service role**, which bypasses RLS, so a request carrying a pre-cleanup decision could wait behind the boundary and re-insert the obsolete docente's grant after COMMIT (reproduced on synthetic data). Those writes now go through one locked transaction, `public.attach_course_docente_assessment` (migration `20260908130000`), that re-reads the docente's active assignment under the course row lock — see § Writer-exclusion boundary, "Service-role writers". The boundary's lock order was changed so that RPC is deadlock-free against it. Every transaction below now also sets `idle_in_transaction_session_timeout`, because `statement_timeout` never bounded the time a manual session could sit idle *between* statements while holding the platform-wide locks; batch execution is required (§ Operator rules). Rewritten a fourth time for Codex review round 4 (finding R5-1): the RPC read the template's eligibility with a plain `SELECT` and then waited (instance row lock, or the boundary), so an archive could commit while it waited and it then created a pending instance with an editable grant under an archived template (reproduced by Codex in the Step 2e ordering). Migration `20260908140000` locks the template row `FOR SHARE` before the decision and holds it to COMMIT — an archive, restore or publish flip either committed before the read (and is seen) or waits until the RPC ends — and Step 2e reads the template row `FOR SHARE` as well. The current-snapshot check is stated exactly (last read before the write; not lock-protected; the residual is an instance on the previous snapshot, not an access decision).

**Why it is still open.** The one-active-docente-per-course invariant is enforced today by the application only (`assign-docente.ts` 409 `course_already_assigned` / `assignment_invariant_violation`; the `replace_course_docente` RPC's own count under lock). The unique index that would make Postgres enforce it (`school_course_docente_assignments_one_active_key`, statement kept in the header of migration `20260907120000_proc_integrity.sql`) **cannot be applied while production holds courses with more than one active assignment**: `CREATE UNIQUE INDEX` aborts on existing duplicates. The 2026-09-01 readiness review counted such duplicates in production; the counts must be **refreshed immediately before** any step below — counts in a review are never mutation authorization.

Everything below follows the approved DB workflow (DB agent, exact reverified targets, additive only, evidence kept). Identifiers only: no names, no emails, no PII in the evidence. The remediation branch closed what it could in the application (`assign-docente` DELETE disabled; `replace_course_docente` serialised on the course row; context edits cannot detach history), so this operation is smaller than it was, but it is still the only path to the database-wide invariant.

---

## Step 1 — Read-only discovery (safe to authorize first, on its own)

Run through the approved read-only production process. Save the outputs as evidence with the run timestamp; they are the exact targets of Step 2 and the preflight of Step 3.

```sql
-- 1a. Courses with more than one ACTIVE docente (the rows the index would refuse).
--     assignment_ids is the EXACT expected set Step 2 receives, verbatim.
SELECT a.course_structure_id,
       c.school_id,
       c.grade_level,
       c.course_name,
       count(*)                                        AS active_assignments,
       array_agg(a.id ORDER BY a.assigned_at)          AS assignment_ids,
       array_agg(a.docente_id ORDER BY a.assigned_at)  AS docente_ids,
       array_agg(a.assigned_at ORDER BY a.assigned_at) AS assigned_at
  FROM public.school_course_docente_assignments a
  JOIN public.school_course_structure c ON c.id = a.course_structure_id
 WHERE a.is_active
 GROUP BY 1, 2, 3, 4
HAVING count(*) > 1
 ORDER BY c.school_id, c.grade_level, c.course_name;

-- 1b. For every duplicated course: every LIVE instance, its status, its response count and its assignees.
--     Any instance whose status is not 'pending' OR whose responses > 0 is a HUMAN decision point (Step 2 refuses it).
WITH dup AS (
  SELECT course_structure_id
    FROM public.school_course_docente_assignments
   WHERE is_active
   GROUP BY 1 HAVING count(*) > 1
)
SELECT i.id AS instance_id,
       i.course_structure_id,
       i.status,
       i.template_snapshot_id,
       (SELECT count(*) FROM public.assessment_responses r WHERE r.instance_id = i.id) AS responses,
       (SELECT array_agg(x.user_id ORDER BY x.assigned_at)
          FROM public.assessment_instance_assignees x WHERE x.instance_id = i.id)      AS assignee_ids
  FROM public.assessment_instances i
  JOIN dup ON dup.course_structure_id = i.course_structure_id
 WHERE i.status <> 'archived'
 ORDER BY i.course_structure_id, i.created_at;

-- 1c. Contaminated instances from archived templates (containment leftovers).
SELECT i.id, i.school_id, i.course_structure_id, i.status, t.id AS template_id, t.is_archived,
       (SELECT count(*) FROM public.assessment_instance_assignees x WHERE x.instance_id = i.id) AS assignees,
       (SELECT count(*) FROM public.assessment_responses r WHERE r.instance_id = i.id) AS responses
  FROM public.assessment_instances i
  JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
  JOIN public.assessment_templates t ON t.id = s.template_id
 WHERE t.is_archived AND i.status <> 'archived'
 ORDER BY i.school_id, i.course_structure_id;

-- 1d0. Server major version (decides whether `transaction_timeout`, PostgreSQL >= 17, may be added to the batches).
SHOW server_version;

-- 1d. Preflight of the two indexes already in 20260907120000 (must return no rows).
SELECT school_id, count(*) FROM public.school_transversal_context GROUP BY 1 HAVING count(*) > 1;
SELECT course_structure_id, template_snapshot_id, count(*)
  FROM public.assessment_instances
 WHERE course_structure_id IS NOT NULL AND status <> 'archived'
 GROUP BY 1, 2 HAVING count(*) > 1;
```

Decision points that come OUT of Step 1 and go back to Brent / the school before Step 2:

- For each row of 1a: **which assignment id is the approved one** (the school decides the responsible docente; the system must not guess by `assigned_at`). The decision is recorded as the exact `school_course_docente_assignments.id`, not as a docente, and it must be one of that row's `assignment_ids`.
- For each row of 1a: the full `assignment_ids` array is copied verbatim into Step 2 as the **expected active set**. Step 2 refuses to run if the live set differs from it in any way.
- For each instance of 1b with `status <> 'pending'` **or** `responses > 0`: **stop for a human decision** — answers cannot be attributed to one docente; the plan forbids silent transfer. Step 2 refuses to run on such a course until the instance has been resolved by hand (archived with a recorded reason, or explicitly excluded by a written decision that names the instance id).
- For each row of 1c: archive (never delete) and revoke assignee access (Step 2e).

## Writer-exclusion boundary (why the row locks were not enough)

Every writer that matters reaches Postgres as one of these statements, each in its own transaction (PostgREST issues one transaction per request; the API's "check then write" is therefore two or more transactions, and the checks are already committed history by the time the write arrives):

| Writer | Statement(s) | Table-level lock it needs |
|---|---|---|
| Docente response save (`PUT …/responses`) | `INSERT … ON CONFLICT DO UPDATE` on `assessment_responses` (RLS: assignee with `can_edit`) | ROW EXCLUSIVE on `assessment_responses`; ROW SHARE on `assessment_instances` (FK check) |
| Docente response save, status transition | `UPDATE assessment_instances SET status = 'in_progress'` (+ progress trigger writes `assessment_instance_assignees`) | ROW EXCLUSIVE on `assessment_instances`, then on `assessment_instance_assignees` |
| `POST …/assign-docente` insert / reactivation | `INSERT` / `UPDATE` on `school_course_docente_assignments` | ROW EXCLUSIVE on `school_course_docente_assignments`; ROW SHARE on `school_course_structure` (FK) |
| Auto-assignment (service role) — `attach_course_docente_assessment` RPC, one transaction | course row `FOR UPDATE`, template row `FOR SHARE` (held to COMMIT; round 4 R5-1), live instance `FOR UPDATE`, then `INSERT` on `assessment_instances` and/or `assessment_instance_assignees` | ROW SHARE on `school_course_structure`, ROW SHARE on `assessment_templates`, then ROW SHARE / ROW EXCLUSIVE on `assessment_instances`, ROW EXCLUSIVE on `assessment_instance_assignees` |
| Template archive / restore (`POST …/templates/[id]/archive`) and publish flip (`publishTemplate`) | `UPDATE assessment_templates` (one row) | ROW EXCLUSIVE on `assessment_templates`; the row lock conflicts with the RPC's and Step 2e's `FOR SHARE` |
| `replace_course_docente` RPC | `SELECT … FOR UPDATE` on course → assignments → instances, then writes on assignments and assignees | ROW SHARE on the three, then ROW EXCLUSIVE on assignments and assignees |
| `save_transversal_context` RPC | course rows `FOR UPDATE` | ROW SHARE / ROW EXCLUSIVE on `school_course_structure` |

A `SELECT … FOR UPDATE` on the course, assignment and instance rows (the round-1 design) conflicts only with statements that lock or update *those rows*. A response `INSERT` does not touch them (its FK check takes KEY SHARE on the instance row — which does conflict with FOR UPDATE, but only at the very end of the insert, after the row-level-security check already passed with the old snapshot), a new assignment `INSERT` does not touch them, and a new assignee `INSERT` does not touch them. So a request that had read the old authorization could wait behind the row locks and still land its write after the cleanup committed. That is finding D.

**The boundary Step 2 and Step 3 now use is a table-level lock:**

```sql
LOCK TABLE public.assessment_responses,
           public.school_course_docente_assignments,
           public.school_course_structure,
           public.assessment_instances,
           public.assessment_instance_assignees
  IN EXCLUSIVE MODE;
```

`EXCLUSIVE` conflicts with every mode except `ACCESS SHARE`: plain `SELECT`s keep working (the platform stays readable), while every `INSERT`, `UPDATE`, `DELETE` and every `SELECT … FOR UPDATE / SHARE / KEY SHARE` on those five tables is excluded. It gives, without any change to the application, the two properties finding D asks for:

1. **Writers already in flight are drained, not raced.** A statement that is executing holds its ROW EXCLUSIVE / ROW SHARE lock until its transaction ends. `LOCK TABLE` waits for it (bounded by `lock_timeout`; on timeout Step 2 fails with nothing written and is retried). When the lock is granted, every such write is committed, and the re-checks that follow — which run under `READ COMMITTED` inside a `DO` block, so each statement takes a fresh snapshot — see it. An answered instance is refused; a new active assignment makes the live set differ from the expected set and is refused.
2. **User-scoped writers arriving after the boundary cannot use stale authorization.** Postgres acquires a statement's table locks during parse analysis, *before* it takes the snapshot the statement runs under. A late `INSERT` on `assessment_responses` therefore blocks at the table lock and, once Step 2 has committed, runs with a snapshot in which the obsolete docente's assignee row no longer exists; the `assessment_responses_insert` policy (`EXISTS … assessment_instance_assignees … can_edit`) evaluates false and the insert is refused with SQLSTATE `42501`. The same holds for the `ON CONFLICT DO UPDATE` branch (`assessment_responses_update` USING) and for the `in_progress` status update (`assessment_instances` update policy). A late `assign-docente` insert lands after Step 2 as a new duplicate — which Step 3 refuses under its own lock, see below. **This RLS argument covers only writers that run as the authenticated user.** It says nothing about the service role, which bypasses RLS — that case is the next subsection.

**Service-role writers (Codex round 3, finding 1).** The automatic assignment (`autoAssignmentService.triggerAutoAssignment`, called by `POST …/assign-docente` after it wrote the assignment row) runs with the service role. Until round 3 it issued its reads and its two writes as separate PostgREST requests — separate transactions. A request could read "docente X is active on course C" before Step 2, wait at the table lock, and after COMMIT insert X's grant on the live instance, or create a new instance for the current snapshot with X's grant; no policy runs for the service role, and the one-active-assignment index constrains assignment rows, not grants. Reproduced on the loopback stack: with Step 2 held open, a service-role assignee `INSERT` for the obsolete docente waited behind the boundary and landed after COMMIT (grant count 0 → 1); the new-instance path landed as well.

The protocol now: every course-level instance / grant write happens inside `public.attach_course_docente_assessment(course, docente, snapshot, year, generation_type, assigned_by)` (migration `20260908130000_attach_course_assessment.sql`, `service_role` EXECUTE only, `SECURITY INVOKER`). In **one transaction** it (a) takes the course row `FOR UPDATE` — the same row Step 2, `replace_course_docente` and `save_transversal_context` lock; (b) re-reads, under that lock, that the docente holds an **active** assignment on the course and that the course holds exactly one active assignment; (c) locks the template row `FOR SHARE` — held until the transaction ends — and decides under that lock that the template is published and not archived (round 4, R5-1: the round-4 function read these with a plain `SELECT` and then waited, so an archive could commit while it waited and the decision went stale; an `UPDATE` of the template row — archive, restore, publish flip — now either committed before the read, and is seen because the lock re-evaluates the row, or waits until the RPC has committed or rolled back); (d) locks the live (non-archived) instance for course + snapshot `FOR UPDATE`, refusing if two exist and never reattaching an archived one; (e) as the last read before the write, checks that no newer snapshot of the template has been committed (`snapshot_not_current`); (f) inserts the grant (no-op if present) or creates the pending instance together with the grant. Any refusal (`P0001 docente_not_active_on_course`, `assignment_invariant_violation`, `template_not_eligible`, `snapshot_not_current`, `instance_ambiguous`, …) happens before any write. Co-assignees are never read, changed or removed: the function adds at most one grant, for the docente whose active assignment it just verified.

Why a stale service-role write can no longer restore obsolete access: the authorization read and the dependent writes are now in the same transaction, serialised on the course row against Step 2. Either the attach holds the course row first — then Step 2 waits (`LOCK TABLE` / course `FOR UPDATE`), and once the attach commits, Step 2's `READ COMMITTED` re-checks see the grant and its own revocation removes it — or Step 2 holds it first, and the attach resumes after COMMIT with a snapshot in which the obsolete docente's assignment is inactive and refuses. Both orders end with no grant for the obsolete docente (proof [D-f]). For Step 2e the protocol is the template row lock (round 4, R5-1). **Archive first:** the RPC's `FOR SHARE` waits for the archive to commit, re-evaluates the row, sees `is_archived` and refuses (`template_not_eligible`) before it reaches the instance row — whether 2e is in flight, committed, or has not run yet — so it neither re-grants nor creates anything (proof [2e-r5a], [2e-r5c]). **RPC first:** the archive's `UPDATE` waits on the RPC's transaction, so whatever the RPC attached or created is committed and visible before `is_archived = true` can commit; a Step 1c listing taken after the archive therefore contains it, and 2e archives it and revokes its grants (proof [2e-r5a] existing-instance path, [2e-r5b] create path, three sessions, final state asserted after every participant finished). A 2e batch run before the archive has committed refuses ("repeat Step 1c"): it reads the template `FOR SHARE` too, which also makes a restore wait for it ([2e-r5c]). There is no order in which a live instance is created under a template whose archive committed before the creation. (An instance archived by hand while its template stays eligible is different and unchanged from R4: the RPC never reattaches the archived row and creates a fresh live instance — [2e-r5c] after the restore.) **What the lock does not cover — stated exactly:** the "current snapshot" check (`snapshot_not_current`) is the last read before the write, against committed snapshots at that moment; `publishTemplate` inserts the new snapshot in its own request and only its later template `UPDATE` waits on the `FOR SHARE`, so a snapshot committed after that read is not excluded. The residual outcome is an instance bound to the previous snapshot — the state every existing instance is in after any republish, not an access decision — and the round-3 text that listed the current-snapshot check among the enforced guarantees was wrong on that point. What the RPC does **not** change: the assignment row itself is still written by `assign-docente` in its own transaction (a late one lands as a duplicate that Step 3 refuses); the school-level path `createSchoolLevelInstances` writes no docente grant and is outside this protocol.

What the boundary costs: for the duration of one Step 2 transaction every write to those five tables waits, platform-wide, and a waiting writer whose own `statement_timeout` expires fails its request. Reads are unaffected. The duration is bounded only when the transaction is executed as **one batch** (§ Operator rules): `lock_timeout` bounds the wait for the boundary, `statement_timeout` bounds each individual statement, and `idle_in_transaction_session_timeout` (round 3, finding 3) bounds the time the session may sit idle *between* statements — `statement_timeout` alone never did, so an operator who pasted the block statement by statement, or whose client stalled after `LOCK TABLE`, could hold the platform-wide locks indefinitely. With the batch and the three settings, a Step 2 run is milliseconds to a few seconds per course. On PostgreSQL ≥ 17 the operator may additionally set `transaction_timeout` (a hard bound on the whole transaction) after confirming the server version in Step 1; it is not in the blocks below because they must also be valid on earlier majors. This is why Step 2 runs one course per transaction and why it must be authorized for a declared low-traffic window; but the window is a courtesy to users, not what makes the operation safe.

**Deadlocks.** No lock order is deadlock-free against every writer (`replace_course_docente` takes the course before the assignments; `assign-docente` takes the assignments before the course; `save_transversal_context` takes the course before the assignment / instance FK checks). The five tables are listed in the order `responses → assignments → course → instances → assignees`, which is monotonic for — and therefore deadlock-free against — the two high-frequency writers (a response save takes responses then instances; its status transition takes instances then assignees), `assign-docente` (assignments then course), and the round-3 attach RPC (course, then instances, then assignees). Against the administrative writers (`replace_course_docente`, `save_transversal_context`) a deadlock is possible; Postgres detects it and aborts one side with SQLSTATE `40P01`. Either outcome is safe: if Step 2 is the victim its transaction is rolled back with **nothing** written and the operator re-runs it; if the writer is the victim its request fails (the API answers 500, the autosave retries) and Step 2 completes. `SET LOCAL deadlock_timeout = '200ms'` makes Step 2 the likelier victim; it needs a role that may set it (the DB-agent role does; drop the line if it is refused, the procedure is still correct).

**What the boundary does NOT cover, on purpose.** Tables outside the five (e.g. `school_change_history`) and readers. Nothing else writes `school_course_docente_assignments` or `assessment_instance_assignees` on this branch (`assign-docente` DELETE is disabled; provisioning writes neither table).

## Step 2 — Cleanup (separately authorized, exact targets from Step 1, one course per transaction)

The procedure below is run **once per course**, with the three inputs from the Step 1 evidence and decision filled in:

- `<course_structure_id>` — the course (row of 1a);
- `<expected_active_assignment_ids>` — that row's `assignment_ids`, verbatim, as a `uuid[]` literal;
- `<approved_assignment_id>` — the `school_course_docente_assignments.id` the school keeps; it must be one of the expected ids.

It is a single transaction under `READ COMMITTED` that:

1. takes the **writer-exclusion boundary** (table locks, previous section) so no response, assignment, assignee, instance or replacement write can interleave; then, inside the boundary, the course row, the course's assignments and its live instances `FOR UPDATE` in the same order `replace_course_docente` uses (belt and braces; they are what an RPC in flight would hold);
2. **revalidates the exact target under the locks:** the expected set must have at least two distinct ids; the approved id must be one of them; the live active set of the course must equal the expected set exactly (no addition, no removal, no duplicate). Any difference raises — the operator must repeat Step 1;
3. re-checks that **no** live instance is started or completed and that **no** live instance holds a response (a human decision point, Step 1b) — any raises;
4. deactivates exactly the expected rows other than the approved one (history preserved), derives the **obsolete docentes from those rows only**, excludes the approved docente from that set, and removes only those docentes' assignee rows on pending, answer-free live instances of the course. Co-assignees not backed by a deactivated row, the approved docente, archived instances and every response are untouched;
5. **raises before COMMIT** unless exactly one active assignment remains and it is the approved id, and unless the approved docente still holds every grant it had.

Nothing is deleted from `school_course_docente_assignments`, `assessment_instances` or `assessment_responses`. `assessment_instance_assignees` rows are access grants, not history.

```sql operation-a-step2
-- Operation A, Step 2 — ONE course per run. Fill the three placeholders from the Step 1 evidence + decision.
-- <course_structure_id>             : uuid of the course (row of 1a)
-- <expected_active_assignment_ids>  : that row's assignment_ids, verbatim, e.g. {"…","…"}
-- <approved_assignment_id>          : uuid of the school_course_docente_assignments row that stays active
BEGIN;
SET LOCAL lock_timeout = '5s';          -- a busy course makes the run fail, never wait behind a live writer for long
SET LOCAL statement_timeout = '30s';    -- bounds each statement, NOT the idle time between statements
SET LOCAL idle_in_transaction_session_timeout = '10s';  -- bounds that idle time: a stalled session is terminated and rolled back
SET LOCAL deadlock_timeout = '200ms';   -- prefer Step 2 as the deadlock victim (see § Writer-exclusion boundary)

-- (0) Writer-exclusion boundary: drains in-flight writers, blocks late ones until COMMIT.
--     Order matters (deadlock-free against response saves, status transitions,
--     assign-docente and the attach RPC — see § Writer-exclusion boundary, Deadlocks).
LOCK TABLE public.assessment_responses,
           public.school_course_docente_assignments,
           public.school_course_structure,
           public.assessment_instances,
           public.assessment_instance_assignees
  IN EXCLUSIVE MODE;

DO $$
DECLARE
  v_course            uuid   := '<course_structure_id>';
  v_expected          uuid[] := '<expected_active_assignment_ids>'::uuid[];
  v_approved          uuid   := '<approved_assignment_id>';
  v_expected_sorted   uuid[];
  v_live_sorted       uuid[];
  v_approved_docente  uuid;
  v_obsolete_docentes uuid[];
  v_approved_grants_before int;
  v_approved_grants_after  int;
  v_started           int;
  v_answered          int;
  v_deactivated       int;
  v_revoked           int;
  v_active_after      int;
BEGIN
  -- (1) Row locks inside the boundary, in the order replace_course_docente uses.
  PERFORM 1 FROM public.school_course_structure WHERE id = v_course FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operation_a: course % not found — repeat Step 1', v_course;
  END IF;
  PERFORM 1 FROM public.school_course_docente_assignments
    WHERE course_structure_id = v_course ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.assessment_instances
    WHERE course_structure_id = v_course AND status <> 'archived' ORDER BY id FOR UPDATE;

  -- (2) Exact-target revalidation: the live active set must equal the Step 1 set.
  SELECT array_agg(x ORDER BY x) INTO v_expected_sorted FROM unnest(v_expected) AS x;
  IF v_expected_sorted IS NULL OR cardinality(v_expected_sorted) < 2 THEN
    RAISE EXCEPTION 'operation_a: expected set for course % has % id(s); Step 1a lists at least two — repeat Step 1',
      v_course, coalesce(cardinality(v_expected_sorted), 0);
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(v_expected) AS x) <> cardinality(v_expected) THEN
    RAISE EXCEPTION 'operation_a: expected set for course % contains a duplicate id — repeat Step 1', v_course;
  END IF;
  IF NOT (v_approved = ANY (v_expected)) THEN
    RAISE EXCEPTION 'operation_a: approved assignment % is not in the expected set of course % — repeat Step 1',
      v_approved, v_course;
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_live_sorted
    FROM public.school_course_docente_assignments
   WHERE course_structure_id = v_course AND is_active;
  IF v_live_sorted IS DISTINCT FROM v_expected_sorted THEN
    RAISE EXCEPTION 'operation_a: live active set of course % differs from the Step 1 set (live %, expected %) — nothing changed, repeat Step 1',
      v_course, coalesce(v_live_sorted::text, '{}'), v_expected_sorted::text;
  END IF;

  -- (3) Human decision points re-checked under the locks.
  SELECT count(*) INTO v_started
    FROM public.assessment_instances
   WHERE course_structure_id = v_course AND status NOT IN ('pending', 'archived');
  IF v_started > 0 THEN
    RAISE EXCEPTION 'operation_a: course % has % started/completed live instance(s) — human decision required (Step 1b), nothing changed',
      v_course, v_started;
  END IF;
  SELECT count(*) INTO v_answered
    FROM public.assessment_instances i
   WHERE i.course_structure_id = v_course AND i.status <> 'archived'
     AND EXISTS (SELECT 1 FROM public.assessment_responses r WHERE r.instance_id = i.id);
  IF v_answered > 0 THEN
    RAISE EXCEPTION 'operation_a: course % has % live instance(s) with responses — human decision required (Step 1b), nothing changed',
      v_course, v_answered;
  END IF;

  -- (4) Deactivate exactly the expected rows other than the approved one (history preserved) …
  SELECT docente_id INTO v_approved_docente
    FROM public.school_course_docente_assignments WHERE id = v_approved;
  SELECT count(*) INTO v_approved_grants_before
    FROM public.assessment_instance_assignees x
    JOIN public.assessment_instances i ON i.id = x.instance_id
   WHERE i.course_structure_id = v_course AND x.user_id = v_approved_docente;

  UPDATE public.school_course_docente_assignments
     SET is_active = false
   WHERE course_structure_id = v_course AND is_active
     AND id = ANY (v_expected) AND id <> v_approved;
  GET DIAGNOSTICS v_deactivated = ROW_COUNT;

  -- … derive the obsolete docentes from THOSE rows only (never from the assignee table),
  --     excluding the approved docente (a same-docente duplicate must not revoke it) …
  SELECT coalesce(array_agg(DISTINCT docente_id), '{}')
    INTO v_obsolete_docentes
    FROM public.school_course_docente_assignments
   WHERE id = ANY (v_expected) AND id <> v_approved AND docente_id <> v_approved_docente;

  -- … and revoke only those docentes on the pending, answer-free live instances of this course.
  DELETE FROM public.assessment_instance_assignees x
   USING public.assessment_instances i
   WHERE x.instance_id = i.id
     AND i.course_structure_id = v_course
     AND i.status = 'pending'
     AND NOT EXISTS (SELECT 1 FROM public.assessment_responses r WHERE r.instance_id = i.id)
     AND x.user_id = ANY (v_obsolete_docentes);
  GET DIAGNOSTICS v_revoked = ROW_COUNT;

  -- (5) Postconditions, raised before COMMIT.
  SELECT count(*) INTO v_active_after
    FROM public.school_course_docente_assignments
   WHERE course_structure_id = v_course AND is_active;
  IF v_active_after <> 1
     OR NOT EXISTS (SELECT 1 FROM public.school_course_docente_assignments
                     WHERE id = v_approved AND course_structure_id = v_course AND is_active) THEN
    RAISE EXCEPTION 'operation_a: post-check failed on course % (active after = %); rolled back', v_course, v_active_after;
  END IF;
  SELECT count(*) INTO v_approved_grants_after
    FROM public.assessment_instance_assignees x
    JOIN public.assessment_instances i ON i.id = x.instance_id
   WHERE i.course_structure_id = v_course AND x.user_id = v_approved_docente;
  IF v_approved_grants_after <> v_approved_grants_before THEN
    RAISE EXCEPTION 'operation_a: the approved docente lost a grant on course % (% → %); rolled back',
      v_course, v_approved_grants_before, v_approved_grants_after;
  END IF;

  RAISE NOTICE 'operation_a: course % — deactivated % assignment(s), revoked % grant(s) of % obsolete docente(s), 1 active remains (%)',
    v_course, v_deactivated, v_revoked, cardinality(v_obsolete_docentes), v_approved;
END $$;

-- Evidence row for the run log (identifiers and counts only), then COMMIT explicitly.
SELECT course_structure_id, count(*) FILTER (WHERE is_active) AS active_now, count(*) AS total_rows
  FROM public.school_course_docente_assignments
 WHERE course_structure_id = '<course_structure_id>'
 GROUP BY 1;
COMMIT;
```

Operator rules for Step 2:

- **Execute the block as one batch**, exactly as printed: the whole fenced block, placeholders filled, submitted in a single `psql -f <file>` / `psql < file` (or one paste that the client sends as one script). Never run it interactively statement by statement, never stop after `LOCK TABLE` to "check something", never open it in a session that will wait for a human between statements. Between statements the session holds the platform-wide locks, and `statement_timeout` does not run while the session is idle; `idle_in_transaction_session_timeout = '10s'` is the safety net for a stalled client, not a licence to pause.
- Run one course per transaction; if the `DO` block raises, the transaction is already aborted — issue `ROLLBACK`, **repeat Step 1** for that course and bring the difference back to Brent. Never edit the placeholders to "make it pass"; in particular never reduce the expected set to what is live now.
- `lock_timeout` makes the run fail instead of waiting long behind live writers; a lock failure (`55P03`) or a deadlock (`40P01`) is retried later, not forced. Both leave the database unchanged.
- **Timeout recovery.** A statement that exceeds `statement_timeout` fails with `57014`: the transaction is aborted, nothing is written, issue `ROLLBACK` and retry in the window. A session idle longer than `idle_in_transaction_session_timeout` is **terminated by the server** (`25P03`, `FATAL: terminating connection due to idle-in-transaction timeout`): its transaction is rolled back and every lock released; the client sees the connection closed. Reconnect, run the evidence SELECT for that course (the `active_now` / `total_rows` query at the end of the block) to confirm it still shows the pre-run state, then repeat Step 1 and re-run the batch. In no timeout case is anything written: the `DO` block and the evidence SELECT are inside the same transaction as `COMMIT`.
- The NOTICE line and the evidence SELECT are saved with the run timestamp; they are the proof for Step 3.

```sql operation-a-step2e
-- 2e. Contaminated archived-template instances (from 1c): archive and revoke, never delete.
--     Same boundary and discipline: exclude writers, re-verify under the lock, raise on any difference.
--     One batch per instance (§ Operator rules apply). Run it only from a Step 1c listing taken AFTER the
--     template's archive committed: the template row is read FOR SHARE (round 4, R5-1), so an archive that
--     has not committed is not seen (the block refuses: "repeat Step 1c") and a restore arriving during this
--     batch waits until it commits. A stale attach RPC for this template is refused by its own template
--     re-check under the same row lock (template_not_eligible): it neither re-grants nor creates anything.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '10s';
LOCK TABLE public.assessment_responses,
           public.assessment_instances,
           public.assessment_instance_assignees
  IN EXCLUSIVE MODE;
DO $$
DECLARE
  v_instance uuid := '<instance_id>';
  v_status   text;
  v_archived boolean;
BEGIN
  SELECT i.status, t.is_archived INTO v_status, v_archived
    FROM public.assessment_instances i
    JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
    JOIN public.assessment_templates t ON t.id = s.template_id
   WHERE i.id = v_instance
   FOR UPDATE OF i
   FOR SHARE OF t;   -- the archived decision holds until COMMIT: a restore waits, an uncommitted archive is not seen
  IF NOT FOUND OR NOT v_archived OR v_status = 'archived' THEN
    RAISE EXCEPTION 'operation_a 2e: instance % is not a live instance of an archived template (status %, archived template %) — repeat Step 1c', v_instance, v_status, v_archived;
  END IF;
  UPDATE public.assessment_instances SET status = 'archived', updated_at = now() WHERE id = v_instance;
  DELETE FROM public.assessment_instance_assignees WHERE instance_id = v_instance;
END $$;
COMMIT;
```

## Step 3 — The unique index (separately authorized; refuses on its own if 1a is not empty)

Ship, as a normal additive migration through the DB agent, the transaction below. It takes a `SHARE` lock on the assignments table (every `INSERT`/`UPDATE` waits; reads continue), **re-runs the 1a discovery under that lock** and raises if any duplicate exists, then creates the index while still holding the lock. A duplicate that appeared between the last Step 2 and this migration is therefore refused with a clear message; a writer that arrives while the migration runs waits and then meets the index. There is no interval in which a new duplicate can be created without either being refused by the migration or by the index. (`CREATE UNIQUE INDEX` without `CONCURRENTLY` would abort on duplicates by itself; the explicit re-check turns that into an identifiers-only message and keeps the migration transactional.)

```sql operation-a-step3
-- DEFERRED (Operation A prerequisite) — index statement from the header of 20260907120000_proc_integrity.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '10s';
LOCK TABLE public.school_course_docente_assignments IN SHARE MODE;   -- writers wait; the re-check and the index are one atomic step
DO $$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(course_structure_id::text || ':' || n::text, ', ' ORDER BY course_structure_id)
    INTO v_dups
    FROM (SELECT course_structure_id, count(*) AS n
            FROM public.school_course_docente_assignments
           WHERE is_active GROUP BY 1 HAVING count(*) > 1) d;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'operation_a step 3: courses with more than one active assignment still exist (%) — repeat Step 1 and Step 2, no index created', v_dups;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS school_course_docente_assignments_one_active_key
  ON public.school_course_docente_assignments(course_structure_id)
  WHERE is_active;
COMMIT;
```

After it lands:

- `assign-docente.ts` step 4 (insert / reactivate) can hit SQLSTATE `23505` on a concurrent second docente; the route must translate it to `409 course_already_assigned` (today it answers 500 `Error al asignar docente`). That mapping is a small follow-up change to make together with the index, plus a pgTAP assertion that the index refuses a second active row and allows inactive history.
- The `replace_course_docente` RPC needs no change (it already serialises on the course row and counts under lock).
- Add the index to the attested objects of `pilot_schema_attestation` only if the pilot tooling comes to depend on it (it does not today); regenerate `config/pilot-schema-attestation.json` from a fresh reset in that same migration PR.

## Synthetic proof (local loopback only)

`npm run test:operation-a` (`scripts/ci/operation-a-proof.mjs`) reads the three fenced blocks tagged `operation-a-step2`, `operation-a-step2e` and `operation-a-step3` **from this file**, substitutes the placeholders, and runs them against the local Docker stack (`127.0.0.1` only; the script refuses any other host) on synthetic fixtures it creates and purges itself. It proves, with a superuser observer on `pg_stat_activity`:

1. **Exact targets (B):** an expected set with an id that is not live, an expected set missing a live id, a live set that gained a row after "discovery", an approved id outside the set, a duplicated expected id — each raises with "repeat Step 1" and leaves every row of the three tables byte-identical (fingerprints).
2. **Assignee scope (C):** one approved docente, one obsolete duplicate docente, one unrelated co-assignee not backed by any assignment; after cleanup only the obsolete row is inactive, only the obsolete docente lost the live-instance grant, the co-assignee's and the approved docente's rows are field-identical, the archived instance keeps the obsolete docente's row, no response and no assignment row is deleted. A same-docente duplicate deactivates the extra row and keeps the docente's grant.
3. **Human decision points:** a started instance and an answered instance each refuse with zero mutation.
4. **Concurrency (D):** (a) a response `INSERT` in flight as the obsolete docente holds the boundary off — Step 2 is seen waiting on a lock, the writer commits, Step 2 refuses because the instance is now answered; (b) with Step 2 holding the boundary uncommitted, the obsolete docente's response `INSERT` is seen waiting; after COMMIT it is refused by row-level security (`42501`) and no response exists; (c) a late duplicate assignment `INSERT` waits behind the boundary and lands after it — and Step 3 then refuses under its lock; (d) an in-flight duplicate insert holds Step 3 off, commits, and Step 3 refuses; (e) with clean data Step 3 creates the index while a duplicate insert waits, and that insert fails with `23505` after COMMIT.
5. **Service-role auto-assignment (D-f, round 3 finding 1):** on a second duplicated course, (i) an attach RPC for the obsolete docente **in flight** (transaction open as `service_role`, holding the course row) holds Step 2 off; after it commits Step 2 runs and the final state has no grant for the obsolete docente; (ii) with Step 2 holding the boundary, a **late** attach for the obsolete docente to the existing live instance waits and is refused after COMMIT with `docente_not_active_on_course` — zero grants; (iii) a late attach for the obsolete docente with a **new current snapshot** (the create path) waits and is refused — zero instances created; (iv) the approved docente's late attach with that snapshot waits and then succeeds (a new pending instance with exactly its grant); (v) the approved docente's late attach to the existing instance is `already_exists`; the unrelated co-assignee's row is field-identical throughout. In every case the assertion is on the final state after both transactions finished, not on the wait alone.
6. **Step 2e and the template row lock (round 4 finding R5-1; three sessions — operator, service-role attach, archiver — final state asserted after every participant finished):** (a) *existing-instance path:* the operator holds the 2e boundary; an attach for the course's active docente passes its eligibility reads and waits at the instance lookup; an archive of the template then **waits on the attach's transaction** (observer: `pg_locks` shows the archiver queued on the `transactionid` held by the attach session), not on the boundary; a 2e batch run at that moment refuses ("repeat Step 1c") because the archive has not committed; the boundary is released, the attach commits (`already_exists`), the archive commits after it; Step 1c run after the archive lists exactly that instance; 2e archives it with zero grants; a later attach is refused (`template_not_eligible`), no live instance exists under the template, Step 1c is empty. (b) *create path:* the same ordering on a course with no instance for the snapshot: the attach creates under a then-eligible template, the archive waits and commits after it, Step 1c lists the created instance. (c) *Step 2e against a restore and a stale attach:* with 2e holding the boundary on that instance, a restore of the template waits on 2e's transaction (the block's `FOR SHARE OF t`); a stale attach under the archived template is refused without waiting and creates nothing; 2e commits (archived, zero grants, row kept), then the restore lands; an attach after the restore creates a fresh live instance and the archived one is never reattached (R4).
7. **Idle-in-transaction safeguard (round 3 finding 3):** the Step 2 block's `idle_in_transaction_session_timeout` line is present; with that value shortened to 300 ms (only for this drill — the boundary and every statement are unchanged) a session that stops after `LOCK TABLE` is terminated by the server (`25P03` / connection closed), the observer sees the session gone, no lock remains and nothing was written.
8. **Lifecycle (round 3 finding 4):** the proof closes every client it opened on connection, preflight or test failure; never drops an index it did not create; a failed fixture purge makes the run fail while preserving the original failure; and after a successful run zero fixture schools, zero proof index and zero `opa-*` sessions remain. The failure paths are exercised in-process at the end of a passing run (preflight refusal on a pre-existing index, a purge fault, a test fault), each asserting clean-up and a non-zero result.

The proof leaves no fixture, no index and no open session behind.

## What the remediation branch already closed (so the operation is smaller)

- The API never creates a second live instance for the same course + snapshot (unique index `assessment_instances_course_snapshot_active_key`, PR 2) and never reuses an archived one (R4).
- The `assign-docente` DELETE (the two-statement, two-client unassignment that could answer a partial 207) is **disabled** (Codex round 1, finding 1); the only replacement path is the locked `replace_course_docente` RPC, which refuses started / answered instances.
- Context edits cannot cascade or detach assignment / instance history (R1–R2, transactional RPC).
- Course-level instance and grant creation is one locked transaction (`attach_course_docente_assessment`, round 3): a stale service-role request cannot re-grant a docente whose assignment a cleanup deactivated.

## Authorization checklist (Brent)

1. [ ] Authorize Step 1 (read-only) and receive the identifiers-only evidence.
2. [ ] Decide the approved assignment id per duplicated course (from that course's `assignment_ids`); decide every started / completed or answered instance by hand (archive with reason, or written exclusion naming the instance id).
3. [ ] Declare the window and authorize Step 2 with the exact targets (course id, expected set, approved id) and decisions recorded (one course per transaction, each block executed as one batch — § Operator rules).
4. [ ] Authorize Step 3 (the migration re-checks 1a itself) and the accompanying 23505 → 409 mapping change.
