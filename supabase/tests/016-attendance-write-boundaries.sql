-- Z7-R9: attendance evidence is readable where required but writable only through
-- fixed-search-path owner RPCs. Synthetic fixtures only; the transaction rolls back.
BEGIN;

SELECT plan(109);

INSERT INTO public.schools (id, name)
VALUES (9919, 'Z7 R9 synthetic authority school')
ON CONFLICT (id) DO NOTHING;

INSERT INTO zoom_internal.zoom_meetings (
  id, surface_type, surface_id, school_id, zoom_meeting_number,
  zoom_meeting_uuid, status, starts_at, duration_minutes
) VALUES
  ('a9a9a9a9-1000-4000-8000-000000000001', 'consultor_session',
   'a9a9a9a9-2000-4000-8000-000000000001', 9919, 99190000001,
   'r9-exact-occurrence', 'ended', '2026-08-13T10:00:00Z', 60),
  ('a9a9a9a9-1000-4000-8000-000000000002', 'consultor_session',
   'a9a9a9a9-2000-4000-8000-000000000002', 9919, 99190000002,
   NULL, 'provisioned', '2026-08-13T12:00:00Z', 60);

-- Every direct mutation capability is absent for every exposed role.
SELECT is(
  has_table_privilege(r.role_name, t.table_name, p.privilege_name),
  false,
  format('%s has no direct %s on %s', r.role_name, p.privilege_name, t.table_name)
)
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
CROSS JOIN (VALUES
  ('public.zoom_attendance'),
  ('zoom_internal.zoom_attendance_observations'),
  ('zoom_internal.zoom_attendance_report_batches')
) AS t(table_name)
CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('TRIGGER'))
  AS p(privilege_name);

SELECT ok(has_table_privilege('service_role', 'public.zoom_attendance', 'SELECT'),
  'service_role retains required attendance reads');
SELECT ok(has_table_privilege('service_role',
  'zoom_internal.zoom_attendance_observations', 'SELECT'),
  'service_role retains required observation reads');
SELECT ok(has_table_privilege('service_role',
  'zoom_internal.zoom_attendance_report_batches', 'SELECT'),
  'service_role retains required batch reads');

SELECT tests.rls_enabled('public', 'zoom_attendance');
SELECT tests.rls_enabled('zoom_internal', 'zoom_attendance_observations');
SELECT tests.rls_enabled('zoom_internal', 'zoom_attendance_report_batches');

-- The five legitimate writers are owner-executed, fixed-search-path, and narrowly
-- granted to service_role. The helper and obsolete leave signature stay unexposed.
SELECT is(has_function_privilege('service_role', f.signature, 'EXECUTE'), true,
  format('service_role can execute %s', f.signature))
FROM (VALUES
  ('zoom_internal.apply_participant_join(text, uuid, integer, text, text, uuid, text, text, text, text, timestamptz, text[], text)'),
  ('zoom_internal.apply_participant_leave(text, uuid, integer, text, text, timestamptz, text, text, text, text, text[])'),
  ('zoom_internal.create_attendance_report_batch(integer, text, uuid, text)'),
  ('zoom_internal.reject_attendance_report_batch(uuid, text)'),
  ('zoom_internal.promote_attendance_report_batch(uuid, jsonb, integer, integer, integer, timestamptz)')
) AS f(signature);

SELECT is(has_function_privilege(r.role_name, f.signature, 'EXECUTE'), false,
  format('%s cannot execute %s', r.role_name, f.signature))
FROM (VALUES ('anon'), ('authenticated')) AS r(role_name)
CROSS JOIN (VALUES
  ('zoom_internal.apply_participant_join(text, uuid, integer, text, text, uuid, text, text, text, text, timestamptz, text[], text)'),
  ('zoom_internal.apply_participant_leave(text, uuid, integer, text, text, timestamptz, text, text, text, text, text[])'),
  ('zoom_internal.create_attendance_report_batch(integer, text, uuid, text)'),
  ('zoom_internal.reject_attendance_report_batch(uuid, text)'),
  ('zoom_internal.promote_attendance_report_batch(uuid, jsonb, integer, integer, integer, timestamptz)')
) AS f(signature);

SELECT is(has_function_privilege('service_role',
  'zoom_internal.claim_participant_occurrence(text, uuid, integer, text)', 'EXECUTE'), false,
  'occurrence CAS helper remains owner-only');
SELECT is(has_function_privilege('service_role',
  'zoom_internal.apply_participant_leave(integer, text, text, timestamptz, text, text, text, text, text[])',
  'EXECUTE'), false, 'obsolete leave signature remains non-executable');

