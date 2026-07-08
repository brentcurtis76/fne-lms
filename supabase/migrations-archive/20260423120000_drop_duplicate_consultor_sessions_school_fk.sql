-- Drop the redundant FK consultor_sessions.school_id -> schools.id.
--
-- Two FKs existed on the same column pair:
--   - consultor_sessions_school_id_fkey  (NO ACTION, kept as canonical)
--   - fk_consultor_sessions_school       (ON DELETE RESTRICT, dropped here)
--
-- The duplicate caused PostgREST to return HTTP 300 (PGRST201 "Multiple
-- Choices") for any embed like schools(name), which the /api/sessions
-- handler converts to 500. The API code was updated in commit 60db489
-- to pin embeds to consultor_sessions_school_id_fkey; this migration
-- removes the ambiguity at the schema level so future un-hinted embeds
-- cannot reintroduce the bug.
--
-- Semantic note: the surviving FK has default NO ACTION on delete. The
-- dropped one had ON DELETE RESTRICT. For non-deferrable constraints
-- both prevent orphaning equivalently at commit time.
--
-- Guarded so it is safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_consultor_sessions_school'
      AND conrelid = 'public.consultor_sessions'::regclass
  ) THEN
    ALTER TABLE public.consultor_sessions
      DROP CONSTRAINT fk_consultor_sessions_school;
  END IF;
END
$$;
