-- =============================================================================
-- 20260907120000_proc_integrity.sql — Procesos de Cambio remediation, PR 2
-- (data integrity, tenancy, RLS). Additive and idempotent.
--
-- WHAT THIS ADDS
--   1. One transversal context per school (unique index on
--      school_transversal_context.school_id). The API read the newest row and
--      inserted a second one whenever its bare `.maybeSingle()` errored on
--      duplicates; from now on the database refuses the duplicate and the API
--      translates SQLSTATE 23505 into HTTP 409 `context_already_exists`.
--   2. One non-archived assessment instance per (course, template snapshot).
--   3. A trigger that owns the assignee progress flags (has_started /
--      has_submitted) on assessment_instance_assignees. Docentes cannot write
--      that table (its only write policy is admin-only), so the user-client
--      writes in the docente API silently no-op'd. The trigger runs as the
--      function owner and derives both flags from the instance status change.
--
-- PREFLIGHT (run BEFORE applying in any environment). Both unique indexes fail
-- closed at apply time: CREATE UNIQUE INDEX aborts if duplicates already exist,
-- so nothing is partially applied. Find offenders first:
--
--   SELECT school_id, count(*) FROM public.school_transversal_context
--    GROUP BY 1 HAVING count(*) > 1;
--
--   SELECT course_structure_id, template_snapshot_id, count(*)
--     FROM public.assessment_instances
--    WHERE course_structure_id IS NOT NULL AND status <> 'archived'
--    GROUP BY 1, 2 HAVING count(*) > 1;
--
-- RECOVERY
--   The trigger can be neutralised without losing anything (non-destructive,
--   leaves the function and trigger definition in place):
--     ALTER TABLE public.assessment_instances
--       DISABLE TRIGGER assessment_instance_progress_flags_trg;
--   and re-armed with ENABLE TRIGGER. That statement is intentionally NOT part
--   of any migration (the migration guard forbids it there); it is an operator
--   action.
--
-- DEFERRED (Operation A prerequisite): the one-active-docente-per-course
-- invariant is enforced by the API today (409 course_already_assigned /
-- assignment_invariant_violation in assign-docente.ts). Its index is NOT
-- created here because production holds duplicates that must be cleaned up
-- first. The exact statement to ship once that operation has run:
--
--   -- DEFERRED (Operation A prerequisite):
--   CREATE UNIQUE INDEX school_course_docente_assignments_one_active_key
--     ON public.school_course_docente_assignments(course_structure_id)
--     WHERE is_active;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. One transversal context per school
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS school_transversal_context_school_id_key
  ON public.school_transversal_context(school_id);

-- ---------------------------------------------------------------------------
-- 2. One live assessment instance per (course, template snapshot)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS assessment_instances_course_snapshot_active_key
  ON public.assessment_instances(course_structure_id, template_snapshot_id)
  WHERE course_structure_id IS NOT NULL AND status <> 'archived';

-- ---------------------------------------------------------------------------
-- 3. Assignee progress flags derived from the instance status
-- ---------------------------------------------------------------------------
-- Touches ONLY has_started / has_submitted. can_edit, can_submit, user_id and
-- every other column are never written by this function.
--
--   status -> 'in_progress' (from anything else): every assignee of the
--     instance that has not started is marked has_started = true.
--   status -> 'completed' (from anything else): the assignee row belonging to
--     the caller (auth.uid()) is marked has_submitted = true. When the caller
--     has no assignee row (admin / service path) every assignee that
--     can_submit is marked instead.
CREATE OR REPLACE FUNCTION public.assessment_instance_progress_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM 'in_progress' THEN
    UPDATE public.assessment_instance_assignees
       SET has_started = true
     WHERE instance_id = NEW.id
       AND has_started = false;
  END IF;

  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    IF v_caller IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.assessment_instance_assignees
       WHERE instance_id = NEW.id AND user_id = v_caller
    ) THEN
      UPDATE public.assessment_instance_assignees
         SET has_submitted = true
       WHERE instance_id = NEW.id
         AND user_id = v_caller
         AND has_submitted = false;
    ELSE
      UPDATE public.assessment_instance_assignees
         SET has_submitted = true
       WHERE instance_id = NEW.id
         AND can_submit = true
         AND has_submitted = false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assessment_instance_progress_flags() IS
  'Trigger body for assessment_instance_progress_flags_trg: derives assessment_instance_assignees.has_started / has_submitted from assessment_instances.status transitions. Writes no other column.';

-- Postgres 17 locally (supabase/postgres:17.x); CREATE OR REPLACE TRIGGER is
-- available from 14. Re-running the migration replaces the definition in place.
CREATE OR REPLACE TRIGGER assessment_instance_progress_flags_trg
  AFTER UPDATE OF status ON public.assessment_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.assessment_instance_progress_flags();
