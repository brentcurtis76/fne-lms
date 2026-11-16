-- =============================================================================
-- GENERA fixes F8, send-back 1 (GC-10): a template publication writes its
-- snapshot and flips the template to published in ONE transaction.
--
-- public.publish_assessment_template(p_template_id, p_expected_version,
-- p_snapshot_data) is called by lib/services/assessment-builder/publishTemplate.ts
-- with the service-role client, after the publish route has verified the caller
-- is an admin and after every check a person can correct has passed.
--
-- Steps, in order (any error rolls the whole call back):
--   1. lock the template row (SELECT ... FOR UPDATE);
--   2. refuse, writing nothing, unless it is still a draft at p_expected_version
--      (the version the caller read) -> {ok:false, code:'template_not_draft'};
--   3. take a transaction-scoped advisory lock on the template's version scope:
--      (area, grade_id) for graded templates, (area, btrim(name)) for grade-less
--      ones -- the scopes of the unique keys assessment_templates_area_grade_version_key
--      and assessment_templates_gradeless_version_key (templateGradeRule.ts);
--   4. the version to publish is the next free one in that scope: the highest of
--      the template's own version, any published template's version and any
--      snapshot's version of the other templates of the scope, minor + 1, patch 0,
--      moving on while another template of the scope already holds it;
--   5. write the snapshot row. A snapshot of THIS template at that version can
--      only be a leftover of an earlier failed attempt (the template is a draft,
--      locked): it is overwritten in place when no assessment instance refers to
--      it, and the call is refused otherwise ({ok:false, code:'snapshot_in_use'});
--      no snapshot is ever deleted;
--   6. flip the template: status = 'published', version = the computed version
--      (the same two columns the service wrote before; the vía-rule guard and the
--      unique keys still apply and abort the call when they refuse).
--
-- Add-only: a new function, no table change.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.publish_assessment_template(
  p_template_id uuid,
  p_expected_version text,
  p_snapshot_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template public.assessment_templates%ROWTYPE;
  v_scope_name text;
  v_max bigint[];
  v_candidate bigint[];
  v_version text;
  v_snapshot_id uuid;
  v_snapshot public.assessment_template_snapshots%ROWTYPE;
  v_flipped public.assessment_templates%ROWTYPE;
BEGIN
  IF p_template_id IS NULL OR p_expected_version IS NULL OR p_snapshot_data IS NULL THEN
    RAISE EXCEPTION 'publish_assessment_template: arguments are required' USING ERRCODE = '22004';
  END IF;

  -- 1. lock the template row
  SELECT * INTO v_template FROM public.assessment_templates WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'template_not_found');
  END IF;

  -- 2. still a draft at the version the caller read
  IF v_template.status IS DISTINCT FROM 'draft' OR v_template.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'template_not_draft');
  END IF;

  -- 3. serialize publications of the same version scope
  v_scope_name := btrim(v_template.name);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    CASE WHEN v_template.grade_id IS NOT NULL
      THEN format('assessment_template_version|%s|grade|%s', v_template.area, v_template.grade_id)
      ELSE format('assessment_template_version|%s|name|%s', v_template.area, v_scope_name)
    END, 0));

  -- 4. next free published version in the scope
  WITH scope AS (
    SELECT t.id, t.version, t.status
      FROM public.assessment_templates t
     WHERE t.area = v_template.area
       AND CASE WHEN v_template.grade_id IS NOT NULL
             THEN t.grade_id = v_template.grade_id
             ELSE t.grade_id IS NULL AND btrim(t.name) = v_scope_name
           END
  ), held AS (
    SELECT v_template.version AS version
    UNION ALL
    SELECT s.version FROM scope s WHERE s.status = 'published' AND s.id <> p_template_id
    UNION ALL
    SELECT sn.version
      FROM public.assessment_template_snapshots sn
      JOIN scope s ON s.id = sn.template_id
     WHERE sn.template_id <> p_template_id
  )
  SELECT max(string_to_array(h.version, '.')::bigint[])
    INTO v_max
    FROM held h
   WHERE h.version ~ '^[0-9]{1,15}\.[0-9]{1,15}\.[0-9]{1,15}$';

  IF v_max IS NULL THEN
    v_max := ARRAY[1, 0, 0]::bigint[];
  END IF;
  v_candidate := ARRAY[v_max[1], v_max[2] + 1, 0]::bigint[];
  LOOP
    v_version := array_to_string(v_candidate, '.');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.assessment_templates t
       WHERE t.id <> p_template_id
         AND t.area = v_template.area
         AND t.version = v_version
         AND CASE WHEN v_template.grade_id IS NOT NULL
               THEN t.grade_id = v_template.grade_id
               ELSE t.grade_id IS NULL AND btrim(t.name) = v_scope_name
             END
    );
    v_candidate[2] := v_candidate[2] + 1;
  END LOOP;

  -- 5. the snapshot: a leftover of an earlier failed attempt is overwritten in
  --    place, only when no assessment instance refers to it
  SELECT id INTO v_snapshot_id
    FROM public.assessment_template_snapshots
   WHERE template_id = p_template_id AND version = v_version
   FOR UPDATE;

  IF v_snapshot_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.assessment_instances WHERE template_snapshot_id = v_snapshot_id) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'snapshot_in_use', 'version', v_version);
    END IF;
    UPDATE public.assessment_template_snapshots
       SET snapshot_data = p_snapshot_data,
           created_at = now(),
           created_by = NULL
     WHERE id = v_snapshot_id
    RETURNING * INTO v_snapshot;
  ELSE
    INSERT INTO public.assessment_template_snapshots (template_id, version, snapshot_data)
    VALUES (p_template_id, v_version, p_snapshot_data)
    RETURNING * INTO v_snapshot;
  END IF;

  -- 6. flip the template
  UPDATE public.assessment_templates
     SET status = 'published',
         version = v_version
   WHERE id = p_template_id
  RETURNING * INTO v_flipped;

  RETURN jsonb_build_object(
    'ok', true,
    'version', v_version,
    'template', jsonb_build_object(
      'id', v_flipped.id,
      'name', v_flipped.name,
      'area', v_flipped.area,
      'status', v_flipped.status,
      'version', v_flipped.version
    ),
    'snapshot', jsonb_build_object(
      'id', v_snapshot.id,
      'version', v_snapshot.version,
      'created_at', v_snapshot.created_at
    )
  );
END;
$$;

COMMENT ON FUNCTION public.publish_assessment_template(uuid, text, jsonb) IS
  'GC-10: writes the snapshot and flips the template to published in one transaction, '
  'at the next free version of its scope. Service role only; the publish route checks the admin.';

REVOKE ALL ON FUNCTION public.publish_assessment_template(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_assessment_template(uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.publish_assessment_template(uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.publish_assessment_template(uuid, text, jsonb) TO service_role;
