-- =============================================================================
-- 106-notification-enqueue-source.sql — NOTIF N5-02a
-- Covers migration 20261009000000_notification_enqueue_source.sql:
--   D1 function attributes and grants; old RPC and source table unchanged;
--      anon / authenticated plain, owner, other, admin: 42501; service_role allowed
--   D2 one record-bound event per source kind plus a no-source event: channel
--      result equals the old RPC's; the source row is written once iff there is
--      an outbox row and the event has a kind; message events also with group
--   D3 event and source rejections (22023, nothing written, also with email off);
--      reused occurrence: same source idempotent, different or missing stored
--      source -> conflict, stored source untouched; also after the category
--      email was turned off (no outbox_id), with in-app newly re-enabled
-- Synthetic fixtures only (*@qa.local.test, fixed UUIDs). Everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(82);

-- Synthetic fixtures (postgres): recipient a, cross user b, comparison user c,
-- plain user p, admin; one record per source kind (two courses).
DO $fixture$
DECLARE
  u text; v uuid;
BEGIN
  FOREACH u IN ARRAY ARRAY['a', 'b', 'c', 'p', 'admin'] LOOP
    v := tests.create_supabase_user('n23_' || u, 'n23-' || u || '@qa.local.test');
    INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
    VALUES (v, 'n23-' || u || '@qa.local.test', 'N23 ' || u, 'approved', false) ON CONFLICT (id) DO NOTHING;
    PERFORM set_config('n23.' || u, v::text, false);
  END LOOP;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES (current_setting('n23.admin')::uuid, 'admin', NULL, true);
  INSERT INTO public.notification_types (id, name, category) VALUES ('course_assigned', 'Curso asignado', 'courses')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.schools (id, name) VALUES (92301, 'N23 escuela sintética');
  INSERT INTO public.growth_communities (id, school_id, name) VALUES ('23000000-0000-4000-8000-0000000000c1', 92301, 'N23 comunidad');
  INSERT INTO public.instructors (id, full_name) VALUES ('23000000-0000-4000-8000-0000000000f1', 'N23 instructor');
  INSERT INTO public.courses (id, title, description, instructor_id) VALUES
    ('23000000-0000-4000-8000-0000000000a1', 'N23 curso', 'sintético', '23000000-0000-4000-8000-0000000000f1'),
    ('23000000-0000-4000-8000-0000000000b1', 'N23 curso 2', 'sintético', '23000000-0000-4000-8000-0000000000f1');
  INSERT INTO public.lessons (id, course_id, title) VALUES ('23000000-0000-4000-8000-0000000000e1', '23000000-0000-4000-8000-0000000000a1', 'N23 lección');
  INSERT INTO public.lesson_assignments (id, title, created_by, course_id)
  VALUES ('23000000-0000-4000-8000-0000000000a2', 'N23 tarea', current_setting('n23.a')::uuid, '23000000-0000-4000-8000-0000000000a1');
  INSERT INTO public.consultant_assignments (id, consultant_id, school_id, is_active, assignment_type)
  VALUES ('23000000-0000-4000-8000-0000000000a3', current_setting('n23.b')::uuid, 92301, true, 'monitoring');
  INSERT INTO public.group_assignment_groups (id, assignment_id, community_id, name, school_id)
  VALUES ('23000000-0000-4000-8000-0000000000a4', 'n23-assignment', '23000000-0000-4000-8000-0000000000c1', 'N23 grupo', 92301);
  INSERT INTO public.quiz_submissions (id, lesson_id, block_id, student_id, course_id, total_possible_points,
                                       auto_gradable_points, manual_gradable_points, answers)
  VALUES ('23000000-0000-4000-8000-0000000000a5', '23000000-0000-4000-8000-0000000000e1', 'n23-block',
          current_setting('n23.a')::uuid, '23000000-0000-4000-8000-0000000000a1', 1, 0, 1, '{}');
  INSERT INTO public.community_workspaces (id, community_id, name)
  VALUES ('23000000-0000-4000-8000-0000000000a6', '23000000-0000-4000-8000-0000000000c1', 'N23 espacio');
  INSERT INTO public.consultor_sessions (id, school_id, growth_community_id, title, session_date, start_time, end_time,
                                         modality, status, created_by)
  VALUES ('23000000-0000-4000-8000-0000000000a7', 92301, '23000000-0000-4000-8000-0000000000c1', 'N23 sesión',
          DATE '2026-11-10', TIME '09:00', TIME '10:00', 'online', 'borrador', current_setting('n23.b')::uuid);
  INSERT INTO public.licitaciones (id, numero_licitacion, school_id, programa_id, nombre_licitacion, year, estado)
  VALUES ('23000000-0000-4000-8000-0000000000a8', 'N23-LIC-1', 92301, 'n23-programa', 'N23 licitación', 2026, 'cerrada');
