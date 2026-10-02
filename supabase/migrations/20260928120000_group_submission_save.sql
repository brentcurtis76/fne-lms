-- NOTIF-10: atomic group assignment submission save.
--
-- Why: pages/api/assignments/submit-group.ts saved a group submission in two
-- requests: UPDATE the members' existing rows, then INSERT the missing ones.
-- When the INSERT failed (a competing claim raising 23505, or any other error)
-- the UPDATE had already committed, so older members carried the new content
-- and stamp while the API answered 409/500 and sent no notification.
--
-- public.save_group_submission performs the whole save in one call (one
-- transaction) as a compare-and-set against the state the route read. The
-- route still decides whether a request is an exact retry and computes a
-- strictly advancing submitted_at; this function persists it or answers
-- 'conflict' / 'forbidden' without writing. Additive only: no table, policy or
-- RLS change.

CREATE FUNCTION public.save_group_submission(
  p_assignment_id text,
  p_group_id      uuid,
  p_actor_id      uuid,
  p_content       text,
  p_file_url      text,
  p_submitted_at  timestamptz,
  p_expected      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_members uuid[];
  v_seen    uuid[];   -- members that have a row, as locked and checked
  v_stale   bigint;
  v_max     timestamptz;
  v_saved   timestamptz;
BEGIN
  IF p_submitted_at IS NULL OR pg_catalog.jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'save_group_submission: p_submitted_at is required and p_expected must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent saves of one group.
  PERFORM 1 FROM public.group_assignment_groups g
   WHERE g.id = p_group_id AND g.assignment_id = p_assignment_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'forbidden');
  END IF;

  -- Members, share-locked (the lock sits in a subquery because FOR SHARE
  -- cannot share a query level with an aggregate).
  SELECT pg_catalog.array_agg(m.user_id) INTO v_members
    FROM (SELECT gm.user_id FROM public.group_assignment_members gm
           WHERE gm.group_id = p_group_id AND gm.assignment_id = p_assignment_id
           FOR SHARE) m;
  IF (p_actor_id = ANY (v_members)) IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'forbidden');
  END IF;

  -- Lock every row of the group or of its members, and read it once.
  SELECT COALESCE(pg_catalog.array_agg(s.user_id) FILTER (WHERE s.user_id = ANY (v_members)), '{}'),
         pg_catalog.count(*) FILTER (WHERE s.user_id = ANY (v_members)
           AND s.submitted_at IS DISTINCT FROM (p_expected ->> s.user_id::text)::timestamptz),
         pg_catalog.max(s.submitted_at)
    INTO v_seen, v_stale, v_max
    FROM (SELECT gs.user_id, gs.submitted_at FROM public.group_assignment_submissions gs
           WHERE gs.assignment_id = p_assignment_id
             AND (gs.group_id = p_group_id OR gs.user_id = ANY (v_members))
           FOR UPDATE) s;

  -- Compare-and-set: the members with a row must be exactly the keys of
  -- p_expected, each with the stamp the caller read, and the new stamp must
  -- advance past every locked row.
  IF v_stale > 0
     OR ARRAY(SELECT k FROM pg_catalog.jsonb_object_keys(p_expected) k ORDER BY 1)
        <> ARRAY(SELECT u::text FROM pg_catalog.unnest(v_seen) u ORDER BY 1)
     OR p_submitted_at <= COALESCE(v_max, '-infinity'::timestamptz) THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'conflict');
  END IF;

  UPDATE public.group_assignment_submissions s
     SET group_id = p_group_id, content = p_content, file_url = p_file_url,
         status = 'submitted', submitted_at = p_submitted_at
   WHERE s.assignment_id = p_assignment_id AND s.user_id = ANY (v_members);

  -- The missing rows come from the checked state, so a row that appeared after
  -- the check makes this INSERT raise 23505. Errors are deliberately not
  -- caught: any failure here also undoes the UPDATE above.
  INSERT INTO public.group_assignment_submissions
    (assignment_id, user_id, group_id, content, file_url, status, submitted_at)
  SELECT p_assignment_id, m, p_group_id, p_content, p_file_url, 'submitted', p_submitted_at
    FROM pg_catalog.unnest(v_members) m
   WHERE NOT (m = ANY (v_seen));

  SELECT s.submitted_at INTO v_saved
    FROM public.group_assignment_submissions s
   WHERE s.assignment_id = p_assignment_id AND s.user_id = p_actor_id;

  RETURN pg_catalog.jsonb_build_object('outcome', 'saved', 'submitted_at', v_saved);
END;
$$;

COMMENT ON FUNCTION public.save_group_submission(text, uuid, uuid, text, text, timestamptz, jsonb) IS
  'Atomically saves a group assignment submission for every group member as a compare-and-set against the state the caller read (p_expected: member user_id -> submitted_at). Returns {"outcome":"saved","submitted_at":...}, {"outcome":"conflict"} or {"outcome":"forbidden"}; server-only (service_role).';

REVOKE ALL ON FUNCTION public.save_group_submission(text, uuid, uuid, text, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_group_submission(text, uuid, uuid, text, text, timestamptz, jsonb) TO service_role;
