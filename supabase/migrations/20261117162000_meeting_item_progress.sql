-- GENERA fixes F12a (17 Nov 2026), EC-R3 + R15: progress of a meeting's tasks
-- and commitments.
--
-- EC-R3: «Reabrir» wrote a state other than 'completado' while completed_at
-- stayed set and progress stayed 100, which the table checks refuse
-- (completed_when_done on meeting_commitments, task_completed_when_done on
-- meeting_tasks). This function clears completed_at whenever the new state is
-- not 'completado'.
--
-- R15 (owner decision, 17 Nov 2026): the person a task or commitment is
-- assigned to may change its state and add a progress note; not its text,
-- date or assignee. Verified editors of the meeting keep what they can do.
--
-- Add-only: one new function. No rule (policy) on meeting_tasks or
-- meeting_commitments changes, so a direct table update by the person in
-- charge stays refused; the function is the only new path, and it writes
-- only status, progress_percentage, completed_at, notes and updated_at.

CREATE FUNCTION public.update_meeting_item_progress(
  p_kind text,
  p_id uuid,
  p_status public.task_status,
  p_progress integer,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_meeting_id uuid;
  v_assigned_to uuid;
  v_done boolean := (p_status = 'completado'::public.task_status);
  v_notes text := NULLIF(p_notes, '');
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('task', 'commitment') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_kind';
  END IF;
  IF p_progress IS NULL OR p_progress < 0 OR p_progress > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_progress';
  END IF;
  IF p_status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_status';
  END IF;

  -- Signed in, and not held by a forced password change.
  IF v_uid IS NULL OR NOT public.password_change_gate_ok() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_allowed';
  END IF;

  IF p_kind = 'task' THEN
    SELECT t.meeting_id, t.assigned_to INTO v_meeting_id, v_assigned_to
      FROM public.meeting_tasks t
     WHERE t.id = p_id
       FOR UPDATE;
  ELSE
    SELECT c.meeting_id, c.assigned_to INTO v_meeting_id, v_assigned_to
      FROM public.meeting_commitments c
     WHERE c.id = p_id
       FOR UPDATE;
  END IF;

  -- A missing row and a caller who may not update it get the same answer.
  IF v_meeting_id IS NULL
     OR NOT (
       public.can_edit_meeting_verified(v_uid, v_meeting_id)
       OR v_assigned_to = v_uid
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_allowed';
  END IF;

  IF p_kind = 'task' THEN
    UPDATE public.meeting_tasks
       SET status = p_status,
           progress_percentage = CASE WHEN v_done THEN 100 ELSE p_progress END,
           completed_at = CASE WHEN v_done THEN now() ELSE NULL END,
           notes = COALESCE(v_notes, notes),
           updated_at = now()
     WHERE id = p_id;
  ELSE
    UPDATE public.meeting_commitments
       SET status = p_status,
           progress_percentage = CASE WHEN v_done THEN 100 ELSE p_progress END,
           completed_at = CASE WHEN v_done THEN now() ELSE NULL END,
           notes = COALESCE(v_notes, notes),
           updated_at = now()
     WHERE id = p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_meeting_item_progress(text, uuid, public.task_status, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_meeting_item_progress(text, uuid, public.task_status, integer, text) TO authenticated;

COMMENT ON FUNCTION public.update_meeting_item_progress(text, uuid, public.task_status, integer, text) IS
  'F12a EC-R3/R15: sets status, progress_percentage, completed_at (now() when completado, otherwise NULL) and notes (when given) of one meeting task (p_kind task) or commitment (p_kind commitment). Allowed to a verified editor of the item''s meeting (can_edit_meeting_verified) or the person the item is assigned to; signed-in callers not held by a forced password change only. A missing row and a refused caller both raise not_allowed (42501). Never changes text, description, dates, assignee or meeting.';