END
$fixture$;

-- Defaults (course_assigned for user a with course 1), overridden by o; "u" names a fixture user.
CREATE FUNCTION pg_temp.j(o jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('ev', 'course_assigned', 'occ', 'occ:x', 'u', 'a', 'cat', 'courses', 'def', 'immediate',
    'mand', false, 'sk', 'course', 'sid', '23000000-0000-4000-8000-0000000000a1') || o $$;
CREATE FUNCTION pg_temp.enq(o jsonb) RETURNS TABLE (nid uuid, oid uuid, k text, in_app boolean, mode text, reason text)
LANGUAGE sql AS $$
  SELECT e.* FROM pg_temp.j(o) j, public.enqueue_notification_with_source(j->>'ev', j->>'occ',
    current_setting('n23.' || (j->>'u'))::uuid, j->>'cat', j->>'def', (j->>'mand')::boolean, 'N23 título sintético',
    NULL, '/n23/path', NULL, NULL, '{}'::jsonb, j->>'sk', j->>'sid') e $$;
CREATE FUNCTION pg_temp.old(o jsonb) RETURNS TABLE (nid uuid, oid uuid, k text, in_app boolean, mode text, reason text)
LANGUAGE sql AS $$
  SELECT e.* FROM pg_temp.j(o) j, public.enqueue_notification(j->>'ev', j->>'occ',
    current_setting('n23.' || (j->>'u'))::uuid, j->>'cat', j->>'def', (j->>'mand')::boolean, 'N23 título sintético',
    NULL, '/n23/path', NULL, NULL, '{}'::jsonb) e $$;
-- Result plus the bell, outbox and source rows stored under its key.
CREATE FUNCTION pg_temp.sum(o jsonb, via_new boolean) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r record; nb int; no int; ns int; sd text;
BEGIN
  IF via_new THEN SELECT * INTO r FROM pg_temp.enq(o); ELSE SELECT * INTO r FROM pg_temp.old(o); END IF;
  SELECT count(*) INTO nb FROM public.user_notifications WHERE idempotency_key = r.k;
  SELECT count(*) INTO no FROM public.notification_email_outbox WHERE idempotency_key = r.k AND id = r.oid;
  SELECT count(*), string_agg(s.source_kind || ':' || (s.source_id = pg_temp.j(o)->>'sid'), ',') INTO ns, sd
    FROM public.notification_email_outbox_source s JOIN public.notification_email_outbox x ON x.id = s.outbox_id
   WHERE x.idempotency_key = r.k;
  RETURN format('in_app=%s %s/%s bell=%s outbox=%s', r.in_app, r.mode, r.reason, nb, no)
         || CASE WHEN via_new THEN format(' src=%s%s', ns, coalesce(' ' || sd, '')) ELSE '' END;
END $$;
-- Same inputs through the new RPC for user a and the old RPC for user c, with
-- optional legacy in-app off ("ia": false) and category mode ("cm") for both.
CREATE FUNCTION pg_temp.cmp(o jsonb) RETURNS text LANGUAGE plpgsql AS $$
DECLARE j jsonb := pg_temp.j(o); u text; n text; c text;
BEGIN
  FOREACH u IN ARRAY ARRAY['a', 'c'] LOOP
    IF j ? 'ia' THEN INSERT INTO public.user_notification_preferences (user_id, notification_type, email_enabled, in_app_enabled)
      VALUES (current_setting('n23.' || u)::uuid, j->>'ev', true, (j->>'ia')::boolean); END IF;
    IF j ? 'cm' THEN INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode)
      VALUES (current_setting('n23.' || u)::uuid, j->>'cat', j->>'cm'); END IF;
  END LOOP;
  n := pg_temp.sum(o, true);
  c := pg_temp.sum(o || '{"u": "c"}', false);
  DELETE FROM public.user_notification_preferences WHERE user_id IN (current_setting('n23.a')::uuid, current_setting('n23.c')::uuid);
  DELETE FROM public.user_notification_category_prefs WHERE user_id IN (current_setting('n23.a')::uuid, current_setting('n23.c')::uuid);
  RETURN n || ' | old ' || CASE WHEN split_part(n, ' src=', 1) = c THEN 'igual' ELSE c END;
