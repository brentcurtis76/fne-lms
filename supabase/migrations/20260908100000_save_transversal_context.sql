-- =============================================================================
-- 20260908100000_save_transversal_context.sql — Procesos de Cambio review
-- remediation (R1, R2, R3). Additive and idempotent.
--
-- WHAT THIS ADDS
--   public.save_transversal_context(p_school_id integer, p_payload jsonb)
--   RETURNS jsonb
--
--   ONE transactional operation that replaces the API's former sequence of
--   independent statements (context write, history write, completion update,
--   course delete, course insert, grade relink). Every step lands or none
--   does: a refusal or an error anywhere leaves the database untouched.
--
--   Under a per-school transaction advisory lock and a FOR UPDATE lock on
--   the school's course rows it:
--     1. authorises the caller (assessment admin, or equipo_directivo of
--        exactly p_school_id — the same predicate as the table policies;
--        consultores are refused here regardless of the API);
--     2. validates the payload FAIL CLOSED: integer total_students >= 1,
--        grade_levels drawn from the exact GradeLevel allowlist (unique,
--        non-empty), integer implementation_year_2026 in 1..5 (a fractional
--        or out-of-range number is refused), period_system in
--        (semestral, trimestral), courses_per_level integers in 1..10 per
--        submitted level (absent = 1), programa_inicia_* shapes;
--     3. resolves EVERY requested grade level to exactly one ab_grades row
--        through the fixed sort_order mapping (GRADE_LEVEL_SORT_ORDER in
--        types/assessment-builder.ts); a missing or ambiguous mapping refuses
--        the whole save, so no course row is ever created with a NULL grade;
--     4. computes the course diff and refuses (courses_have_dependencies)
--        when ANY school_course_docente_assignments row — active OR
--        inactive — or ANY assessment_instances row — archived included —
--        depends on a course the new structure would remove. History is
--        never cascaded or detached;
--     5. updates or inserts the context row, records school_change_history,
--        derives is_completed, deletes only dependency-free courses, inserts
--        the missing ones with their resolved grade_id, and relinks grade_id
--        on surviving courses whose mapping changed.
--
-- LOCKING
--   pg_advisory_xact_lock(hashtext('school_transversal_context'), school)
--   serialises two saves of the same school. The FOR UPDATE on the school's
--   course rows conflicts with the KEY SHARE lock a concurrent assignment or
--   instance INSERT takes on its parent course row, so a dependency that is
--   being created while the save runs makes the save wait, then refuse — the
--   check-then-delete race of the former API sequence is closed.
--
-- REFUSALS (SQLSTATE and stable message code)
--   42501  permission_denied
--   P0001  invalid_payload | invalid_total_students | invalid_grade_levels |
--          invalid_grade_level:<value> | duplicate_grade_levels |
--          invalid_year | invalid_period_system | invalid_courses_per_level |
--          invalid_courses_per_level:<level> | invalid_programa_inicia |
--          grade_mapping_missing:<level> | grade_mapping_ambiguous:<level> |
--          courses_have_dependencies (DETAIL = JSON array of blocked courses)
--   A refused call writes nothing.
--
-- RECOVERY
--   CREATE OR REPLACE FUNCTION in place; REVOKE EXECUTE FROM authenticated
--   neutralises the endpoint (operator action, not part of any migration).
-- =============================================================================