SELECT is(p.prosecdef, true, format('%s is SECURITY DEFINER', p.proname))
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'zoom_internal'
  AND p.proname IN (
    'apply_participant_join', 'create_attendance_report_batch',
    'reject_attendance_report_batch', 'promote_attendance_report_batch'
  )
UNION ALL
SELECT is(p.prosecdef, true, 'active surface-authoritative leave is SECURITY DEFINER')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'zoom_internal' AND p.proname = 'apply_participant_leave'
  AND pg_get_function_identity_arguments(p.oid) LIKE 'p_surface_type text%';

SELECT is(p.proowner::regrole::text, 'postgres', format('%s is owned by postgres', p.proname))
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'zoom_internal'
  AND p.proname IN (
    'apply_participant_join', 'create_attendance_report_batch',
    'reject_attendance_report_batch', 'promote_attendance_report_batch'
  )
UNION ALL
SELECT is(p.proowner::regrole::text, 'postgres', 'active leave is owned by postgres')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'zoom_internal' AND p.proname = 'apply_participant_leave'
  AND pg_get_function_identity_arguments(p.oid) LIKE 'p_surface_type text%';

SELECT ok('search_path=""' = ANY(p.proconfig), format('%s fixes an empty search_path', p.proname))
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'zoom_internal'
  AND p.proname IN (
    'apply_participant_join', 'create_attendance_report_batch',
    'reject_attendance_report_batch', 'promote_attendance_report_batch'
  )
UNION ALL
SELECT ok('search_path=""' = ANY(p.proconfig), 'active leave fixes an empty search_path')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'zoom_internal' AND p.proname = 'apply_participant_leave'
  AND pg_get_function_identity_arguments(p.oid) LIKE 'p_surface_type text%';

SET LOCAL ROLE service_role;

-- Real privilege probes, including both forged batch creation shapes.
SELECT throws_ok($$INSERT INTO public.zoom_attendance
  (surface_type, surface_id, school_id, zoom_meeting_uuid, matched_by, joined_at, source)
  VALUES ('consultor_session', 'a9a9a9a9-2000-4000-8000-000000000001', 9919,
          'foreign', 'unmatched', now(), 'webhook')$$, '42501', NULL,
  'service_role cannot forge an attendance interval');
SELECT throws_ok($$UPDATE public.zoom_attendance SET left_at = now()$$,
  '42501', NULL, 'service_role cannot directly close attendance');
SELECT throws_ok($$DELETE FROM public.zoom_attendance$$,
  '42501', NULL, 'service_role cannot delete attendance');
SELECT throws_ok($$TRUNCATE public.zoom_attendance$$,
  '42501', NULL, 'service_role cannot truncate attendance');
SELECT throws_ok($$CREATE TRIGGER r9_forbidden_attendance
  BEFORE INSERT ON public.zoom_attendance FOR EACH STATEMENT
  EXECUTE FUNCTION zoom_internal.enforce_attendance_report_batch_transition()$$,
  '42501', NULL, 'service_role cannot install an attendance trigger');

SELECT throws_ok($$INSERT INTO zoom_internal.zoom_attendance_observations
  (school_id, zoom_meeting_uuid, event_type, source_event_key, outcome)
  VALUES (9919, 'foreign', 'meeting.participant_left', 'r9-forged-observation',
          'no_open_interval')$$, '42501', NULL,
  'service_role cannot forge an observation');
SELECT throws_ok($$UPDATE zoom_internal.zoom_attendance_observations
  SET outcome = 'no_instant'$$, '42501', NULL,
  'service_role cannot update observations');
SELECT throws_ok($$DELETE FROM zoom_internal.zoom_attendance_observations$$,
  '42501', NULL, 'service_role cannot delete observations');
SELECT throws_ok($$TRUNCATE zoom_internal.zoom_attendance_observations$$,
  '42501', NULL, 'service_role cannot truncate observations');
SELECT throws_ok($$CREATE TRIGGER r9_forbidden_observation
  BEFORE INSERT ON zoom_internal.zoom_attendance_observations FOR EACH STATEMENT
  EXECUTE FUNCTION zoom_internal.enforce_attendance_report_batch_transition()$$,
  '42501', NULL, 'service_role cannot install an observation trigger');

SELECT throws_ok($$INSERT INTO zoom_internal.zoom_attendance_report_batches
  (school_id, surface_type, surface_id, zoom_meeting_uuid, status)
  VALUES (9919, 'consultor_session', 'a9a9a9a9-2000-4000-8000-000000000001',
          'r9-exact-occurrence', 'pending')$$, '42501', NULL,
  'service_role cannot directly create a pending batch');