END $$;
-- The error message of a call ('ok' when it succeeds).
CREATE FUNCTION pg_temp.err(o jsonb) RETURNS text LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_temp.enq(o); RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || ' ' || SQLERRM; END $$;
-- Rows of user a: bell / outbox / source.
CREATE FUNCTION pg_temp.cnt() RETURNS text LANGUAGE sql AS $$
  SELECT format('%s/%s/%s', (SELECT count(*) FROM public.user_notifications WHERE user_id = current_setting('n23.a')::uuid),
    (SELECT count(*) FROM public.notification_email_outbox WHERE user_id = current_setting('n23.a')::uuid),
    (SELECT count(*) FROM public.notification_email_outbox_source s JOIN public.notification_email_outbox x ON x.id = s.outbox_id
      WHERE x.user_id = current_setting('n23.a')::uuid)) $$;
-- Every source-table operation and the new RPC; the SQLSTATEs.
CREATE FUNCTION pg_temp.probe() RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE s text[] := '{}'; v uuid := current_setting('n23.probe')::uuid;
BEGIN
  BEGIN PERFORM count(*) FROM public.notification_email_outbox_source; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.notification_email_outbox_source (outbox_id, source_kind, source_id) VALUES (v, 'course', '1'); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.notification_email_outbox_source SET source_id = '2' WHERE outbox_id = v; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.notification_email_outbox_source WHERE outbox_id = v; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM pg_temp.enq('{"occ": "occ:probe-new", "u": "b"}'); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  RETURN s;
END $$;
SELECT set_config('n23.probe', (SELECT oid::text FROM pg_temp.old('{"occ": "occ:probe", "u": "b"}')), false);

-- D1 — attributes and grants (postgres)
CREATE FUNCTION pg_temp.fn(sig text) RETURNS text LANGUAGE sql AS $$
  SELECT format('%s|%s|%s|%s', p.prosecdef, p.proconfig, pg_get_function_result(p.oid),
    (SELECT array_agg(CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END ORDER BY a.grantee::regrole::text)
       FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner))
    FROM pg_proc p WHERE p.oid = sig::regprocedure $$;
SELECT is(pg_temp.fn('public.enqueue_notification_with_source(text, text, uuid, text, text, boolean, text, text, text, text, text, jsonb, text, text)'),
  'f|{"search_path=\"\""}|TABLE(notification_id uuid, outbox_id uuid, idempotency_key text, in_app boolean, email_mode text, email_reason text)|{service_role}',
  'D1: la RPC nueva es SECURITY INVOKER, search_path fijo, mismo resultado que la antigua, EXECUTE solo service_role');
SELECT is(pg_temp.fn('public.enqueue_notification(text, text, uuid, text, text, boolean, text, text, text, text, text, jsonb)'),
  'f|{"search_path=\"\""}|TABLE(notification_id uuid, outbox_id uuid, idempotency_key text, in_app boolean, email_mode text, email_reason text)|{service_role}',
  'D1: la RPC antigua mantiene firma, config y EXECUTE solo service_role');
SELECT is((SELECT count(*)::int FROM pg_proc WHERE proname IN ('enqueue_notification', 'enqueue_notification_with_source')
             AND pronamespace = 'public'::regnamespace), 2, 'D1: una sola sobrecarga de cada RPC');
SELECT tests.rls_enabled('public', 'notification_email_outbox_source');
SELECT is(
  (SELECT array_agg(DISTINCT a.grantee::regrole::text) FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = 'public.notification_email_outbox_source'::regclass AND a.grantee <> c.relowner)
  || ARRAY(SELECT has_table_privilege('service_role', 'public.notification_email_outbox_source', p)::text
             FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p),
  ARRAY['service_role', 'true', 'true', 'true', 'true'],
  'D1: la tabla de fuentes solo tiene grants para service_role (SELECT/INSERT/UPDATE/DELETE)');

-- D1 — role matrix: select/insert/update/delete on the source table, execute the new RPC
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(pg_temp.probe(), ARRAY['42501', '42501', '42501', '42501', '42501'], 'D1: anon no puede select/insert/update/delete/execute');
RESET ROLE;
SELECT tests.authenticate_as('n23_p');
SELECT is(pg_temp.probe(), ARRAY['42501', '42501', '42501', '42501', '42501'], 'D1: authenticated sin relación no puede select/insert/update/delete/execute');
RESET ROLE;
SELECT tests.authenticate_as('n23_b');
SELECT is(pg_temp.probe(), ARRAY['42501', '42501', '42501', '42501', '42501'], 'D1: el destinatario dueño de la fila outbox no puede select/insert/update/delete/execute');
RESET ROLE;
SELECT tests.authenticate_as('n23_a');
SELECT is(pg_temp.probe(), ARRAY['42501', '42501', '42501', '42501', '42501'], 'D1: otro usuario no puede select/insert/update/delete/execute');
RESET ROLE;
SELECT tests.authenticate_as('n23_admin');
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('n23.admin'), 'role', 'authenticated',
  'email', 'n23-admin@qa.local.test', 'app_metadata', json_build_object('role', 'admin', 'roles', json_build_array('admin')),
  'user_metadata', json_build_object('role', 'admin'))::text, true);