-- The exact GradeLevel allowlist and its ab_grades.sort_order mapping. Must
-- stay identical to GRADE_LEVEL_SORT_ORDER in types/assessment-builder.ts;
-- __tests__/lib/transversal-grade-mapping.test.ts pins the two together.
-- Returns NULL for anything outside the allowlist.
CREATE OR REPLACE FUNCTION public.transversal_grade_sort_order(p_grade_level text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_grade_level
    WHEN 'medio_menor' THEN 1
    WHEN 'medio_mayor' THEN 2
    WHEN 'pre_kinder'  THEN 3
    WHEN 'kinder'      THEN 4
    WHEN '1_basico'    THEN 5
    WHEN '2_basico'    THEN 6
    WHEN '3_basico'    THEN 7
    WHEN '4_basico'    THEN 8
    WHEN '5_basico'    THEN 9
    WHEN '6_basico'    THEN 10
    WHEN '7_basico'    THEN 11
    WHEN '8_basico'    THEN 12
    WHEN '1_medio'     THEN 13
    WHEN '2_medio'     THEN 14
    WHEN '3_medio'     THEN 15
    WHEN '4_medio'     THEN 16
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION public.transversal_grade_sort_order(text) IS
  'GradeLevel -> ab_grades.sort_order allowlist used by save_transversal_context. NULL means the value is not a GradeLevel.';

REVOKE ALL ON FUNCTION public.transversal_grade_sort_order(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.transversal_grade_sort_order(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_transversal_context(
  p_school_id integer,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_letters constant text[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  v_total integer;
  v_year integer;
  v_period text;
  v_levels text[];
  v_level text;
  v_raw jsonb;
  v_courses_per_level jsonb := '{}'::jsonb;
  v_count integer;
  v_programa_completed boolean;
  v_programa_hours integer;
  v_programa_year integer;
  v_sort_order integer;
  v_grade_count integer;
  v_grade_id integer;
  v_grade_ids jsonb := '{}'::jsonb;
  v_desired jsonb := '[]'::jsonb;
  v_desired_keys text[] := ARRAY[]::text[];
  v_i integer;
  v_existing record;
  v_blocked jsonb := '[]'::jsonb;
  v_delete_ids uuid[] := ARRAY[]::uuid[];
  v_prev record;
  v_prev_json jsonb;
  v_saved record;
  v_saved_json jsonb;
  v_action text;
  v_changed text[] := ARRAY[]::text[];
  v_field text;
  v_profile_name text;
  v_is_complete boolean;
  v_generated integer := 0;
  v_deleted integer := 0;
  v_relinked integer := 0;
  v_year_changed boolean := false;
  v_row jsonb;
  v_now timestamptz := now();
BEGIN
  -- ------------------------------------------------------------------ shape
  IF p_school_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = 'P0001';
  END IF;

  -- -------------------------------------------------------------- authorise
  IF NOT (public.auth_is_assessment_admin() OR public.auth_is_school_directivo(p_school_id)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  -- ------------------------------------------------------------------- lock
  PERFORM pg_advisory_xact_lock(hashtext('school_transversal_context'), p_school_id);

  -- --------------------------------------------------------------- validate
  IF jsonb_typeof(p_payload->'total_students') <> 'number'
     OR (p_payload->>'total_students')::numeric <> trunc((p_payload->>'total_students')::numeric)
     OR (p_payload->>'total_students')::numeric < 1 THEN
    RAISE EXCEPTION 'invalid_total_students' USING ERRCODE = 'P0001';
  END IF;
  v_total := (p_payload->>'total_students')::integer;

  IF jsonb_typeof(p_payload->'grade_levels') <> 'array'
     OR jsonb_array_length(p_payload->'grade_levels') = 0 THEN
    RAISE EXCEPTION 'invalid_grade_levels' USING ERRCODE = 'P0001';
  END IF;
  FOR v_raw IN SELECT value FROM jsonb_array_elements(p_payload->'grade_levels') LOOP
    IF jsonb_typeof(v_raw) <> 'string' THEN
      RAISE EXCEPTION 'invalid_grade_levels' USING ERRCODE = 'P0001';
    END IF;
    v_level := v_raw #>> '{}';
    IF public.transversal_grade_sort_order(v_level) IS NULL THEN
      RAISE EXCEPTION 'invalid_grade_level:%', v_level USING ERRCODE = 'P0001';
    END IF;
    IF v_level = ANY (COALESCE(v_levels, ARRAY[]::text[])) THEN
      RAISE EXCEPTION 'duplicate_grade_levels' USING ERRCODE = 'P0001';
    END IF;
    v_levels := array_append(v_levels, v_level);
  END LOOP;

  IF jsonb_typeof(p_payload->'implementation_year_2026') <> 'number'
     OR (p_payload->>'implementation_year_2026')::numeric <> trunc((p_payload->>'implementation_year_2026')::numeric)
     OR (p_payload->>'implementation_year_2026')::numeric < 1
     OR (p_payload->>'implementation_year_2026')::numeric > 5 THEN
    RAISE EXCEPTION 'invalid_year' USING ERRCODE = 'P0001';
  END IF;
  v_year := (p_payload->>'implementation_year_2026')::integer;

  v_period := p_payload->>'period_system';
  IF jsonb_typeof(p_payload->'period_system') <> 'string'
     OR v_period NOT IN ('semestral', 'trimestral') THEN
    RAISE EXCEPTION 'invalid_period_system' USING ERRCODE = 'P0001';
  END IF;

  v_raw := COALESCE(p_payload->'courses_per_level', '{}'::jsonb);
  IF jsonb_typeof(v_raw) <> 'object' THEN
    RAISE EXCEPTION 'invalid_courses_per_level' USING ERRCODE = 'P0001';
  END IF;
  FOREACH v_level IN ARRAY v_levels LOOP
    IF v_raw ? v_level AND jsonb_typeof(v_raw->v_level) <> 'null' THEN
      IF jsonb_typeof(v_raw->v_level) <> 'number'
         OR (v_raw->>v_level)::numeric <> trunc((v_raw->>v_level)::numeric)
         OR (v_raw->>v_level)::numeric < 1
         OR (v_raw->>v_level)::numeric > array_length(v_letters, 1) THEN
        RAISE EXCEPTION 'invalid_courses_per_level:%', v_level USING ERRCODE = 'P0001';
      END IF;
      v_count := (v_raw->>v_level)::integer;
    ELSE
      v_count := 1;
    END IF;
    v_courses_per_level := v_courses_per_level || jsonb_build_object(v_level, v_count);
  END LOOP;

  IF p_payload ? 'programa_inicia_completed'
     AND jsonb_typeof(p_payload->'programa_inicia_completed') NOT IN ('boolean', 'null') THEN
    RAISE EXCEPTION 'invalid_programa_inicia' USING ERRCODE = 'P0001';
  END IF;
  v_programa_completed := COALESCE((p_payload->>'programa_inicia_completed')::boolean, false);

  IF p_payload ? 'programa_inicia_hours' AND jsonb_typeof(p_payload->'programa_inicia_hours') <> 'null' THEN
    IF jsonb_typeof(p_payload->'programa_inicia_hours') <> 'number'
       OR (p_payload->>'programa_inicia_hours')::numeric NOT IN (20, 40, 80) THEN
      RAISE EXCEPTION 'invalid_programa_inicia' USING ERRCODE = 'P0001';
    END IF;
    v_programa_hours := (p_payload->>'programa_inicia_hours')::integer;
  END IF;

  IF p_payload ? 'programa_inicia_year' AND jsonb_typeof(p_payload->'programa_inicia_year') <> 'null' THEN
    IF jsonb_typeof(p_payload->'programa_inicia_year') <> 'number'
       OR (p_payload->>'programa_inicia_year')::numeric <> trunc((p_payload->>'programa_inicia_year')::numeric) THEN
      RAISE EXCEPTION 'invalid_programa_inicia' USING ERRCODE = 'P0001';
    END IF;
    v_programa_year := (p_payload->>'programa_inicia_year')::integer;
  END IF;

  -- ---------------------------------------------------------- grade mapping
  -- Every requested level must resolve to exactly one ab_grades row.
  FOREACH v_level IN ARRAY v_levels LOOP
    v_sort_order := public.transversal_grade_sort_order(v_level);
    SELECT count(*), min(id) INTO v_grade_count, v_grade_id
      FROM public.ab_grades
     WHERE sort_order = v_sort_order;
    IF v_grade_count = 0 THEN
      RAISE EXCEPTION 'grade_mapping_missing:%', v_level USING ERRCODE = 'P0001';
    ELSIF v_grade_count > 1 THEN
      RAISE EXCEPTION 'grade_mapping_ambiguous:%', v_level USING ERRCODE = 'P0001';
    END IF;
    v_grade_ids := v_grade_ids || jsonb_build_object(v_level, v_grade_id);
  END LOOP;

  -- --------------------------------------------------------- desired courses
  FOREACH v_level IN ARRAY v_levels LOOP
    v_count := (v_courses_per_level->>v_level)::integer;
    FOR v_i IN 1..v_count LOOP
      v_desired := v_desired || jsonb_build_object(
        'grade_level', v_level,
        'course_name', upper(replace(v_level, '_', ' ') || ' ' || v_letters[v_i]),
        'grade_id', (v_grade_ids->>v_level)::integer
      );
      v_desired_keys := array_append(
        v_desired_keys,
        v_level || '::' || upper(replace(v_level, '_', ' ') || ' ' || v_letters[v_i])
      );
    END LOOP;
  END LOOP;

  -- ------------------------------------------------- lock + dependency check
  -- Lock every course row of the school. A concurrent INSERT of an
  -- assignment or instance that references one of them holds KEY SHARE on
  -- the parent row, which conflicts with FOR UPDATE: the save waits for it
  -- and then sees the dependency.
  PERFORM 1 FROM public.school_course_structure
    WHERE school_id = p_school_id
    FOR UPDATE;

  FOR v_existing IN
    SELECT c.id, c.grade_level, c.course_name, c.grade_id
      FROM public.school_course_structure c
     WHERE c.school_id = p_school_id
  LOOP
    IF (v_existing.grade_level || '::' || v_existing.course_name) = ANY (v_desired_keys) THEN
      CONTINUE;
    END IF;
    SELECT jsonb_build_object(
             'id', v_existing.id,
             'course_name', v_existing.course_name,
             'grade_level', v_existing.grade_level,
             'activeAssignments', (SELECT count(*) FROM public.school_course_docente_assignments a
                                    WHERE a.course_structure_id = v_existing.id AND a.is_active),
             'inactiveAssignments', (SELECT count(*) FROM public.school_course_docente_assignments a
                                      WHERE a.course_structure_id = v_existing.id AND NOT COALESCE(a.is_active, false)),
             'instances', (SELECT count(*) FROM public.assessment_instances i
                            WHERE i.course_structure_id = v_existing.id AND i.status <> 'archived'),
             'archivedInstances', (SELECT count(*) FROM public.assessment_instances i
                                    WHERE i.course_structure_id = v_existing.id AND i.status = 'archived')
           )
      INTO v_row;
    IF (v_row->>'activeAssignments')::integer + (v_row->>'inactiveAssignments')::integer
       + (v_row->>'instances')::integer + (v_row->>'archivedInstances')::integer > 0 THEN
      v_blocked := v_blocked || v_row;
    ELSE
      v_delete_ids := array_append(v_delete_ids, v_existing.id);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_blocked) > 0 THEN
    RAISE EXCEPTION 'courses_have_dependencies'
      USING ERRCODE = 'P0001', DETAIL = v_blocked::text;
  END IF;

  -- ---------------------------------------------------------- context write
  SELECT * INTO v_prev
    FROM public.school_transversal_context
   WHERE school_id = p_school_id
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    v_prev_json := to_jsonb(v_prev);
    v_year_changed := v_prev.implementation_year_2026 IS DISTINCT FROM v_year;
    UPDATE public.school_transversal_context
       SET total_students = v_total,
           grade_levels = v_levels,
           courses_per_level = v_courses_per_level,
           implementation_year_2026 = v_year,
           period_system = v_period,
           programa_inicia_completed = v_programa_completed,
           programa_inicia_hours = v_programa_hours,
           programa_inicia_year = v_programa_year,
           updated_at = v_now
     WHERE id = v_prev.id
     RETURNING * INTO v_saved;
    v_action := 'update';
  ELSE
    v_prev_json := NULL;
    INSERT INTO public.school_transversal_context
      (school_id, total_students, grade_levels, courses_per_level, implementation_year_2026,
       period_system, programa_inicia_completed, programa_inicia_hours, programa_inicia_year,
       created_at, updated_at)
    VALUES
      (p_school_id, v_total, v_levels, v_courses_per_level, v_year,
       v_period, v_programa_completed, v_programa_hours, v_programa_year,
       v_now, v_now)
    RETURNING * INTO v_saved;
    v_action := 'initial_save';
  END IF;

  -- --------------------------------------------------- history + completion
  v_saved_json := to_jsonb(v_saved);
  FOREACH v_field IN ARRAY ARRAY['total_students','grade_levels','courses_per_level',
                                 'implementation_year_2026','period_system',
                                 'programa_inicia_completed','programa_inicia_hours','programa_inicia_year'] LOOP
    IF v_prev_json IS NULL OR (v_prev_json->v_field) IS DISTINCT FROM (v_saved_json->v_field) THEN
      v_changed := array_append(v_changed, v_field);
    END IF;
  END LOOP;

  IF v_prev_json IS NULL OR array_length(v_changed, 1) > 0 THEN
    SELECT name INTO v_profile_name FROM public.profiles WHERE id = v_caller;
    INSERT INTO public.school_change_history
      (school_id, feature, action, previous_state, new_state, changed_fields, user_id, user_name)
    VALUES
      (p_school_id, 'transversal_context', v_action, v_prev_json, v_saved_json, v_changed,
       v_caller, COALESCE(v_profile_name, 'Unknown'));
  END IF;

  v_is_complete := v_saved.total_students IS NOT NULL
                   AND array_length(v_saved.grade_levels, 1) > 0
                   AND v_saved.implementation_year_2026 IS NOT NULL
                   AND v_saved.period_system IS NOT NULL;
  UPDATE public.school_transversal_context
     SET is_completed = v_is_complete,
         completed_at = CASE WHEN v_is_complete THEN v_now ELSE NULL END,
         completed_by = CASE WHEN v_is_complete THEN v_caller ELSE NULL END
   WHERE id = v_saved.id
   RETURNING * INTO v_saved;

  -- ---------------------------------------------------- course reconciliation
  IF array_length(v_delete_ids, 1) > 0 THEN
    DELETE FROM public.school_course_structure
     WHERE id = ANY (v_delete_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_desired) LOOP
    IF EXISTS (
      SELECT 1 FROM public.school_course_structure c
       WHERE c.school_id = p_school_id
         AND c.grade_level = v_row->>'grade_level'
         AND c.course_name = v_row->>'course_name'
    ) THEN
      UPDATE public.school_course_structure
         SET grade_id = (v_row->>'grade_id')::integer
       WHERE school_id = p_school_id
         AND grade_level = v_row->>'grade_level'
         AND course_name = v_row->>'course_name'
         AND grade_id IS DISTINCT FROM (v_row->>'grade_id')::integer;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_relinked := v_relinked + v_count;
    ELSE
      INSERT INTO public.school_course_structure
        (school_id, context_id, grade_level, grade_id, course_name)
      VALUES
        (p_school_id, v_saved.id, v_row->>'grade_level', (v_row->>'grade_id')::integer, v_row->>'course_name');
      v_generated := v_generated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'context', to_jsonb(v_saved),
    'action', v_action,
    'courses_generated', v_generated,
    'courses_deleted', v_deleted,
    'courses_relinked', v_relinked,
    'year_changed', v_year_changed
  );
END;
$$;

COMMENT ON FUNCTION public.save_transversal_context(integer, jsonb) IS
  'Atomically validates and saves a school transversal context and reconciles its course structure. Refuses (writes nothing) on invalid payload, unresolvable grade mapping, or when a removed course has any assignment or assessment instance, archived and inactive rows included.';

REVOKE ALL ON FUNCTION public.save_transversal_context(integer, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_transversal_context(integer, jsonb) TO authenticated, service_role;