SELECT throws_ok($$INSERT INTO zoom_internal.zoom_attendance_report_batches
  (school_id, surface_type, surface_id, zoom_meeting_uuid, status,
   total_records, row_count)
  VALUES (9919, 'consultor_session', 'a9a9a9a9-2000-4000-8000-000000000001',
          'r9-exact-occurrence', 'complete', 0, 0)$$, '42501', NULL,
  'service_role cannot forge an authoritative empty batch');
SELECT throws_ok($$UPDATE zoom_internal.zoom_attendance_report_batches
  SET status = 'complete', total_records = 0, row_count = 0$$,
  '42501', NULL, 'service_role cannot directly promote a pending batch');
SELECT throws_ok($$DELETE FROM zoom_internal.zoom_attendance_report_batches$$,
  '42501', NULL, 'service_role cannot delete batches');
SELECT throws_ok($$TRUNCATE zoom_internal.zoom_attendance_report_batches$$,
  '42501', NULL, 'service_role cannot truncate batches');
SELECT throws_ok($$CREATE TRIGGER r9_forbidden_batch
  BEFORE INSERT ON zoom_internal.zoom_attendance_report_batches FOR EACH STATEMENT
  EXECUTE FUNCTION zoom_internal.enforce_attendance_report_batch_transition()$$,
  '42501', NULL, 'service_role cannot install a batch trigger');

-- Creation validates exact identity and always returns a pending candidate.
SELECT lives_ok($$SELECT zoom_internal.create_attendance_report_batch(
  9919, 'consultor_session', 'a9a9a9a9-2000-4000-8000-000000000001',
  'r9-exact-occurrence')$$, 'exact occurrence can create a pending batch through RPC');
SELECT ok((SELECT status = 'pending' AND total_records IS NULL AND row_count IS NULL
  FROM zoom_internal.zoom_attendance_report_batches
  WHERE zoom_meeting_uuid = 'r9-exact-occurrence' ORDER BY seq DESC LIMIT 1),
  'creation RPC always creates pending with no authority metadata');
SELECT throws_ok($$SELECT zoom_internal.create_attendance_report_batch(
  9919, 'consultor_session', 'a9a9a9a9-2000-4000-8000-000000000001',
  'r9-foreign-occurrence')$$, 'P0404', NULL,
  'creation RPC rejects a mismatched occurrence');
SELECT is((SELECT count(*)::int FROM zoom_internal.zoom_attendance_report_batches
  WHERE zoom_meeting_uuid = 'r9-foreign-occurrence'), 0,
  'mismatched creation leaves no candidate');

SELECT is(zoom_internal.promote_attendance_report_batch(
  (SELECT id FROM zoom_internal.zoom_attendance_report_batches
    WHERE zoom_meeting_uuid = 'r9-exact-occurrence' ORDER BY seq DESC LIMIT 1),
  '[]'::jsonb, 100, 0, 0, '2026-08-13T11:00:00Z'), 'promoted',
  'promotion alone authorizes an exact empty report');
SELECT ok((SELECT status = 'complete' AND total_records = 0 AND row_count = 0
  FROM zoom_internal.zoom_attendance_report_batches
  WHERE zoom_meeting_uuid = 'r9-exact-occurrence' ORDER BY seq DESC LIMIT 1),
  'authoritative empty report completes with exact zero counts');
SELECT is((SELECT count(*)::int FROM public.zoom_attendance
  WHERE report_batch_id = (SELECT id FROM zoom_internal.zoom_attendance_report_batches
    WHERE zoom_meeting_uuid = 'r9-exact-occurrence' ORDER BY seq DESC LIMIT 1)), 0,
  'authoritative empty promotion inserts exactly zero rows');

SELECT lives_ok($$SELECT zoom_internal.create_attendance_report_batch(
  9919, 'consultor_session', 'a9a9a9a9-2000-4000-8000-000000000001',
  'r9-exact-occurrence')$$, 'retry candidate creation remains allowed');
SELECT is(zoom_internal.reject_attendance_report_batch(
  (SELECT id FROM zoom_internal.zoom_attendance_report_batches
    WHERE zoom_meeting_uuid = 'r9-exact-occurrence' ORDER BY seq DESC LIMIT 1),
  'synthetic failure'), 'rejected', 'rejection RPC resolves pending exactly once');
SELECT is(zoom_internal.reject_attendance_report_batch(
  (SELECT id FROM zoom_internal.zoom_attendance_report_batches
    WHERE zoom_meeting_uuid = 'r9-exact-occurrence' ORDER BY seq DESC LIMIT 1),
  'retry'), 'batch_not_pending', 'replayed rejection cannot rewrite terminal evidence');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