SELECT is(pg_temp.probe(), ARRAY['42501', '42501', '42501', '42501', '42501'], 'D1: admin autenticado no puede select/insert/update/delete/execute');
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(pg_temp.probe(), ARRAY['ok', 'ok', 'ok', 'ok', 'ok'], 'D1: service_role puede select/insert/update/delete/execute');

-- D2 — channel parity with the old RPC and the source row (service_role)
SELECT is(pg_temp.cmp('{"occ": "occ:d2-course"}'),
  'in_app=t immediate/catalog_default bell=1 outbox=1 src=1 course:true | old igual', 'D2: course sin preferencias -> campana, outbox y una fuente');
SELECT is(pg_temp.cmp('{"occ": "occ:d2-inapp-off", "ia": false}'),
  'in_app=f immediate/catalog_default bell=0 outbox=1 src=1 course:true | old igual', 'D2: in-app apagado -> solo email, una fuente');
SELECT is(pg_temp.cmp('{"occ": "occ:d2-immediate", "cm": "immediate"}'),
  'in_app=t immediate/category_mode bell=1 outbox=1 src=1 course:true | old igual', 'D2: categoría immediate -> una fuente');
SELECT is(pg_temp.cmp('{"occ": "occ:d2-digest", "cm": "digest"}'),
  'in_app=t digest/category_mode bell=1 outbox=1 src=1 course:true | old igual', 'D2: categoría digest -> una fuente');
SELECT is(pg_temp.cmp('{"occ": "occ:d2-off", "cm": "off"}'),
  'in_app=t off/category_mode bell=1 outbox=0 src=0 | old igual', 'D2: categoría off -> sin outbox y sin fuente');
SELECT is(pg_temp.cmp('{"occ": "occ:d2-mand", "cm": "off", "mand": true}'),
  'in_app=t immediate/mandatory bell=1 outbox=1 src=1 course:true | old igual', 'D2: obligatorio con categoría off -> outbox y una fuente');
SELECT is(pg_temp.cmp('{"occ": "occ:d2-both-off", "cm": "off", "ia": false}'),
  'in_app=f off/category_mode bell=0 outbox=0 src=0 | old igual', 'D2: in-app y email apagados -> nada escrito');
SELECT is(pg_temp.cmp(format('{"occ": "occ:d2-%s", "ev": "%s", "cat": "%s", "sk": "%s", "sid": "%s"}', t.sk, t.ev, t.cat, t.sk, t.sid)::jsonb),
  format('in_app=t immediate/catalog_default bell=1 outbox=1 src=1 %s:true | old igual', t.sk), 'D2: ' || t.ev || ' -> fuente ' || t.sk)
  FROM (VALUES ('assignment_feedback', 'assignments', 'assignment', '23000000-0000-4000-8000-0000000000a2'),
               ('consultant_assigned', 'advisory', 'consultant_assignment', '23000000-0000-4000-8000-0000000000a3'),
               ('group_invitation', 'community', 'group', '23000000-0000-4000-8000-0000000000a4'),
               ('quiz_reviewed', 'courses', 'quiz_submission', '23000000-0000-4000-8000-0000000000a5'),
               ('user_mentioned', 'community', 'workspace', '23000000-0000-4000-8000-0000000000a6'),
               ('session_rescheduled', 'sessions', 'session', '23000000-0000-4000-8000-0000000000a7'),
               ('licitacion_adjudicada', 'licitaciones', 'licitacion', '23000000-0000-4000-8000-0000000000a8')) t(ev, cat, sk, sid);
SELECT is(pg_temp.cmp('{"occ": "occ:d2-system", "ev": "system_update", "cat": "system", "sk": null, "sid": null}'),
  'in_app=t immediate/catalog_default bell=1 outbox=1 src=0 | old igual', 'D2: evento sin registro (system_update) -> outbox sin fuente');

