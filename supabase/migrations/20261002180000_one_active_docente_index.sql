-- =============================================================================
-- 20261002180000_one_active_docente_index.sql — Procesos de Cambio,
-- Operation A Step 3: the database enforces one ACTIVE docente per course.
--
-- Until now the invariant was enforced by the application only
-- (assign-docente 409 course_already_assigned / assignment_invariant_violation,
-- replace_course_docente's count under the course row lock). Production held
-- duplicates, so the index announced in the header of
-- 20260907120000_proc_integrity.sql could not be created. Operation A
-- (docs/planning/operation-a-one-active-docente-handoff.md) cleaned them up on
-- 2026-10-02 with Brent's separate authorizations; the only duplicated course
-- (Step 1a) now has exactly one active assignment.
--
-- WHAT THIS ADDS
--   The partial unique index school_course_docente_assignments_one_active_key
--   on (course_structure_id) WHERE is_active. Inactive rows (history) are
--   unconstrained. A second active row for a course is refused with SQLSTATE
--   23505; assign-docente translates that into 409 course_already_assigned.
--
-- FAIL CLOSED (Step 3 of the handoff, as a migration). Inside one statement:
-- the table is locked SHARE (inserts / updates wait, reads continue), the
-- Step 1a discovery is re-run under that lock and any duplicate aborts the
-- migration naming only course ids and counts, then the index is created
-- while the lock is still held. No duplicate can appear between the check and
-- the index. Nothing is updated or deleted.
--
-- Compatible writers: replace_course_docente deactivates the old row before it
-- activates or inserts the new one (one statement each), so it never holds two
-- active rows at a statement boundary; attach_course_docente_assessment and
-- save_transversal_context do not write this table.
--
-- Pilot schema attestation: this index changes the attested unique-index set
-- of school_course_docente_assignments; config/pilot-schema-attestation.json
-- is regenerated from a fresh reset in the same change.
-- =============================================================================

DO $$
DECLARE
  v_dups text;
BEGIN
  LOCK TABLE public.school_course_docente_assignments IN SHARE MODE;

  SELECT string_agg(course_structure_id::text || ':' || n::text, ', ' ORDER BY course_structure_id)
    INTO v_dups
    FROM (SELECT course_structure_id, count(*) AS n
            FROM public.school_course_docente_assignments
           WHERE is_active
           GROUP BY 1 HAVING count(*) > 1) d;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'one_active_docente_index: courses with more than one active assignment still exist (%) — run Operation A Step 1 and Step 2 first; no index created', v_dups
      USING ERRCODE = 'unique_violation';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS school_course_docente_assignments_one_active_key
    ON public.school_course_docente_assignments (course_structure_id)
    WHERE is_active;
END;
$$;

COMMENT ON INDEX public.school_course_docente_assignments_one_active_key IS
  'One active docente per course (Operation A Step 3, 2026-10-02). Inactive rows are history and unconstrained. assign-docente maps 23505 to 409 course_already_assigned.';
