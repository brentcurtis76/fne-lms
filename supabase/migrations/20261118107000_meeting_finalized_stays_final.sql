-- GENERA fixes F18, build A, item EC-R6: a finalised meeting stays final.
--
-- Owner rule (17 Nov 2026): a meeting starts as a draft and is finalised ONCE.
-- Until now nothing in the database treated a finalised meeting as final: an
-- editor's «Guardar borrador» (or the state select) moved it back to a draft,
-- and the finalize route then refused to finalise it again.
--
-- For a signed-in caller (auth.uid() IS NOT NULL) this guard:
--   1. refuses any change of the finalisation's own fields (finalized_at,
--      finalized_by, finalize_audience, finalize_with_access): only the
--      finalize route writes them, with the service key;
--   2. refuses a change of state of a meeting that carries finalized_at,
--      unless the new state is 'completada' (the one move a meeting trapped by
--      the old defect may make); NULL counts as another state (the column is
--      nullable), so the comparison is null-safe.
-- Text corrections of a finalised meeting stay allowed. Server jobs and the
-- finalize route (auth.uid() IS NULL) are unaffected. Additive: a new function
-- and a new trigger; the existing guard_community_meeting_update is unchanged.

CREATE FUNCTION public.guard_meeting_finalized_stays_final()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
     OR NEW.finalized_by IS DISTINCT FROM OLD.finalized_by
     OR NEW.finalize_audience IS DISTINCT FROM OLD.finalize_audience
     OR NEW.finalize_with_access IS DISTINCT FROM OLD.finalize_with_access THEN
    RAISE EXCEPTION 'F18: a meeting''s finalisation fields are written only by the finalize route'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.finalized_at IS NOT NULL
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text IS DISTINCT FROM 'completada' THEN
    RAISE EXCEPTION 'F18: a finalised meeting cannot leave the state completada'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_meeting_finalized_stays_final() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.guard_meeting_finalized_stays_final() IS
  'F18 (EC-R6): a finalised meeting stays final. A signed-in person never changes finalized_at, finalized_by, finalize_audience or finalize_with_access, and never moves a meeting that carries finalized_at to any state other than completada. Its text can still be corrected. Calls without a signed-in person (the finalize route, server jobs) are not checked.';

CREATE TRIGGER trg_guard_meeting_finalized_stays_final
  BEFORE UPDATE ON public.community_meetings
  FOR EACH ROW EXECUTE FUNCTION public.guard_meeting_finalized_stays_final();