-- D3 — rejections: 22023 with the message class, nothing written
SELECT set_config('n23.before', pg_temp.cnt(), false);
SELECT throws_ok(format('SELECT pg_temp.enq(%L)', t.o), '22023', 'enqueue_notification_with_source: ' || t.msg, 'D3: ' || t.label)
  FROM (VALUES
    ('{"sid": "23000000-0000-4000-8000-0000000000A1"}', 'malformed source id', 'id en mayúsculas -> malformado'),
    ('{"sid": "123"}', 'malformed source id', 'id entero -> malformado'),
    ('{"sid": "basura"}', 'malformed source id', 'id basura -> malformado'),
    ('{"sid": " 23000000-0000-4000-8000-0000000000a1"}', 'malformed source id', 'id con espacios -> malformado'),
    ('{"sid": "{23000000-0000-4000-8000-0000000000a1}"}', 'malformed source id', 'id con llaves -> malformado'),
    ('{"sk": null}', 'source shape does not match the event', 'tipo NULL en evento con registro -> no coincide'),
    ('{"sid": null}', 'source shape does not match the event', 'id NULL en evento con registro -> no coincide'),
    ('{"ev": "system_update", "cat": "system"}', 'source shape does not match the event', 'fuente en evento sin registro -> no coincide'),
    ('{"ev": "new_feedback", "cat": "system", "sk": null}', 'source shape does not match the event', 'solo id en evento sin registro -> no coincide'),
    ('{"sk": "session", "sid": "23000000-0000-4000-8000-0000000000a7"}', 'source shape does not match the event', 'tipo equivocado -> no coincide'),
    ('{"sid": "23000000-0000-4000-8000-0000000000a7"}', 'unknown source record', 'id de una sesión como curso -> registro desconocido'),
    ('{"sid": "23000000-0000-4000-8000-00000000ffff"}', 'unknown source record', 'curso inexistente -> registro desconocido'),
    ('{"ev": "meeting_finalized", "sk": null, "sid": null}', 'unsupported event', 'meeting_finalized -> no soportado'),
    ('{"ev": "learning_path_assigned"}', 'unsupported event', 'learning_path_assigned -> no soportado'),
    ('{"ev": "n23_unknown_evt", "sk": null, "sid": null}', 'unsupported event', 'evento desconocido -> no soportado')
  ) t(o, msg, label);
INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (current_setting('n23.a')::uuid, 'courses', 'off');
SELECT throws_ok($$SELECT pg_temp.enq('{"occ": "occ:d3-off", "sid": "23000000-0000-4000-8000-00000000ffff"}')$$, '22023',
  'enqueue_notification_with_source: unknown source record', 'D3: con email off (sin outbox) una fuente inexistente igual falla');
SELECT throws_ok($$SELECT pg_temp.enq('{"occ": "occ:d3-off", "sid": "123"}')$$, '22023',
  'enqueue_notification_with_source: malformed source id', 'D3: con email off (sin outbox) un id malformado igual falla');
DELETE FROM public.user_notification_category_prefs WHERE user_id = current_setting('n23.a')::uuid;
SELECT is(pg_temp.cnt(), current_setting('n23.before'), 'D3: los rechazos no escriben campana, outbox ni fuente');
SELECT is(
  (SELECT array_agg(t.ev) FROM (VALUES ('course_assigned', 'course'), ('course_completed', 'course'), ('module_completed', 'course'),
      ('assignment_created', 'assignment'), ('assignment_feedback', 'assignment'), ('assignment_due_soon', 'assignment'),
      ('group_invitation', 'group'), ('group_assignment_submitted', 'group'), ('quiz_review_pending', 'quiz_submission'),
      ('quiz_reviewed', 'quiz_submission'), ('message_sent', 'workspace'), ('user_mentioned', 'workspace'),
      ('session_created', 'session'), ('session_rescheduled', 'session'), ('session_cancelled', 'session'),
      ('session_reminder_24h', 'session'), ('session_reminder_1h', 'session'), ('session_edit_request_submitted', 'session'),
      ('session_edit_request_approved', 'session'), ('session_edit_request_rejected', 'session'),
      ('consultant_assigned', 'consultant_assignment'), ('licitacion_created', 'licitacion'), ('licitacion_published', 'licitacion'),
      ('licitacion_bases_deadline_1d', 'licitacion'), ('licitacion_bases_deadline', 'licitacion'),
      ('licitacion_consultas_deadline_1d', 'licitacion'), ('licitacion_consultas_deadline', 'licitacion'),
      ('licitacion_propuestas_open', 'licitacion'), ('licitacion_propuestas_deadline_1d', 'licitacion'),
      ('licitacion_propuestas_deadline', 'licitacion'), ('licitacion_evaluacion_start', 'licitacion'),
      ('licitacion_evaluacion_deadline_1d', 'licitacion'), ('licitacion_evaluacion_complete', 'licitacion'),
      ('licitacion_adjudicada', 'licitacion'), ('licitacion_contrato_generado', 'licitacion'),
      ('qa_scenario_assigned', NULL), ('new_feedback', NULL), ('qa_test_failed', NULL), ('data_quality_alert', NULL),
      ('system_update', NULL)) t(ev, sk)
    WHERE pg_temp.err(jsonb_build_object('ev', t.ev, 'sk', coalesce(t.sk, 'course'), 'sid', 'x'))
          <> CASE WHEN t.sk IS NULL THEN '22023 enqueue_notification_with_source: source shape does not match the event'
                  ELSE '22023 enqueue_notification_with_source: malformed source id' END),
  NULL, 'D3: los 40 eventos de RULES se aceptan con su tipo de fuente (con registro: pasa al formato del id; sin registro: exige fuente NULL)');

