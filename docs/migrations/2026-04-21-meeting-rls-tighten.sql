-- Tighten UPDATE RLS on meeting tables.
--
-- Replaces the old "any active community member can update" policy with a
-- `can_edit_meeting(user_id, meeting_id)` check that only allows:
--   * global admin / consultor
--   * the meeting creator
--   * the meeting facilitator or secretary
--   * attendees with role = 'co_editor'
--   * `lider_comunidad` on the workspace's community
--
-- Applied to all 5 meeting tables:
--   community_meetings, meeting_agreements, meeting_attendees,
--   meeting_commitments, meeting_tasks.
--
-- Date: 2026-04-21
-- Branch: feat/mtg-draft
--
-- ---------------------------------------------------------------------------
-- ACCESS AUDIT (read-only, executed 2026-04-21 via Supabase Management API)
-- ---------------------------------------------------------------------------
-- Query: for meetings updated in the last 90 days, find community members
-- who currently hold UPDATE access under the permissive policy but would
-- LOSE it under the new policy (i.e. not admin/consultor/creator/facilitator/
-- secretary/co_editor/lider_comunidad).
--
--   WITH recent AS (
--     SELECT cm.id AS meeting_id, cm.workspace_id, cm.created_by,
--            cm.facilitator_id, cm.secretary_id, cw.community_id
--     FROM community_meetings cm
--     JOIN community_workspaces cw ON cw.id = cm.workspace_id
--     WHERE cm.updated_at >= NOW() - INTERVAL '90 days'
--   ),
--   potential_editors AS (
--     SELECT r.meeting_id, ur.user_id, ur.role_type
--     FROM recent r
--     JOIN user_roles ur ON ur.community_id = r.community_id
--     WHERE ur.is_active = true
--   ),
--   filtered AS (
--     SELECT pe.meeting_id, pe.user_id, pe.role_type
--     FROM potential_editors pe
--     JOIN recent r USING (meeting_id)
--     WHERE pe.user_id <> r.created_by
--       AND (r.facilitator_id IS NULL OR pe.user_id <> r.facilitator_id)
--       AND (r.secretary_id  IS NULL OR pe.user_id <> r.secretary_id)
--       AND pe.role_type NOT IN ('admin','consultor','lider_comunidad')
--       AND NOT EXISTS (
--         SELECT 1 FROM meeting_attendees ma
--         WHERE ma.meeting_id = pe.meeting_id
--           AND ma.user_id    = pe.user_id
--           AND ma.role       = 'co_editor'
--       )
--   )
--   SELECT meeting_id, user_id, role_type FROM filtered
--   ORDER BY meeting_id, user_id;
--
-- Result: 23 rows — 6 distinct meetings × community members (docentes +
-- one community_manager) who had update access under the permissive rule.
-- The backfill below promotes each to `co_editor` on the relevant meeting
-- to preserve continuity.
--
-- Distinct meetings in audit: 4
--   1058599a-9b72-40bb-bf58-9b1278d6089d
--   6229d8bc-fdf6-4c42-b2b8-1b1e70d71c3f
--   aa03d2ef-413a-44fd-8b7f-488bc05885e9
--   d15a14a5-685c-476e-b947-ddcddd6169c9
-- Distinct users in audit: 12
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. can_edit_meeting(user_id, meeting_id) — SECURITY DEFINER so the policy
--    check can consult user_roles / meeting_attendees without recursing
--    into their own RLS.
CREATE OR REPLACE FUNCTION can_edit_meeting(check_user_id UUID, check_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF check_user_id IS NULL OR check_meeting_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Global admin / consultor short-circuit.
  IF EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = check_user_id
      AND role_type IN ('admin','consultor')
      AND is_active = true
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM community_meetings cm
    JOIN community_workspaces cw ON cw.id = cm.workspace_id
    WHERE cm.id = check_meeting_id
      AND (
        cm.created_by     = check_user_id
        OR cm.facilitator_id = check_user_id
        OR cm.secretary_id   = check_user_id
        OR EXISTS (
          SELECT 1 FROM meeting_attendees ma
          WHERE ma.meeting_id = cm.id
            AND ma.user_id    = check_user_id
            AND ma.role       = 'co_editor'
        )
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id      = check_user_id
            AND ur.community_id = cw.community_id
            AND ur.role_type    = 'lider_comunidad'
            AND ur.is_active    = true
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION can_edit_meeting(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_edit_meeting(UUID, UUID) TO authenticated;

-- 2. Backfill co_editor attendees to preserve access for users who would
--    otherwise lose UPDATE after the policy tightens.
INSERT INTO meeting_attendees (meeting_id, user_id, role, attendance_status)
VALUES
  ('1058599a-9b72-40bb-bf58-9b1278d6089d', '0a565762-40c4-4017-adcb-d25a27f572e7', 'co_editor', 'invited'),
  ('1058599a-9b72-40bb-bf58-9b1278d6089d', '0fb73730-85c6-4a2b-a9a1-88d9876187e9', 'co_editor', 'invited'),
  ('1058599a-9b72-40bb-bf58-9b1278d6089d', '2650b398-eb27-4050-a516-c9eeb6245daf', 'co_editor', 'invited'),
  ('1058599a-9b72-40bb-bf58-9b1278d6089d', 'b3d5e369-4e1c-4c0f-9d29-c01aa4e9c027', 'co_editor', 'invited'),
  ('1058599a-9b72-40bb-bf58-9b1278d6089d', 'b47e9e8b-cf86-4c1f-8a99-b8e48a4dba24', 'co_editor', 'invited'),
  ('1058599a-9b72-40bb-bf58-9b1278d6089d', 'e100bf6c-5163-4d07-bd9c-525291cc9bff', 'co_editor', 'invited'),
  ('6229d8bc-fdf6-4c42-b2b8-1b1e70d71c3f', '0a565762-40c4-4017-adcb-d25a27f572e7', 'co_editor', 'invited'),
  ('6229d8bc-fdf6-4c42-b2b8-1b1e70d71c3f', '0fb73730-85c6-4a2b-a9a1-88d9876187e9', 'co_editor', 'invited'),
  ('6229d8bc-fdf6-4c42-b2b8-1b1e70d71c3f', '2650b398-eb27-4050-a516-c9eeb6245daf', 'co_editor', 'invited'),
  ('6229d8bc-fdf6-4c42-b2b8-1b1e70d71c3f', 'b3d5e369-4e1c-4c0f-9d29-c01aa4e9c027', 'co_editor', 'invited'),
  ('6229d8bc-fdf6-4c42-b2b8-1b1e70d71c3f', 'b47e9e8b-cf86-4c1f-8a99-b8e48a4dba24', 'co_editor', 'invited'),
  ('6229d8bc-fdf6-4c42-b2b8-1b1e70d71c3f', 'e100bf6c-5163-4d07-bd9c-525291cc9bff', 'co_editor', 'invited'),
  ('aa03d2ef-413a-44fd-8b7f-488bc05885e9', '198d44ac-b181-4b93-bc3f-bf1d266ea88b', 'co_editor', 'invited'),
  ('aa03d2ef-413a-44fd-8b7f-488bc05885e9', '2898b0d8-9fa6-43fe-8a07-19f6ad4af533', 'co_editor', 'invited'),
  ('aa03d2ef-413a-44fd-8b7f-488bc05885e9', 'cda02f7e-575f-40b1-bb5f-2ce446133112', 'co_editor', 'invited'),
  ('aa03d2ef-413a-44fd-8b7f-488bc05885e9', 'd5549238-0f3d-4ce7-b500-37dc4e1d9b46', 'co_editor', 'invited'),
  ('aa03d2ef-413a-44fd-8b7f-488bc05885e9', 'f8025409-aeb7-4738-93bc-0becaac133d4', 'co_editor', 'invited'),
  ('d15a14a5-685c-476e-b947-ddcddd6169c9', '0a565762-40c4-4017-adcb-d25a27f572e7', 'co_editor', 'invited'),
  ('d15a14a5-685c-476e-b947-ddcddd6169c9', '0fb73730-85c6-4a2b-a9a1-88d9876187e9', 'co_editor', 'invited'),
  ('d15a14a5-685c-476e-b947-ddcddd6169c9', '2650b398-eb27-4050-a516-c9eeb6245daf', 'co_editor', 'invited'),
  ('d15a14a5-685c-476e-b947-ddcddd6169c9', 'b3d5e369-4e1c-4c0f-9d29-c01aa4e9c027', 'co_editor', 'invited'),
  ('d15a14a5-685c-476e-b947-ddcddd6169c9', 'b47e9e8b-cf86-4c1f-8a99-b8e48a4dba24', 'co_editor', 'invited'),
  ('d15a14a5-685c-476e-b947-ddcddd6169c9', 'e100bf6c-5163-4d07-bd9c-525291cc9bff', 'co_editor', 'invited')
ON CONFLICT (meeting_id, user_id) DO UPDATE
  SET role = 'co_editor'
  WHERE meeting_attendees.role NOT IN ('facilitator','secretary','co_editor');

-- 3. Drop old permissive UPDATE policies on all 5 meeting tables.
DROP POLICY IF EXISTS "Community members can update meetings"        ON community_meetings;
DROP POLICY IF EXISTS "Meeting creators and leaders can update meetings" ON community_meetings;

DROP POLICY IF EXISTS "Users can update meeting agreements"          ON meeting_agreements;
DROP POLICY IF EXISTS "Users can update agreements"                  ON meeting_agreements;

DROP POLICY IF EXISTS "Users can update meeting attendees"           ON meeting_attendees;

DROP POLICY IF EXISTS "Users can update meeting commitments"         ON meeting_commitments;

DROP POLICY IF EXISTS "Users can update meeting tasks"               ON meeting_tasks;
DROP POLICY IF EXISTS "Users can update tasks"                       ON meeting_tasks;

-- 4. New strict UPDATE policies on all 5 tables.
CREATE POLICY "Meeting editors can update meetings"
  ON community_meetings FOR UPDATE TO authenticated
  USING      (can_edit_meeting(auth.uid(), id))
  WITH CHECK (can_edit_meeting(auth.uid(), id));

CREATE POLICY "Meeting editors can update agreements"
  ON meeting_agreements FOR UPDATE TO authenticated
  USING      (can_edit_meeting(auth.uid(), meeting_id))
  WITH CHECK (can_edit_meeting(auth.uid(), meeting_id));

CREATE POLICY "Meeting editors can update attendees"
  ON meeting_attendees FOR UPDATE TO authenticated
  USING      (can_edit_meeting(auth.uid(), meeting_id))
  WITH CHECK (can_edit_meeting(auth.uid(), meeting_id));

CREATE POLICY "Meeting editors can update commitments"
  ON meeting_commitments FOR UPDATE TO authenticated
  USING      (can_edit_meeting(auth.uid(), meeting_id))
  WITH CHECK (can_edit_meeting(auth.uid(), meeting_id));

CREATE POLICY "Meeting editors can update tasks"
  ON meeting_tasks FOR UPDATE TO authenticated
  USING      (can_edit_meeting(auth.uid(), meeting_id))
  WITH CHECK (can_edit_meeting(auth.uid(), meeting_id));

COMMIT;