-- D3 — reused occurrence
SELECT is(pg_temp.sum('{"occ": "occ:reuse"}', true), 'in_app=t immediate/catalog_default bell=1 outbox=1 src=1 course:true', 'D3: primera llamada con fuente');
SELECT set_config('n23.reuse', (SELECT nid || '/' || oid FROM pg_temp.enq('{"occ": "occ:reuse"}')), false);
SELECT is((SELECT nid || '/' || oid FROM pg_temp.enq('{"occ": "occ:reuse"}')), current_setting('n23.reuse'), 'D3: misma fuente -> mismos notification_id y outbox_id');
SELECT set_config('n23.before', pg_temp.cnt(), false);
SELECT throws_ok($$SELECT pg_temp.enq('{"occ": "occ:reuse", "sid": "23000000-0000-4000-8000-0000000000b1"}')$$, '22023',
  'enqueue_notification_with_source: source conflicts with the stored outbox row', 'D3: otro id de fuente -> conflicto');
SELECT is((SELECT format('%s:%s', s.source_kind, s.source_id) FROM public.notification_email_outbox_source s
            WHERE s.outbox_id = split_part(current_setting('n23.reuse'), '/', 2)::uuid),
  'course:23000000-0000-4000-8000-0000000000a1', 'D3: la fuente guardada sigue intacta y única');
SELECT is(pg_temp.cnt(), current_setting('n23.before'), 'D3: el conflicto no escribe filas');
-- A stored source of another kind (written directly by service_role) also conflicts.
SELECT set_config('n23.kind', (SELECT oid::text FROM pg_temp.old('{"occ": "occ:other-kind"}')), false);
INSERT INTO public.notification_email_outbox_source (outbox_id, source_kind, source_id)
VALUES (current_setting('n23.kind')::uuid, 'session', '23000000-0000-4000-8000-0000000000a7');
SELECT throws_ok($$SELECT pg_temp.enq('{"occ": "occ:other-kind"}')$$, '22023',
  'enqueue_notification_with_source: source conflicts with the stored outbox row', 'D3: fuente guardada de otro tipo -> conflicto');
SELECT is((SELECT format('%s:%s', s.source_kind, s.source_id) FROM public.notification_email_outbox_source s
            WHERE s.outbox_id = current_setting('n23.kind')::uuid),
  'session:23000000-0000-4000-8000-0000000000a7', 'D3: la fuente de otro tipo no se sobrescribe');
-- A source-less outbox row from the old RPC: earlier transaction step, and the same subtransaction.
SELECT set_config('n23.legacy', (SELECT oid::text FROM pg_temp.old('{"occ": "occ:legacy"}')), false);
SELECT set_config('n23.before', pg_temp.cnt(), false);
SELECT throws_ok($$SELECT pg_temp.enq('{"occ": "occ:legacy"}')$$, '22023',
  'enqueue_notification_with_source: source conflicts with the stored outbox row', 'D3: outbox previo sin fuente (RPC antigua) -> conflicto');
CREATE FUNCTION pg_temp.both(o jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_temp.old(o); PERFORM pg_temp.enq(o); END $$;
SELECT throws_ok($$SELECT pg_temp.both('{"occ": "occ:legacy-same-subxact"}')$$, '22023',
  'enqueue_notification_with_source: source conflicts with the stored outbox row', 'D3: RPC antigua y nueva en la misma subtransacción -> conflicto');
SELECT is(pg_temp.cnt(), current_setting('n23.before'), 'D3: no se adjunta fuente a la fila sin fuente ni se escriben filas');

-- D3 — retries after the category email was turned off (the old RPC then returns no outbox_id).
-- Prior state with email on: occ:off with course 1 (user a, new RPC; user c, old RPC), a source-less
-- occ:legacy-off (old RPC), and occ:inapp-off written with legacy in-app off (outbox and source, no bell).
SELECT set_config('n23.off', (SELECT oid::text FROM pg_temp.enq('{"occ": "occ:off"}')), false);
SELECT set_config('n23.offc', (SELECT oid::text FROM pg_temp.old('{"occ": "occ:off", "u": "c"}')), false);
SELECT set_config('n23.legacyoff', (SELECT oid::text FROM pg_temp.old('{"occ": "occ:legacy-off"}')), false);
INSERT INTO public.user_notification_preferences (user_id, notification_type, email_enabled, in_app_enabled)
VALUES (current_setting('n23.a')::uuid, 'course_assigned', true, false);
SELECT is(pg_temp.sum('{"occ": "occ:inapp-off"}', true), 'in_app=f immediate/catalog_default bell=0 outbox=1 src=1 course:true',
  'D3: primera llamada con in-app apagado -> outbox y fuente, sin campana');
UPDATE public.user_notification_preferences SET in_app_enabled = true WHERE user_id = current_setting('n23.a')::uuid;
INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode)
SELECT current_setting('n23.' || u)::uuid, 'courses', 'off' FROM unnest(ARRAY['a', 'c']) u;
SELECT set_config('n23.before', pg_temp.cnt(), false);
SELECT is(pg_temp.err('{"occ": "occ:off", "sid": "23000000-0000-4000-8000-0000000000b1"}'),
  '22023 enqueue_notification_with_source: source conflicts with the stored outbox row',
  'D3: PM: conflicting retry must reject even when category email is now off (otra fuente con email off -> conflicto)');
SELECT is((SELECT string_agg(format('%s:%s', s.source_kind, s.source_id), ',') FROM public.notification_email_outbox_source s
            WHERE s.outbox_id = current_setting('n23.off')::uuid),
  'course:23000000-0000-4000-8000-0000000000a1', 'D3: tras el conflicto con email off la fuente guardada sigue siendo la original y única');
SELECT is((SELECT format('%s %s', n, o) FROM (SELECT ROW(e.oid, e.in_app, e.mode, e.reason)::text n FROM pg_temp.enq('{"occ": "occ:off"}') e) x,
            (SELECT ROW(e.oid, e.in_app, e.mode, e.reason)::text o FROM pg_temp.old('{"occ": "occ:off", "u": "c"}') e) y),
  '(,t,off,category_mode) (,t,off,category_mode)',
  'D3: misma fuente con email off -> éxito, igual que la RPC antigua para el usuario de comparación (outbox_id NULL, off/category_mode)');
SELECT is((SELECT string_agg(format('%s:%s', s.source_kind, s.source_id), ',') FROM public.notification_email_outbox_source s
            WHERE s.outbox_id = current_setting('n23.off')::uuid),
  'course:23000000-0000-4000-8000-0000000000a1', 'D3: el reintento con la misma fuente no toca la fuente guardada (sigue única)');
SELECT throws_ok($$SELECT pg_temp.enq('{"occ": "occ:legacy-off"}')$$, '22023',
  'enqueue_notification_with_source: source conflicts with the stored outbox row', 'D3: outbox previo sin fuente y email off -> conflicto');
SELECT throws_ok($$SELECT pg_temp.enq('{"occ": "occ:inapp-off", "sid": "23000000-0000-4000-8000-0000000000b1"}')$$, '22023',
  'enqueue_notification_with_source: source conflicts with the stored outbox row',
  'D3: in-app reactivado, email off y otra fuente -> conflicto');
SELECT is((SELECT count(*)::int FROM public.user_notifications n JOIN public.notification_email_outbox o ON o.idempotency_key = n.idempotency_key
            WHERE o.user_id = current_setting('n23.a')::uuid AND o.occurrence_id = 'occ:inapp-off'), 0,
  'D3: el conflicto con in-app reactivado no deja ninguna campana para esa clave');
SELECT is(pg_temp.cnt(), current_setting('n23.before'), 'D3: los conflictos con email off no escriben campana, outbox ni fuente');

-- D2/D3 — message events of an assignment-group thread: kind group (group a4), workspace (a6) otherwise.
CREATE FUNCTION pg_temp.m(occ text, sk text, ev text DEFAULT 'message_sent') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('occ', occ, 'ev', ev, 'cat', 'community', 'sk', sk, 'sid', CASE sk WHEN 'group'
    THEN '23000000-0000-4000-8000-0000000000a4' ELSE '23000000-0000-4000-8000-0000000000a6' END) $$;
SELECT is(pg_temp.cmp(pg_temp.m('occ:g-' || t.ev, 'group', t.ev)),
  'in_app=t immediate/catalog_default bell=1 outbox=1 src=1 group:true | old igual', 'D2: ' || t.ev || ' de hilo de grupo -> fuente group')
  FROM (VALUES ('message_sent'), ('user_mentioned')) t(ev);
SELECT set_config('n23.before', pg_temp.cnt(), false);
SELECT throws_ok(format('SELECT pg_temp.enq(%L)', t.o), '22023', 'enqueue_notification_with_source: ' || t.msg, 'D3: ' || t.label)
  FROM (VALUES
    (pg_temp.m('occ:x', 'group') || '{"sid": "23000000-0000-4000-8000-00000000ffff"}', 'unknown source record', 'message_sent con grupo inexistente -> registro desconocido'),
    (pg_temp.m('occ:x', 'session') || '{"sid": "23000000-0000-4000-8000-0000000000a7"}', 'source shape does not match the event', 'message_sent con tipo session -> no coincide'),
    (pg_temp.m('occ:x', NULL), 'source shape does not match the event', 'message_sent con tipo NULL -> no coincide'),
    (pg_temp.m('occ:x', 'workspace', 'group_invitation'), 'source shape does not match the event', 'group_invitation con tipo workspace -> no coincide'),
    ('{"sk": "group", "sid": "23000000-0000-4000-8000-0000000000a4"}'::jsonb, 'source shape does not match the event', 'course_assigned con tipo group -> no coincide')
  ) t(o, msg, label);
SELECT is(pg_temp.cnt(), current_setting('n23.before'), 'D3: los rechazos de fuentes de mensajes no escriben campana, outbox ni fuente');
SELECT is((SELECT array_agg(t.ev) FROM unnest(ARRAY['message_sent', 'user_mentioned']) t(ev)
    WHERE pg_temp.err(jsonb_build_object('ev', t.ev, 'sk', 'group', 'sid', 'x')) <> '22023 enqueue_notification_with_source: malformed source id'),
  NULL, 'D3: message_sent y user_mentioned también se aceptan con tipo de fuente group');
-- Same occurrence with the other message source kind, in both orders, also with community email off.
SELECT set_config('n23.ws', (SELECT nid || '/' || oid FROM pg_temp.enq(pg_temp.m('occ:msg-ws', 'workspace'))), false);
SELECT set_config('n23.gr', (SELECT nid || '/' || oid FROM pg_temp.enq(pg_temp.m('occ:msg-gr', 'group'))), false);
SELECT set_config('n23.before', pg_temp.cnt(), false);
SELECT is(pg_temp.err(pg_temp.m('occ:msg-ws', 'group')), '22023 enqueue_notification_with_source: source conflicts with the stored outbox row',
  'D3: message_sent con fuente workspace reintentado con fuente group -> conflicto');
SELECT is(pg_temp.cnt(), current_setting('n23.before'), 'D3: el conflicto workspace -> group no escribe filas');
INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (current_setting('n23.a')::uuid, 'community', 'off');
SELECT is(pg_temp.err(pg_temp.m('occ:msg-ws', 'group')), '22023 enqueue_notification_with_source: source conflicts with the stored outbox row',
  'D3: con email community off, reintento con fuente group -> conflicto');
SELECT is(pg_temp.cnt(), current_setting('n23.before'), 'D3: el conflicto con email community off no escribe filas');
DELETE FROM public.user_notification_category_prefs WHERE user_id = current_setting('n23.a')::uuid;
SELECT is(pg_temp.err(pg_temp.m('occ:msg-gr', 'workspace')), '22023 enqueue_notification_with_source: source conflicts with the stored outbox row',
  'D3: message_sent con fuente group reintentado con fuente workspace -> conflicto');
SELECT is(pg_temp.cnt(), current_setting('n23.before'), 'D3: el conflicto group -> workspace no escribe filas');
SELECT is((SELECT string_agg(format('%s:%s', s.source_kind, s.source_id), ',' ORDER BY s.source_kind) FROM public.notification_email_outbox_source s
            WHERE s.outbox_id IN (split_part(current_setting('n23.ws'), '/', 2)::uuid, split_part(current_setting('n23.gr'), '/', 2)::uuid)),
  'group:23000000-0000-4000-8000-0000000000a4,workspace:23000000-0000-4000-8000-0000000000a6', 'D3: las fuentes guardadas de mensajes siguen intactas');
SELECT is((SELECT nid || '/' || oid FROM pg_temp.enq(pg_temp.m('occ:msg-gr', 'group'))), current_setting('n23.gr'),
  'D3: misma fuente group -> mismos notification_id y outbox_id');
SELECT set_config('n23.two', (SELECT string_agg(e.oid::text, ',') FROM unnest(ARRAY['occ:msg-g1', 'occ:msg-g2']) t(occ),
  LATERAL pg_temp.enq(pg_temp.m(t.occ, 'group')) e), false);
SELECT is((SELECT format('%s/%s %s', count(*), count(DISTINCT s.outbox_id), string_agg(DISTINCT s.source_kind || ':' || s.source_id, ','))
            FROM public.notification_email_outbox_source s WHERE s.outbox_id = ANY (string_to_array(current_setting('n23.two'), ',')::uuid[])),
  '2/2 group:23000000-0000-4000-8000-0000000000a4', 'D3: dos mensajes del mismo grupo -> dos filas outbox distintas, cada una con su fuente group');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
